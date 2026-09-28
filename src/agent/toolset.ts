import { createIncidentTools } from "./incident-tools";
import { createMemoryTools } from "./memory-tools";
import type { OpsState } from "./state";
import { createOpsTools } from "./tools";

export interface AgentToolContext {
  env: Env;
  state: () => OpsState;
  save: (state: OpsState) => void;
}

export function createAgentTools(context: AgentToolContext) {
  return {
    ...createOpsTools({
      env: context.env,
      namespace: () => context.state().namespace,
    }),
    ...createMemoryTools(context),
    ...createIncidentTools(context),
  };
}
