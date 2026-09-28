import type { ReactNode } from "react";

export function PanelBody<T>({
  data,
  error,
  what,
  skeletonClass,
  children,
}: {
  data: T | null;
  error: string | null;
  what: string;
  skeletonClass: string;
  children: (data: T) => ReactNode;
}) {
  if (data === null) {
    if (error) {
      return (
        <p role="alert" className="text-sm text-kumo-danger">
          Could not load {what}: {error}
        </p>
      );
    }
    return (
      <div
        role="status"
        className={`animate-pulse rounded-xl bg-kumo-control ${skeletonClass}`}
      >
        <span className="sr-only">Loading {what}</span>
      </div>
    );
  }
  return (
    <>
      {error && (
        <p role="status" className="text-xs text-kumo-danger">
          Could not refresh {what}: {error}. Showing the last data loaded.
        </p>
      )}
      {children(data)}
    </>
  );
}
