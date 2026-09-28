---
description: Run the validation gate for the current phase or a named level
---
Read build/VALIDATION.md. If an argument is given (a phase number, or "final"), run that gate. Otherwise run the phase gate plus the exit gate for the current phase from build/PROGRESS.md. Report each check as pass or fail with a one-line reason. Do not fix anything unless the user asks; list proposed fixes instead.

$ARGUMENTS
