import { z } from "zod";
import { runEvalTurn } from "../agent/eval";
import { CHAT_MODEL } from "../agent/model";
import { jsonError } from "../gateway/responses";
import { readJson } from "./body";

const EvalRequest = z.strictObject({
  question: z.string().min(1).max(500),
});

export async function postDevEval(
  request: Request,
  env: Env,
): Promise<Response> {
  if (env.ENVIRONMENT !== "dev") return jsonError(404, "Not Found");
  if (request.method !== "POST") {
    return jsonError(405, "Method Not Allowed");
  }
  const body = await readJson(request, EvalRequest);
  if (!body.ok) return body.error;
  const turn = await runEvalTurn(env, body.data.question);
  return Response.json({ model: CHAT_MODEL, ...turn });
}
