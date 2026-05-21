{
  "intent": {
    "kind": "{{intentPrefix}}.deployment.request",
    "payload": {
      "sha": "abc123",
      "rampPercent": 25
    },
    "actor": { "principal": "llm", "sessionId": "example-sess-2" },
    "taint": "UNTRUSTED",
    "nonce": "example-refuse-1"
  },
  "state": {
    "environment": "staging",
    "currentVersion": "v1.0.0"
  },
  "expected": { "kind": "REFUSE" }
}
