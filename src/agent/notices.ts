import {
  createUIMessageStreamResponse,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { z } from "zod";

const NoticeMetadata = z.object({ notice: z.literal(true) });

export function isNotice(message: Pick<UIMessage, "metadata">): boolean {
  return NoticeMetadata.safeParse(message.metadata).success;
}

export function noticeText(message: Pick<UIMessage, "parts">): string {
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
}

export function noticeResponse(text: string): Response {
  const id = "notice-1";
  const chunks: UIMessageChunk[] = [
    { type: "start" },
    { type: "message-metadata", messageMetadata: { notice: true } },
    { type: "text-start", id },
    { type: "text-delta", id, delta: text },
    { type: "text-end", id },
    { type: "finish" },
  ];
  return createUIMessageStreamResponse({
    stream: new ReadableStream<UIMessageChunk>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    }),
  });
}

// The agent SDK relays error chunks as plain-text frames that other open tabs
// try to parse as JSON, so a failed turn is sent as a text part marked as a notice.
export function errorsAsNotices(): TransformStream<
  UIMessageChunk,
  UIMessageChunk
> {
  let count = 0;
  return new TransformStream({
    transform(chunk, controller) {
      if (chunk.type !== "error") {
        controller.enqueue(chunk);
        return;
      }
      const id = `notice-${++count}`;
      controller.enqueue({
        type: "message-metadata",
        messageMetadata: { notice: true },
      });
      controller.enqueue({ type: "text-start", id });
      controller.enqueue({ type: "text-delta", id, delta: chunk.errorText });
      controller.enqueue({ type: "text-end", id });
    },
  });
}
