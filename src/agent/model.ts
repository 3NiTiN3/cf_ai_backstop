import { simulateStreamingMiddleware, wrapLanguageModel } from "ai";
import { createWorkersAI } from "workers-ai-provider";

export const CHAT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

// Llama 3.3 stream chunks carry both `response` and `choices[].delta`, and
// workers-ai-provider emits both, doubling text and tool arguments
// (cloudflare/ai#663). The non-streaming path is correct.
export function chatModel(ai: Ai, sessionAffinity: string) {
  const workersai = createWorkersAI({ binding: ai });
  return wrapLanguageModel({
    model: workersai(CHAT_MODEL, { sessionAffinity }),
    middleware: simulateStreamingMiddleware(),
  });
}
