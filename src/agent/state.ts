import type { Namespace } from "../gateway/routes";

export type OpsState = {
  namespace: Namespace;
  watchedRepos: string[];
};

export const INITIAL_OPS_STATE: OpsState = {
  namespace: "demo",
  watchedRepos: [],
};
