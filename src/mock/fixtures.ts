export interface RepoSpec {
  name: string;
  description: string;
  language: string;
  files: Record<string, string>;
  issues: string[];
  pulls: string[];
  commits: string[];
}

export const MOCK_OWNER = "demo";

const USERS = ["octo-dev", "maria-k", "lee-ops", "ci-bot"];
const LABELS = ["bug", "enhancement", "ci", "docs"];
const LABEL_COLORS: Record<string, string> = {
  bug: "d73a4a",
  enhancement: "a2eeef",
  ci: "0e8a16",
  docs: "0075ca",
};
const EPOCH = Date.UTC(2026, 8, 1);
const HOUR = 3_600_000;

const SPECS: RepoSpec[] = [
  {
    name: "api",
    description: "Public HTTP API for the demo platform",
    language: "TypeScript",
    files: {
      "README.md": "# api\n\nHTTP API for the demo platform.\n",
      "package.json": '{\n  "name": "api",\n  "version": "1.4.0"\n}\n',
      "src/index.ts": 'export { router } from "./routes/users";\n',
      "src/routes/users.ts": "export const router = new Map();\n",
    },
    issues: [
      "Rate limit headers missing on 429",
      "Add pagination to /users",
      "Flaky integration test in CI",
      "Document auth scopes",
      "Timeout on large exports",
    ],
    pulls: [
      "Add cursor pagination",
      "Retry idempotent requests",
      "Bump zod to v4",
    ],
    commits: [
      "Add users route",
      "Fix header casing",
      "Add export endpoint",
      "Tighten input validation",
      "Release 1.4.0",
    ],
  },
  {
    name: "web",
    description: "Web frontend for the demo platform",
    language: "TypeScript",
    files: {
      "README.md": "# web\n\nReact frontend.\n",
      "package.json": '{\n  "name": "web",\n  "version": "2.1.0"\n}\n',
      "src/app.tsx": "export function App() {\n  return null;\n}\n",
    },
    issues: [
      "Dark mode contrast on buttons",
      "Settings page crashes on reload",
      "Add loading skeletons",
    ],
    pulls: ["Move to React 19", "Fix settings crash"],
    commits: [
      "Initial layout",
      "Add settings page",
      "Dark mode tokens",
      "Release 2.1.0",
    ],
  },
  {
    name: "infra",
    description: "Terraform for the demo platform",
    language: "HCL",
    files: {
      "README.md": "# infra\n\nTerraform modules.\n",
      "main.tf": 'module "network" {\n  source = "./modules/network"\n}\n',
      "modules/network/main.tf": 'resource "null_resource" "vpc" {}\n',
    },
    issues: ["Pin provider versions", "Split state per environment"],
    pulls: ["Add staging workspace"],
    commits: ["Bootstrap modules", "Add network module", "Pin providers"],
  },
];

export function findRepo(owner: string, name: string): RepoSpec | undefined {
  if (owner.toLowerCase() !== MOCK_OWNER) return undefined;
  return SPECS.find((spec) => spec.name === name.toLowerCase());
}

export function fakeSha(seed: string): string {
  let out = "";
  for (let salt = 0; out.length < 40; salt++) {
    out += fnv1a(`${salt}:${seed}`).toString(16).padStart(8, "0");
  }
  return out.slice(0, 40);
}

export function fakeId(seed: string): number {
  return 100_000 + (fnv1a(seed) % 900_000);
}

export function isoHoursBefore(hours: number): string {
  return new Date(EPOCH - hours * HOUR).toISOString();
}

export function userAt(index: number) {
  const login = USERS[index % USERS.length] ?? "octo-dev";
  return { login, id: fakeId(login), type: "User" };
}

export function labelObject(name: string) {
  return {
    id: fakeId(`label:${name}`),
    name,
    color: LABEL_COLORS[name] ?? "ededed",
  };
}

export function labelAt(index: number) {
  return labelObject(LABELS[index % LABELS.length] ?? "bug");
}

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}
