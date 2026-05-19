{
  "intent": {
    "kind": "{{intentPrefix}}.deployment.request",
    "payload": {
      "sha": "deadbeef",
      "rampPercent": 100
    },
    "actor": { "principal": "operator", "sessionId": "example-sess-3" },
    "taint": "TRUSTED",
    "nonce": "example-escalate-1"
  },
  "state": {
    "environment": "production",
    "currentVersion": "v1.0.0"
  },
  "expected": { "kind": "ESCALATE" }
}
