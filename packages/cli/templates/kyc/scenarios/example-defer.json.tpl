{
  "intent": {
    "kind": "{{intentPrefix}}.kyc.start",
    "payload": {
      "userId": "user-1"
    },
    "actor": { "principal": "llm", "sessionId": "example-sess-3" },
    "taint": "UNTRUSTED",
    "nonce": "example-defer-1"
  },
  "state": {
    "session": null
  },
  "expected": { "kind": "DEFER" }
}
