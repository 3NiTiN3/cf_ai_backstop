import type { Namespace } from "../gateway/routes";
import { createIncidentTools } from "./incident-tools";
import { createMemoryTools } from "./memory-tools";
import type { OpsState } from "./state";
import { createOpsTools } from "./tools";

export interface AgentToolContext {
  env: Env;
  namespace: Namespace;
  state: () => OpsState;
  save: (state: OpsState) => void;
}

export function createAgentTools(context: AgentToolContext) {
  return {
    ...createOpsTools({
      env: context.env,
      namespace: () => context.namespace,
    }),
    ...createMemoryTools(context),
    ...createIncidentTools(context),
  };
}
