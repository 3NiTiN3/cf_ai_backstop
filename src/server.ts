import { routeAgentRequest } from "agents";
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import { convertToModelMessages, pruneMessages, streamText } from "ai";
import { chatModel } from "./agent/model";
import { handleApiRequest } from "./api/handler";
import { handleGatewayRequest } from "./gateway/handler";
import { jsonError } from "./gateway/responses";

export { RepoGateway } from "./gateway/repo-gateway";
export { Registry } from "./gateway/registry";
export { ReplayWorkflow } from "./workflows/replay";

export class OpsAgent extends AIChatAgent<Env> {
  override maxPersistedMessages = 100;
  override chatRecovery = true;

  override async onChatMessage(
    _onFinish: unknown,
    options?: OnChatMessageOptions,
  ) {
    const result = streamText({
      model: chatModel(this.env.AI, this.sessionAffinity),
      system: "You are a helpful assistant.",
      messages: pruneMessages({
        messages: await convertToModelMessages(this.messages),
        toolCalls: "before-last-2-messages",
        reasoning: "before-last-message",
      }),
      abortSignal: options?.abortSignal,
    });

    return result.toUIMessageStreamResponse();
  }
}

export default {
  async fetch(request: Request, env: Env) {
    return (
      (await handleGatewayRequest(request, env)) ??
      (await handleApiRequest(request, env)) ??
      (await routeAgentRequest(request, env)) ??
      jsonError(404, "Not Found")
    );
  },
} satisfies ExportedHandler<Env>;
