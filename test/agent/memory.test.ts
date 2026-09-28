import { runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { getAgentByName } from "agents";
import { describe, expect, it } from "vitest";
import { createMemoryTools } from "../../src/agent/memory-tools";
import {
  INITIAL_OPS_STATE,
  readOpsState,
  type OpsState,
} from "../../src/agent/state";
import type { OpsAgent } from "../../src/server";

const OPTIONS = { toolCallId: "call-1", messages: [] };

interface Socket {
  send: (message: unknown) => void;
  next: (type: string) => Promise<Record<string, unknown>>;
  close: () => void;
}

async function connect(room: string): Promise<Socket> {
  const response = await exports.default.fetch(
    `http://backstop.test/agents/ops-agent/${room}`,
    { headers: { Upgrade: "websocket" } },
  );
  const ws = response.webSocket;
  if (!ws) throw new Error("no websocket");
  const received: Record<string, unknown>[] = [];
  ws.addEventListener("message", (event) => {
    received.push(JSON.parse(String(event.data)));
  });
  ws.accept();
  return {
    send: (message) => ws.send(JSON.stringify(message)),
    next: async (type) => {
      for (let i = 0; i < 50; i++) {
        const index = received.findIndex((message) => message.type === type);
        if (index >= 0) return received.splice(index, 1)[0] ?? {};
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error(`no ${type} message`);
    },
    close: () => ws.close(),
  };
}

async function storedState(room: string): Promise<OpsState> {
  const agent = await getAgentByName(env.OpsAgent, room);
  return runInDurableObject(agent, async (instance: OpsAgent) =>
    readOpsState(instance.state),
  );
}

describe("watchRepo tool", () => {
  it("saves the normalised repo and reports the list", async () => {
    let state: OpsState = INITIAL_OPS_STATE;
    const { watchRepo } = createMemoryTools({
      state: () => state,
      save: (next) => (state = next),
    });
    const run = (input: { repo: string; watch: boolean }) =>
      watchRepo.execute?.(input, OPTIONS);

    expect(await run({ repo: "Demo/API", watch: true })).toEqual({
      watchedRepos: ["demo/api"],
    });
    expect(await run({ repo: "not a repo", watch: true })).toEqual({
      error: "not a repo is not an owner/name repo",
    });
    expect(state.watchedRepos).toEqual(["demo/api"]);
  });
});

describe("OpsAgent state", () => {
  it("keeps watched repos across connections", async () => {
    const agent = await getAgentByName(env.OpsAgent, "memory-keep");
    await runInDurableObject(agent, async (instance: OpsAgent) => {
      instance.setState({ ...INITIAL_OPS_STATE, watchedRepos: ["demo/api"] });
    });

    const socket = await connect("memory-keep");
    expect(await socket.next("cf_agent_state")).toMatchObject({
      state: { watchedRepos: ["demo/api"] },
    });
    socket.close();
  });

  it("rejects state pushed by a client", async () => {
    const socket = await connect("memory-client");
    await socket.next("cf_agent_state");
    socket.send({
      type: "cf_agent_state",
      state: { ...INITIAL_OPS_STATE, namespace: "live" },
    });
    await socket.next("cf_agent_state_error");
    socket.close();
    expect(await storedState("memory-client")).toEqual(INITIAL_OPS_STATE);
  });
});
