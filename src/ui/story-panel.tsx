import { useState } from "react";
import { Button } from "@cloudflare/kumo";
import { PlayIcon, StopIcon } from "@phosphor-icons/react";
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
  upcoming: "bg-kumo-line",
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
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          <h2 id="story-heading" className="text-subhead text-kumo-subtle">
            Outage story
          </h2>
          <ol
            aria-label="Story steps"
            className="flex flex-wrap items-center gap-1.5"
          >
            {storySteps(step).map(({ step: id, label, state }, index) => (
              <li
                key={id}
                aria-current={state === "current" ? "step" : undefined}
                className="flex items-center gap-1.5 text-caption"
              >
                {index > 0 && (
                  <span
                    aria-hidden
                    className={`h-px w-4 transition-colors duration-500 ${state === "upcoming" ? "bg-kumo-line" : "bg-kumo-success"}`}
                  />
                )}
                <span
                  aria-hidden
                  className={`size-2 shrink-0 rounded-full transition-colors duration-500 ${DOT[state]}`}
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
        </div>
        {running ? (
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
        )}
      </div>
      <p
        key={step}
        role="status"
        className="animate-enter text-body text-kumo-subtle"
      >
        {storyCaption(step)}
      </p>
      {failure && (
        <p role="alert" className="text-caption text-kumo-danger">
          {failure}
        </p>
      )}
    </div>
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
      className="group inline-flex h-6.5 min-w-24 items-center justify-center gap-1.5 rounded-md bg-kumo-brand px-3 text-caption font-medium text-white transition-colors hover:bg-coral focus-visible:bg-coral focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kumo-focus active:scale-[0.97] disabled:opacity-60"
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
