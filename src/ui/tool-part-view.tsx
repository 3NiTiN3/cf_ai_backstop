import type { ReactNode } from "react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { Badge, Button, Surface, Text } from "@cloudflare/kumo";
import { CheckCircleIcon, GearIcon, XCircleIcon } from "@phosphor-icons/react";

type ApprovalResponder = (response: { id: string; approved: boolean }) => void;

function ToolIO({ label, value }: { label: string; value: unknown }) {
  if (value === undefined || value === null) return null;
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  if (!text) return null;
  return (
    <div className="mt-1">
      <Text size="xs" variant="secondary" bold>
        {label}
      </Text>
      <pre className="mt-0.5 font-mono text-xs text-kumo-subtle whitespace-pre-wrap overflow-auto max-h-64">
        {text}
      </pre>
    </div>
  );
}

function ToolCard({ ring, children }: { ring: string; children: ReactNode }) {
  return (
    <div className="flex justify-start">
      <Surface className={`max-w-[85%] px-4 py-2.5 rounded-xl ${ring}`}>
        {children}
      </Surface>
    </div>
  );
}

function ApprovalRequest({
  toolName,
  input,
  approvalId,
  respond,
}: {
  toolName: string;
  input: unknown;
  approvalId: string | undefined;
  respond: ApprovalResponder;
}) {
  const answer = (approved: boolean) => {
    if (approvalId) respond({ id: approvalId, approved });
  };
  return (
    <ToolCard ring="ring-2 ring-kumo-warning">
      <div className="flex items-center gap-2 mb-2">
        <GearIcon size={14} className="text-kumo-warning" />
        <Text size="sm" bold>
          Approval needed: {toolName}
        </Text>
      </div>
      <div className="font-mono mb-3">
        <Text size="xs" variant="secondary">
          {JSON.stringify(input, null, 2)}
        </Text>
      </div>
      <div className="flex gap-2">
        <Button
          variant="primary"
          size="sm"
          icon={<CheckCircleIcon size={14} />}
          onClick={() => answer(true)}
        >
          Approve
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={<XCircleIcon size={14} />}
          onClick={() => answer(false)}
        >
          Reject
        </Button>
      </div>
    </ToolCard>
  );
}

function isRejected(part: UIMessage["parts"][number]) {
  if (!isToolUIPart(part)) return false;
  if (part.state === "output-denied") return true;
  return (
    "approval" in part &&
    (part.approval as { approved?: boolean } | undefined)?.approved === false
  );
}

export function ToolPartView({
  part,
  addToolApprovalResponse,
}: {
  part: UIMessage["parts"][number];
  addToolApprovalResponse: ApprovalResponder;
}) {
  if (!isToolUIPart(part)) return null;
  const toolName = getToolName(part);

  if (part.state === "output-available") {
    return (
      <ToolCard ring="ring ring-kumo-line">
        <div className="flex items-center gap-2 mb-1">
          <GearIcon size={14} className="text-kumo-inactive" />
          <Text size="xs" variant="secondary" bold>
            {toolName}
          </Text>
          <Badge variant="secondary">Done</Badge>
        </div>
        <ToolIO label="Input" value={part.input} />
        <ToolIO label="Output" value={part.output} />
      </ToolCard>
    );
  }

  if ("approval" in part && part.state === "approval-requested") {
    return (
      <ApprovalRequest
        toolName={toolName}
        input={part.input}
        approvalId={(part.approval as { id?: string } | undefined)?.id}
        respond={addToolApprovalResponse}
      />
    );
  }

  if (isRejected(part)) {
    return (
      <ToolCard ring="ring ring-kumo-line">
        <div className="flex items-center gap-2">
          <XCircleIcon size={14} className="text-kumo-danger" />
          <Text size="xs" variant="secondary" bold>
            {toolName}
          </Text>
          <Badge variant="secondary">Rejected</Badge>
        </div>
      </ToolCard>
    );
  }

  if (part.state === "output-error") {
    return (
      <ToolCard ring="ring-2 ring-kumo-danger">
        <div className="flex items-center gap-2 mb-1">
          <XCircleIcon size={14} className="text-kumo-danger" />
          <Text size="xs" variant="secondary" bold>
            {toolName}
          </Text>
          <Badge variant="destructive">Error</Badge>
        </div>
        <div className="font-mono">
          <Text size="xs" variant="secondary">
            {part.errorText || "Tool call failed"}
          </Text>
        </div>
      </ToolCard>
    );
  }

  if (part.state === "input-available" || part.state === "input-streaming") {
    return (
      <ToolCard ring="ring ring-kumo-line">
        <div className="flex items-center gap-2">
          <GearIcon size={14} className="text-kumo-inactive animate-spin" />
          <Text size="xs" variant="secondary">
            Running {toolName}...
          </Text>
        </div>
        <ToolIO label="Input" value={part.input} />
      </ToolCard>
    );
  }

  return null;
}
