import { routeAgentRequest } from "agents";
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import type { Connection } from "agents";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  pruneMessages,
  stepCountIs,
  streamText,
} from "ai";
import { chatErrorMessage } from "./agent/errors";
import { chatModel } from "./agent/model";
import { errorsAsNotices, isNotice } from "./agent/notices";
import { buildSystemPrompt } from "./agent/prompt";
import { answerAfterTools } from "./agent/steps";
import { INITIAL_OPS_STATE, readOpsState, type OpsState } from "./agent/state";
import { createAgentTools } from "./agent/toolset";
import { requestedNamespace } from "./agent/inputs";
import { handleApiRequest } from "./api/handler";
import { handleGatewayRequest } from "./gateway/handler";
import { handleMcpRequest } from "./mcp/handler";
import { jsonError } from "./gateway/responses";

export { RepoGateway } from "./gateway/repo-gateway";
export { Registry } from "./gateway/registry";
export { ReplayWorkflow } from "./workflows/replay";

const MAX_STEPS = 5;

export class OpsAgent extends AIChatAgent<Env, OpsState> {
  override initialState = INITIAL_OPS_STATE;
  override maxPersistedMessages = 100;
  override chatRecovery = true;

  override async onChatMessage(
    _onFinish: unknown,
    options?: OnChatMessageOptions,
  ) {
    const state = readOpsState(this.state);
    const namespace = requestedNamespace(options?.body) ?? state.namespace;
    const result = streamText({
      model: chatModel(this.env.AI, this.sessionAffinity),
      system: buildSystemPrompt({ ...state, namespace }),
      messages: pruneMessages({
        messages: await convertToModelMessages(
          this.messages.filter((message) => !isNotice(message)),
        ),
        toolCalls: "before-last-2-messages",
        reasoning: "before-last-message",
      }),
      tools: createAgentTools({
        env: this.env,
        namespace,
        state: () => readOpsState(this.state),
        save: (next) => this.setState(next),
      }),
      prepareStep: answerAfterTools,
      stopWhen: stepCountIs(MAX_STEPS),
      abortSignal: options?.abortSignal,
    });

    return createUIMessageStreamResponse({
      stream: result
        .toUIMessageStream({ onError: chatErrorMessage })
        .pipeThrough(errorsAsNotices()),
    });
  }

  // Browsers can push state over the socket; only the agent's own tools may change it.
  override validateStateChange(
    _next: OpsState,
    source: Connection | "server",
  ): void {
    if (source !== "server") throw new Error("State is read-only for clients");
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return (
      (await handleGatewayRequest(request, env)) ??
      (await handleMcpRequest(request, env, ctx)) ??
      (await handleApiRequest(request, env)) ??
      (await routeAgentRequest(request, env)) ??
      jsonError(404, "Not Found")
    );
  },
} satisfies ExportedHandler<Env>;
