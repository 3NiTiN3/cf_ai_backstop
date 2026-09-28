import type { QueueChange } from "../gateway/queue-control";
import type { RepoGateway } from "../gateway/repo-gateway";
import type { ReplayTarget } from "../gateway/replay-trigger";
import { jsonError } from "../gateway/responses";

export interface RepoAction {
  path: RegExp;
  method: string;
  admin: boolean;
  run: (
    gateway: DurableObjectStub<RepoGateway>,
    target: ReplayTarget,
    params: string[],
  ) => Promise<Response>;
}

const WRITE_ID = "([A-Za-z0-9-]{1,64})";

export const REPO_ACTIONS: RepoAction[] = [
  {
    path: /^$/,
    method: "GET",
    admin: false,
    run: async (gateway, target) =>
      Response.json({ ...target, ...(await gateway.getHealth()) }),
  },
  {
    path: /^replay$/,
    method: "POST",
    admin: true,
    run: async (gateway, target) =>
      Response.json(await gateway.triggerReplay(target)),
  },
  {
    path: /^pause$/,
    method: "POST",
    admin: true,
    run: async (gateway, target) =>
      Response.json(await gateway.setWritesPaused(target, true)),
  },
  {
    path: /^resume$/,
    method: "POST",
    admin: true,
    run: async (gateway, target) =>
      Response.json(await gateway.setWritesPaused(target, false)),
  },
  {
    path: /^queue$/,
    method: "GET",
    admin: false,
    run: async (gateway) => Response.json(await gateway.listQueue()),
  },
  {
    path: new RegExp(`^queue/${WRITE_ID}/retry$`),
    method: "POST",
    admin: true,
    run: async (gateway, target, [id = ""]) =>
      changeResponse(await gateway.retryQueuedWrite(target, id)),
  },
  {
    path: new RegExp(`^queue/${WRITE_ID}/drop$`),
    method: "POST",
    admin: true,
    run: async (gateway, _target, [id = ""]) =>
      changeResponse(await gateway.dropQueuedWrite(id)),
  },
];

function changeResponse(change: QueueChange): Response {
  return change.ok
    ? Response.json(change.item)
    : jsonError(change.status, change.message);
}
