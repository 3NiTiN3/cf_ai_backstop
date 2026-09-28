import type { UIMessageChunk } from "ai";
import { describe, expect, it } from "vitest";
import { errorsAsNotices, isNotice, noticeText } from "../../src/agent/notices";

async function run(chunks: UIMessageChunk[]): Promise<UIMessageChunk[]> {
  const out: UIMessageChunk[] = [];
  const reader = new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  })
    .pipeThrough(errorsAsNotices())
    .getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return out;
    out.push(value);
  }
}

describe("errorsAsNotices", () => {
  it("turns an error chunk into a text part marked as a notice", async () => {
    expect(
      await run([
        { type: "start" },
        { type: "error", errorText: "Allowance used up." },
        { type: "finish" },
      ]),
    ).toEqual([
      { type: "start" },
      { type: "message-metadata", messageMetadata: { notice: true } },
      { type: "text-start", id: "notice-1" },
      { type: "text-delta", id: "notice-1", delta: "Allowance used up." },
      { type: "text-end", id: "notice-1" },
      { type: "finish" },
    ]);
  });

  it("passes other chunks through unchanged", async () => {
    const chunks: UIMessageChunk[] = [
      { type: "text-start", id: "t" },
      { type: "text-delta", id: "t", delta: "hi" },
      { type: "text-end", id: "t" },
    ];
    expect(await run(chunks)).toEqual(chunks);
  });
});

describe("isNotice", () => {
  it("recognises only messages marked as notices", () => {
    expect(isNotice({ metadata: { notice: true } })).toBe(true);
    expect(isNotice({ metadata: undefined })).toBe(false);
    expect(isNotice({ metadata: { notice: "yes" } })).toBe(false);
  });

  it("joins the text parts of a notice", () => {
    expect(
      noticeText({
        parts: [
          { type: "step-start" },
          { type: "text", text: "Allowance used up. " },
        ],
      }),
    ).toBe("Allowance used up.");
  });
});
