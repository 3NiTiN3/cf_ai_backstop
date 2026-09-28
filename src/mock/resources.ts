import {
  MOCK_OWNER,
  fakeId,
  fakeSha,
  isoHoursBefore,
  labelAt,
  userAt,
  type RepoSpec,
} from "./fixtures";

export type ListState = "open" | "closed" | "all";

const STATUS_STATES = ["success", "pending", "failure"] as const;

function fullName(spec: RepoSpec): string {
  return `${MOCK_OWNER}/${spec.name}`;
}

export function repoObject(spec: RepoSpec) {
  return {
    id: fakeId(fullName(spec)),
    name: spec.name,
    full_name: fullName(spec),
    private: false,
    owner: { login: MOCK_OWNER, id: fakeId(MOCK_OWNER), type: "Organization" },
    description: spec.description,
    default_branch: "main",
    language: spec.language,
    stargazers_count: fakeId(`stars:${spec.name}`) % 500,
    forks_count: fakeId(`forks:${spec.name}`) % 50,
    open_issues_count: issueObjects(spec, "open").length,
    created_at: isoHoursBefore(24 * 400),
    updated_at: isoHoursBefore(2),
    pushed_at: isoHoursBefore(1),
  };
}

export function issueObjects(spec: RepoSpec, state: ListState) {
  return spec.issues
    .map((title, i) => ({
      id: fakeId(`${fullName(spec)}#${i + 1}`),
      number: i + 1,
      state: i % 3 === 2 ? "closed" : "open",
      title,
      body: `${title}.`,
      user: userAt(i),
      labels: [labelAt(i)],
      comments: i * 2,
      created_at: isoHoursBefore(48 * (i + 1)),
      updated_at: isoHoursBefore(3 * (i + 1)),
    }))
    .filter((issue) => state === "all" || issue.state === state);
}

export function pullObjects(spec: RepoSpec, state: ListState) {
  return spec.pulls
    .map((title, i) => pullObject(spec, title, i))
    .filter((pull) => state === "all" || pull.state === state);
}

export function findPull(spec: RepoSpec, number: number) {
  return pullObjects(spec, "all").find((pull) => pull.number === number);
}

function pullObject(spec: RepoSpec, title: string, i: number) {
  const number = spec.issues.length + i + 1;
  const merged = i === spec.pulls.length - 1 && i > 0;
  return {
    id: fakeId(`${fullName(spec)}!${number}`),
    number,
    state: merged ? "closed" : "open",
    title,
    body: `${title}.`,
    user: userAt(i + 1),
    draft: false,
    head: {
      ref: `feature/${number}`,
      sha: fakeSha(`${fullName(spec)}:head:${number}`),
    },
    base: { ref: "main", sha: commitShas(spec)[0] },
    labels: [labelAt(i + 1)],
    created_at: isoHoursBefore(24 * (i + 2)),
    updated_at: isoHoursBefore(i + 1),
    merged_at: merged ? isoHoursBefore(i) : null,
  };
}

export function commitShas(spec: RepoSpec): string[] {
  return spec.commits.map((_, i) => fakeSha(`${fullName(spec)}:commit:${i}`));
}

export function commitObjects(spec: RepoSpec) {
  const shas = commitShas(spec);
  return spec.commits
    .map((message, i) => ({
      sha: shas[i],
      commit: {
        message,
        author: {
          name: userAt(i).login,
          email: `${userAt(i).login}@example.com`,
          date: isoHoursBefore(12 * (spec.commits.length - i)),
        },
      },
      author: userAt(i),
      parents: i === 0 ? [] : [{ sha: shas[i - 1] }],
    }))
    .reverse();
}

export function combinedStatus(spec: RepoSpec, sha: string) {
  const index = commitShas(spec).indexOf(sha);
  if (index === -1) return undefined;
  const state = STATUS_STATES[index % STATUS_STATES.length] ?? "success";
  return {
    state,
    sha,
    total_count: 1,
    statuses: [
      {
        id: fakeId(`status:${sha}`),
        state,
        context: "ci/build",
        description: `Build ${state}`,
        created_at: isoHoursBefore(index),
      },
    ],
  };
}

export function contentObject(spec: RepoSpec, path: string) {
  const file = spec.files[path];
  if (file !== undefined) return fileEntry(spec, path, file);
  const entries = directoryEntries(spec, path);
  return entries.length > 0 ? entries : undefined;
}

function fileEntry(spec: RepoSpec, path: string, text: string) {
  return {
    ...entryBase(spec, path, "file", text.length),
    encoding: "base64",
    content: toBase64(text),
  };
}

function directoryEntries(spec: RepoSpec, dir: string) {
  const prefix = dir === "" ? "" : `${dir}/`;
  const children = new Map<string, "file" | "dir">();
  for (const path of Object.keys(spec.files)) {
    if (!path.startsWith(prefix)) continue;
    const [name, ...rest] = path.slice(prefix.length).split("/");
    if (name) children.set(name, rest.length > 0 ? "dir" : "file");
  }
  return [...children]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, type]) => {
      const path = `${prefix}${name}`;
      return entryBase(spec, path, type, spec.files[path]?.length ?? 0);
    });
}

function entryBase(spec: RepoSpec, path: string, type: string, size: number) {
  return {
    type,
    name: path.split("/").pop() ?? path,
    path,
    sha: fakeSha(`${fullName(spec)}:${path}`),
    size,
  };
}

function toBase64(text: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
