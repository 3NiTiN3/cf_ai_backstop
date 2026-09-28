# Progress

## Status

- **Mode:** phase
- **Current:** 1.4
- **Last commit:** feat(gateway): add upstream client with outcome classification (1.3)
- **Deployed URL:** https://cf-ai-backstop.gambier-toad-0c.workers.dev
- **Public repo:** not created yet

## Blockers

None.

## Checklist

### Phase 0: Bootstrap
- [x] 0.1 Toolchain check
- [x] 0.2 Scaffold from the agents starter
- [x] 0.3 Rename and strip examples
- [x] 0.4 Switch to Workers AI
- [x] 0.5 Quality tooling
- [x] 0.6 First deploy
- [x] Phase 0 gate

### Phase 1: Read path
- [x] 1.1 Routing and repo keys
- [x] 1.2 Mock GitHub
- [x] 1.3 Upstream client
- [ ] 1.4 Cache in RepoGateway
- [ ] 1.5 Conditional revalidation
- [ ] 1.6 Request coalescing
- [ ] 1.7 Events, stats and Registry
- [ ] Phase 1 gate

### Phase 2: Circuit breaker and chaos
- [ ] 2.1 Health window
- [ ] 2.2 Circuit breaker
- [ ] 2.3 Degraded reads
- [ ] 2.4 Chaos injection
- [ ] 2.5 Admin API and validation
- [ ] Phase 2 gate

### Phase 3: Write queue and replay Workflow
- [ ] 3.1 Write classification
- [ ] 3.2 Queue storage and enqueue
- [ ] 3.3 ReplayWorkflow
- [ ] 3.4 Replay triggers
- [ ] 3.5 Queue API
- [ ] Phase 3 gate

### Phase 4: Ops agent
- [ ] 4.1 System prompt
- [ ] 4.2 Tools
- [ ] 4.3 Memory
- [ ] 4.4 Incident summaries
- [ ] 4.5 Tool-selection evals
- [ ] Phase 4 gate

### Phase 5: Dashboard
- [ ] 5.1 Layout
- [ ] 5.2 Overview cards
- [ ] 5.3 Repos and timeline
- [ ] 5.4 Chaos and queue panels
- [ ] 5.5 Polish
- [ ] Phase 5 gate

### Phase 6: Demo traffic and the outage story
- [ ] 6.1 Server-side simulated agents
- [ ] 6.2 Outage story scenario
- [ ] 6.3 CLI simulator
- [ ] Phase 6 gate

### Phase 7: MCP server
- [ ] 7.1 BackstopMcp
- [ ] 7.2 Connect from Claude Code
- [ ] 7.3 Adoption guide
- [ ] Phase 7 gate

### Phase 8: Hardening
- [ ] 8.1 Security review
- [ ] 8.2 Rate limiting
- [ ] 8.3 Test gaps
- [ ] 8.4 Code quality pass
- [ ] 8.5 Benchmarks
- [ ] Phase 8 gate

### Phase 9: Docs and submission
- [ ] 9.1 README
- [ ] 9.2 Visuals
- [ ] 9.3 Prompt history
- [ ] 9.4 Final acceptance
- [ ] 9.5 Publish
- [ ] Phase 9 gate

## Final acceptance (VALIDATION.md section 4)

Filled in during task 9.4.
