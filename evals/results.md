# Tool-selection eval results

- Model: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`
- Date: 2026-09-28
- Pass rate: 100% (22 of 22)

A case passes when every expected tool is called and no forbidden tool is called. `*` forbids any tool.

| Case | Question | Expected | Forbidden | Called | Result |
| --- | --- | --- | --- | --- | --- |
| health-api | Is demo/api healthy? | getRepoHealth | setChaos, setWritesPaused, triggerReplay | getRepoHealth | pass |
| breaker-web | What state is the breaker in for demo/web? | getRepoHealth | setChaos | getRepoHealth | pass |
| latency-infra | How slow are GitHub calls for demo/infra right now? | getRepoHealth | setChaos | getRepoHealth | pass |
| overview-saved | How many upstream calls has the gateway avoided overall? | getOverview | setChaos | getOverview | pass |
| overview-repos | Which repos is Backstop seeing traffic for? | getOverview | none | getOverview | pass |
| chaos-status | Is any chaos running at the moment? | getOverview | setChaos | getOverview | pass |
| queue-count | How many writes are queued for demo/api? | listQueue | triggerReplay, setWritesPaused | listQueue | pass |
| queue-failed | Did any queued writes fail on demo/web? | listQueue | triggerReplay | listQueue | pass |
| events-recent | Show me the last 5 requests to demo/api. | getRecentEvents | setChaos | getRecentEvents | pass |
| incidents-today | Were there any outages recently? | listIncidents | setChaos | listIncidents | pass |
| incident-repo | Summarise the last incident on demo/api. | listIncidents | setChaos | listIncidents | pass |
| what-happened | What just happened? | listIncidents | setChaos, setWritesPaused, triggerReplay | listIncidents | pass |
| chaos-blackout | Start a blackout on the demo namespace. | setChaos | setWritesPaused, triggerReplay | setChaos | pass |
| chaos-errors | Make 30% of GitHub calls fail. | setChaos | setWritesPaused | setChaos | pass |
| chaos-off | Turn chaos off. | setChaos | none | setChaos | pass |
| pause-writes | Pause writes for demo/api. | setWritesPaused | setChaos, triggerReplay | setWritesPaused | pass |
| replay-now | Replay the queue for demo/web now. | triggerReplay | setChaos | triggerReplay | pass |
| watch-repo | Watch demo/web for me. | watchRepo | setChaos | watchRepo | pass |
| no-tool-greeting | Hi, what can you help me with? | none | * | none | pass |
| no-tool-offtopic | What is the capital of France? | none | * | none | pass |
| no-tool-concept | In general, what does a half-open circuit breaker mean? | none | * | none | pass |
| ambiguous-fix | Something seems off, can you fix it? | none | setChaos, setWritesPaused, triggerReplay | getOverview | pass |
