{
  "intent": {
    "kind": "{{intentPrefix}}.kyc.complete",
    "payload": {
      "sessionId": "sess-missing"
    },
    "actor": { "principal": "llm", "sessionId": "example-sess-2" },
    "taint": "UNTRUSTED",
    "nonce": "example-refuse-1"
  },
  "state": {
    "session": null
  },
  "expected": { "kind": "REFUSE" }
}
