import { describe, expect, it } from "vitest";
import { DEMO_REPOS, planTick } from "../../src/demo/traffic-plan";

function sequence(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length] ?? 0;
}

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2 ** 31;
    return state / 2 ** 31;
  };
}

describe("planTick", () => {
  it("plans two requests per agent against demo repos", () => {
    const planned = planTick(3, 0, seeded(7));
    expect(planned).toHaveLength(6);
    for (const request of planned) {
      const repo = /^\/repos\/(demo\/\w+)/.exec(request.path)?.[1];
      expect(DEMO_REPOS).toContain(repo);
    }
  });

  it("mixes about 70% hot reads, 20% lists and 10% writes", () => {
    const planned = planTick(20, 0, seeded(42)).concat(
      ...Array.from({ length: 49 }, (_, tick) =>
        planTick(20, tick + 1, seeded(tick + 100)),
      ),
    );
    const writes = planned.filter((request) => request.method === "POST");
    const lists = planned.filter((request) =>
      /\/commits|state=all/.test(request.path),
    );
    expect(writes.length / planned.length).toBeCloseTo(0.1, 1);
    expect(lists.length / planned.length).toBeCloseTo(0.2, 1);
  });

  it("gives each write its own idempotency key and an agent token", () => {
    const planned = planTick(2, 5, sequence([0, 0.95, 0]));
    const writes = planned.filter((request) => request.method === "POST");
    expect(writes).toHaveLength(4);
    const keys = writes.map((request) => request.headers["idempotency-key"]);
    expect(new Set(keys).size).toBe(4);
    expect(writes[0]).toMatchObject({
      path: "/repos/demo/api/issues/1/comments",
      headers: { authorization: "token demo-agent-1" },
    });
    expect(writes[2]?.headers.authorization).toBe("token demo-agent-2");
  });

  it("reads without credentials so the public cache is shared", () => {
    const reads = planTick(1, 0, sequence([0.5, 0.1, 0.1])).filter(
      (request) => request.method === "GET",
    );
    expect(reads.length).toBeGreaterThan(0);
    expect(reads[0]?.headers).toEqual({});
  });
});
