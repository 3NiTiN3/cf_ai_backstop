import { isToolUIPart, type UIMessage } from "ai";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { BrainIcon, CaretDownIcon } from "@phosphor-icons/react";
import { ToolPartView } from "./tool-part-view";

type Part = UIMessage["parts"][number];

function ReasoningPart({ text, done }: { text: string; done: boolean }) {
  if (!text.trim()) return null;
  return (
    <div className="flex justify-start">
      <details className="max-w-[85%] w-full" open={!done}>
        <summary className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-sm select-none">
          <BrainIcon size={14} className="text-purple-400" />
          <span className="font-medium text-kumo-default">Reasoning</span>
          {done ? (
            <span className="text-xs text-kumo-success">Complete</span>
          ) : (
            <span className="text-xs text-kumo-brand">Thinking...</span>
          )}
          <CaretDownIcon size={14} className="ml-auto text-kumo-inactive" />
        </summary>
        <pre
          tabIndex={0}
          className="mt-2 px-3 py-2 rounded-lg bg-kumo-control text-xs text-kumo-default whitespace-pre-wrap overflow-auto max-h-64"
        >
          {text}
        </pre>
      </details>
    </div>
  );
}

function UserText({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] px-4 py-2.5 rounded-2xl rounded-br-md bg-kumo-contrast text-kumo-inverse leading-relaxed">
        {text}
      </div>
    </div>
  );
}

function AssistantText({
  text,
  animating,
}: {
  text: string;
  animating: boolean;
}) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-kumo-base text-kumo-default leading-relaxed">
        <Streamdown
          className="sd-theme rounded-2xl rounded-bl-md p-3"
          plugins={{ code }}
          controls={false}
          isAnimating={animating}
        >
          {text}
        </Streamdown>
      </div>
    </div>
  );
}

export function MessagePart({
  part,
  isUser,
  isStreaming,
  isLastAssistant,
  addToolApprovalResponse,
}: {
  part: Part;
  isUser: boolean;
  isStreaming: boolean;
  isLastAssistant: boolean;
  addToolApprovalResponse: (response: {
    id: string;
    approved: boolean;
  }) => void;
}) {
  if (isToolUIPart(part)) {
    return (
      <ToolPartView
        part={part}
        addToolApprovalResponse={addToolApprovalResponse}
      />
    );
  }

  if (part.type === "reasoning") {
    return (
      <ReasoningPart
        text={part.text}
        done={part.state === "done" || !isStreaming}
      />
    );
  }

  if (part.type === "text" && part.text) {
    return isUser ? (
      <UserText text={part.text} />
    ) : (
      <AssistantText
        text={part.text}
        animating={isLastAssistant && isStreaming}
      />
    );
  }

  return null;
}
