import { useCallback } from "react";
import type { Namespace } from "../gateway/routes";
import { getJson } from "./api-client";
import { OverviewSchema } from "./overview-data";
import { usePoll } from "./use-poll";

export function useOverview(namespace: Namespace) {
  const load = useCallback(
    (signal: AbortSignal) =>
      getJson(`/api/overview?namespace=${namespace}`, OverviewSchema, signal),
    [namespace],
  );
  return usePoll(namespace, load);
}
