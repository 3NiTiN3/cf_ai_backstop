import { useCallback, useEffect, useRef, useState } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import type { UIMessage } from "ai";
import {
  Button,
  Empty,
  InputArea,
  PoweredByCloudflare,
  Switch,
  Text,
} from "@cloudflare/kumo";
import {
  BugIcon,
  ChatCircleDotsIcon,
  CircleIcon,
  PaperPlaneRightIcon,
  StopIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import type { OpsAgent } from "../server";
import { MessagePart } from "./message-part";

function ConnectionStatus({ connected }: { connected: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <CircleIcon
        size={8}
        weight="fill"
        className={connected ? "text-kumo-success" : "text-kumo-danger"}
      />
      <Text size="xs" variant="secondary">
        {connected ? "Connected" : "Disconnected"}
      </Text>
    </div>
  );
}

export function Chat() {
  const [connected, setConnected] = useState(false);
  const [input, setInput] = useState("");
  const [showDebug, setShowDebug] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const agent = useAgent<OpsAgent>({
    agent: "OpsAgent",
    onOpen: useCallback(() => setConnected(true), []),
    onClose: useCallback(() => setConnected(false), []),
    onError: useCallback(
      (error: Event) => console.error("WebSocket error:", error),
      [],
    ),
  });

  const {
    messages,
    sendMessage,
    clearHistory,
    addToolApprovalResponse,
    stop,
    status,
  } = useAgentChat({ agent, experimental_throttle: 100 });

  const isStreaming = status === "streaming" || status === "submitted";

  useEffect(() => {
    const el = scrollRef.current;
    el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!isStreaming) textareaRef.current?.focus({ preventScroll: true });
  }, [isStreaming]);

  const send = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    sendMessage({ role: "user", parts: [{ type: "text", text }] });
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [input, isStreaming, sendMessage]);

  return (
    <div className="flex flex-col h-full bg-kumo-elevated">
      <div className="px-4 py-3 bg-kumo-base border-b border-kumo-line flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-kumo-default">
            Ops chat
          </h2>
          <ConnectionStatus connected={connected} />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <BugIcon size={14} className="text-kumo-inactive" />
            <Switch
              checked={showDebug}
              onCheckedChange={setShowDebug}
              size="sm"
              aria-label="Toggle debug mode"
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={<TrashIcon size={14} />}
            onClick={clearHistory}
          >
            Clear
          </Button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="px-4 py-5 space-y-5">
          {messages.length === 0 && (
            <Empty
              icon={<ChatCircleDotsIcon size={32} />}
              title="Ask about the gateway"
              description="Try asking whether demo/api is healthy, or what just happened."
            />
          )}

          {messages.map((message: UIMessage, index: number) => {
            const isUser = message.role === "user";
            const isLastAssistant =
              message.role === "assistant" && index === messages.length - 1;

            return (
              <div key={message.id} className="space-y-2">
                {showDebug && (
                  <pre className="text-[11px] text-kumo-subtle bg-kumo-control rounded-lg p-3 overflow-auto max-h-64">
                    {JSON.stringify(message, null, 2)}
                  </pre>
                )}
                {message.parts.map((part, i) => (
                  <MessagePart
                    key={`${message.id}-${i}`}
                    part={part}
                    isUser={isUser}
                    isStreaming={isStreaming}
                    isLastAssistant={isLastAssistant}
                    addToolApprovalResponse={addToolApprovalResponse}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-kumo-line bg-kumo-base">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="px-4 py-3"
        >
          <div className="flex items-end gap-3 rounded-xl border border-kumo-line bg-kumo-base p-3 shadow-sm focus-within:ring-2 focus-within:ring-kumo-ring focus-within:border-transparent transition-shadow">
            <InputArea
              ref={textareaRef}
              value={input}
              onValueChange={setInput}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${el.scrollHeight}px`;
              }}
              placeholder="Send a message..."
              disabled={!connected || isStreaming}
              rows={1}
              className="flex-1 ring-0! focus:ring-0! shadow-none! bg-transparent! outline-none! resize-none max-h-40"
            />
            {isStreaming ? (
              <Button
                type="button"
                variant="secondary"
                shape="square"
                aria-label="Stop generation"
                icon={<StopIcon size={18} />}
                onClick={stop}
                className="mb-0.5"
              />
            ) : (
              <Button
                type="submit"
                variant="primary"
                shape="square"
                aria-label="Send message"
                disabled={!input.trim() || !connected}
                icon={<PaperPlaneRightIcon size={18} />}
                className="mb-0.5"
              />
            )}
          </div>
        </form>
        <div className="flex justify-center pb-3">
          <PoweredByCloudflare href="https://developers.cloudflare.com/agents/" />
        </div>
      </div>
    </div>
  );
}
