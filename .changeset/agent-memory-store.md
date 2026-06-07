---
"@adjudicate/adapter-core": minor
"@adjudicate/admin-sdk": minor
---

feat(adapter-core): add MemoryStore (in-memory + redis) + `memoryStore`/`enrichContext`/`deriveMemoryWriteback` options — cross-session memory enriches the planner/renderer context UPSTREAM of the envelope; the kernel decision is unchanged (ADR-126).

feat(admin-sdk): add `memory.bySession` for the console Session Memory panel.
