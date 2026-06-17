---
"@adjudicate/core": minor
---

Add the shared `LearningEventV1` wire contract to the kernel barrel
(`LearningEventV1` + `LEARNING_EVENT_SCHEMA_VERSION` / `LEARNING_EVENT_CHANNEL` /
`LEARNING_EVENT_SUBJECT`). This single-sources the `learning.event.v1` pub/sub
payload that the ibatexas runtime publishes and the adjudicate console consumes,
killing the hand-copied-interface drift flagged by UltraReview (#94-20 / #28-11).
Additive only — the existing kernel `LearningEvent` type is unchanged.
