import { useState } from "react";
import { Button } from "@cloudflare/kumo";
import { PlayIcon, StopIcon } from "@phosphor-icons/react";
import { Section } from "./section";
import {
  playStory,
  stopStory,
  storyCaption,
  storySteps,
  useStory,
  type StepState,
} from "./story-data";

const DOT: Record<StepState, string> = {
  done: "bg-kumo-success",
  current: "bg-kumo-brand animate-pulse",
  upcoming: "bg-kumo-control",
};

export function StoryPanel() {
  const story = useStory();
  const [failure, setFailure] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const step = story.data?.step ?? "idle";
  const running = story.data?.running ?? false;

  const act = async (action: () => Promise<void>) => {
    setStarting(true);
    setFailure(null);
    try {
      await action();
      story.refresh();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setStarting(false);
    }
  };

  return (
    <Section
      id="story-heading"
      title="Outage story"
      aside={
        running ? (
          <StopButton disabled={starting} onClick={() => void act(stopStory)} />
        ) : (
          <Button
            variant="primary"
            size="sm"
            icon={<PlayIcon size={14} weight="fill" />}
            disabled={starting || story.data === null}
            onClick={() => void act(playStory)}
          >
            Play the outage story
          </Button>
        )
      }
    >
      <div className="rounded-xl border border-kumo-line bg-kumo-base px-4 py-3 space-y-2">
        <ol aria-label="Story steps" className="grid grid-cols-4 gap-2">
          {storySteps(step).map(({ step: id, label, state }) => (
            <li
              key={id}
              aria-current={state === "current" ? "step" : undefined}
              className="flex items-center gap-2 text-xs"
            >
              <span
                aria-hidden
                className={`size-2 shrink-0 rounded-full ${DOT[state]}`}
              />
              <span
                className={
                  state === "upcoming"
                    ? "text-kumo-subtle"
                    : "font-medium text-kumo-default"
                }
              >
                {label}
              </span>
            </li>
          ))}
        </ol>
        <p role="status" className="text-sm text-kumo-subtle">
          {storyCaption(step)}
        </p>
      </div>
      {failure && (
        <p role="alert" className="text-xs text-kumo-danger">
          {failure}
        </p>
      )}
    </Section>
  );
}

function StopButton({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label="Stop the outage story"
      disabled={disabled}
      onClick={onClick}
      className="group inline-flex h-6.5 min-w-24 items-center justify-center gap-1.5 rounded-md bg-kumo-brand px-3 text-xs font-medium text-white transition-colors hover:bg-coral focus-visible:bg-coral focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kumo-focus active:scale-[0.97] disabled:opacity-60"
    >
      <span className="size-1.5 rounded-full bg-white animate-pulse group-hover:hidden group-focus-visible:hidden" />
      <StopIcon
        size={12}
        weight="fill"
        className="hidden group-hover:block group-focus-visible:block"
      />
      <span className="group-hover:hidden group-focus-visible:hidden">
        Playing
      </span>
      <span className="hidden group-hover:inline group-focus-visible:inline">
        Stop
      </span>
    </button>
  );
}
