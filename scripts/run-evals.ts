import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";

const BASE_URL = process.env.BACKSTOP_URL ?? "http://localhost:5173";
const ANY_TOOL = "*";

const Case = z.object({
  id: z.string(),
  question: z.string(),
  expectTools: z.array(z.string()),
  forbidTools: z.array(z.string()),
});

const Turn = z.object({
  model: z.string(),
  toolCalls: z.array(z.object({ toolName: z.string() })),
});

type Case = z.infer<typeof Case>;

interface Scored {
  testCase: Case;
  called: string[];
  passed: boolean;
}

async function ask(question: string): Promise<z.infer<typeof Turn>> {
  const response = await fetch(`${BASE_URL}/api/dev/eval`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!response.ok) {
    throw new Error(`eval endpoint returned ${response.status}`);
  }
  return Turn.parse(await response.json());
}

function score(testCase: Case, called: string[]): boolean {
  const expected = testCase.expectTools.every((tool) => called.includes(tool));
  const forbidden = called.some(
    (tool) =>
      testCase.forbidTools.includes(tool) ||
      testCase.forbidTools.includes(ANY_TOOL),
  );
  return expected && !forbidden;
}

function list(tools: string[]): string {
  return tools.length === 0 ? "none" : tools.join(", ");
}

function report(model: string, results: Scored[]): string {
  const passed = results.filter((result) => result.passed).length;
  const rate = Math.round((passed / results.length) * 1000) / 10;
  const rows = results.map(
    ({ testCase, called, passed: ok }) =>
      `| ${testCase.id} | ${testCase.question} | ${list(testCase.expectTools)} | ${list(testCase.forbidTools)} | ${list(called)} | ${ok ? "pass" : "fail"} |`,
  );
  return [
    "# Tool-selection eval results",
    "",
    `- Model: \`${model}\``,
    `- Date: ${new Date().toISOString().slice(0, 10)}`,
    `- Pass rate: ${rate}% (${passed} of ${results.length})`,
    "",
    "A case passes when every expected tool is called and no forbidden tool is called. `*` forbids any tool.",
    "",
    "| Case | Question | Expected | Forbidden | Called | Result |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

async function main(): Promise<void> {
  const cases = z
    .array(Case)
    .parse(JSON.parse(await readFile("evals/cases.json", "utf8")));
  const results: Scored[] = [];
  let model = "unknown";
  for (const testCase of cases) {
    const turn = await ask(testCase.question);
    model = turn.model;
    const called = turn.toolCalls.map((call) => call.toolName);
    const passed = score(testCase, called);
    results.push({ testCase, called, passed });
    console.log(
      `${passed ? "pass" : "FAIL"}  ${testCase.id.padEnd(18)} ${list(called)}`,
    );
  }
  const markdown = report(model, results);
  await writeFile("evals/results.md", markdown);
  console.log(markdown.split("\n")[4]);
}

await main();
