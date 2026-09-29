import type { ReactNode } from "react";

export function Section({
  id,
  title,
  aside,
  level = 2,
  children,
}: {
  id: string;
  title: ReactNode;
  aside?: ReactNode;
  level?: 2 | 3;
  children: ReactNode;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <section aria-labelledby={id} className="space-y-2">
      <div className="flex min-h-7 flex-wrap items-center justify-between gap-2">
        <Heading
          id={id}
          className={
            level === 2
              ? "text-heading text-kumo-default"
              : "text-subhead text-kumo-subtle"
          }
        >
          {title}
        </Heading>
        {aside}
      </div>
      {children}
    </section>
  );
}
