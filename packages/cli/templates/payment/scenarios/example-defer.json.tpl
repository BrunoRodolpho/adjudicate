{
  "intent": {
    "kind": "{{intentPrefix}}.payment.create",
    "payload": {
      "amountCentavos": 10000,
      "payerRef": "user-1"
    },
    "actor": { "principal": "llm", "sessionId": "example-sess-3" },
    "taint": "UNTRUSTED",
    "nonce": "example-defer-1"
  },
  "state": {
    "payments": {}
  },
  "expected": { "kind": "DEFER" }
}
