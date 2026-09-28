import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

const root = process.cwd();
const projectsDir = process.env.CLAUDE_PROJECTS_DIR ?? join(homedir(), ".claude", "projects");
const planningFile = join(root, "build", "PLANNING_PROMPTS.md");
const outputFile = join(root, "PROMPTS.md");

const noise = /^(<command-|<local-command|<system-reminder|<bash-|Caveat:|\[Request interrupted)/;

function slug(value) {
  return value.replace(/[^a-zA-Z0-9]/g, "-");
}

function transcriptDirs() {
  if (!existsSync(projectsDir)) return [];
  const dirs = readdirSync(projectsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const exact = dirs.filter((name) => name === slug(root));
  const matches = exact.length > 0 ? exact : dirs.filter((name) => name.endsWith(slug(basename(root))));
  return matches.map((name) => join(projectsDir, name));
}

function textOf(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part && part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
}

function readSession(file) {
  const prompts = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.type !== "user" || entry.isMeta || entry.isSidechain) continue;
    if (entry.message?.role !== "user") continue;
    const text = textOf(entry.message.content).trim();
    if (!text || noise.test(text)) continue;
    prompts.push({ at: entry.timestamp ?? "", text });
  }
  return prompts;
}

function quote(text) {
  return text
    .split("\n")
    .map((line) => (line.length > 0 ? `> ${line}` : ">"))
    .join("\n");
}

function formatTime(iso) {
  if (!iso) return "unknown time";
  return iso.replace("T", " ").slice(0, 16) + " UTC";
}

const sessions = transcriptDirs()
  .flatMap((dir) =>
    readdirSync(dir)
      .filter((name) => name.endsWith(".jsonl"))
      .map((name) => readSession(join(dir, name))),
  )
  .filter((prompts) => prompts.length > 0)
  .map((prompts) => prompts.sort((a, b) => a.at.localeCompare(b.at)))
  .sort((a, b) => a[0].at.localeCompare(b[0].at));

const parts = [
  "# Prompt history",
  "",
  "This project was built with AI-assisted coding using Claude Code in VS Code.",
  "",
  "The build was driven by a structured plan in `build/`: `GOAL.md`, `ORCHESTRATOR.md`, the phase files in `build/phases/` and `VALIDATION.md`. Those files are prompts too, and they are the main instructions the coding agent followed.",
  "",
  "Below are the planning prompts, followed by every prompt I typed during the build, exported from Claude Code session transcripts with `scripts/export-prompts.mjs`.",
  "",
];

if (existsSync(planningFile)) {
  const planning = readFileSync(planningFile, "utf8").replace(/^# .*\n/, "").trim();
  parts.push("## Planning", "", planning, "");
}

sessions.forEach((prompts, index) => {
  parts.push(`## Build session ${index + 1}`, "");
  for (const prompt of prompts) {
    parts.push(`**${formatTime(prompt.at)}**`, "", quote(prompt.text), "");
  }
});

if (sessions.length === 0) {
  parts.push("## Build sessions", "", "No Claude Code transcripts were found for this folder yet.", "");
}

writeFileSync(outputFile, parts.join("\n"));

const count = sessions.reduce((sum, prompts) => sum + prompts.length, 0);
console.log(`Wrote ${outputFile} with ${sessions.length} sessions and ${count} prompts.`);
