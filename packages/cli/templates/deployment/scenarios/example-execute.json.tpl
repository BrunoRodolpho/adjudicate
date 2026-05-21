{
  "intent": {
    "kind": "{{intentPrefix}}.deployment.request",
    "payload": {
      "sha": "abc123",
      "rampPercent": 25
    },
    "actor": { "principal": "operator", "sessionId": "example-sess-1" },
    "taint": "TRUSTED",
    "nonce": "example-execute-1"
  },
  "state": {
    "environment": "staging",
    "currentVersion": "v1.0.0"
  },
  "expected": { "kind": "EXECUTE" }
}
