# Decisions

Short entries, newest at the bottom. One entry per real decision or deviation from the plan.

Format:

```
## YYYY-MM-DD  Task N.N  Short title
Context: what forced a choice.
Decision: what we chose.
Why: the reason in one or two lines.
```

## 2026-09-28  Planning  Problem and scope
Context: Cloudflare's optional assignment asks for an AI app with an LLM, workflow, chat input and memory. Most submissions will be chat wrappers.
Decision: Build Backstop, a resilience gateway between AI coding agents and the GitHub API, with an ops agent on top.
Why: It targets a real, current problem (GitHub reliability under AI-driven load) and matches the Developer Productivity team's work: developer infrastructure, AI-assisted development, MCP and agents.

## 2026-09-28  Planning  Deterministic core, LLM on top
Context: The gateway makes decisions that must be predictable (caching, breaker, queueing).
Decision: All gateway logic is plain code. The LLM only explains state through tools and phrases incident summaries from recorded facts.
Why: Predictable behaviour, testable guarantees, and no invented numbers.
