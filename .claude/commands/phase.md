---
description: Run every remaining task in the current phase, then the phase gate
---
Follow build/ORCHESTRATOR.md exactly. Read build/PROGRESS.md and work through every remaining task in the current phase using the full loop, one commit per task. Stop early for blockers, approvals and anything the user must do. When the last task is committed, run the phase exit gate and the phase gate in build/VALIDATION.md, complete the phase as the orchestrator describes, and give a short phase summary.

$ARGUMENTS
