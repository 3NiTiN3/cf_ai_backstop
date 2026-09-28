import { routeAgentRequest } from "agents";
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import { convertToModelMessages, pruneMessages, streamText } from "ai";
import { chatModel } from "./agent/model";

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
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
