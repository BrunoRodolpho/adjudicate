{
  "intent": {
    "kind": "{{intentPrefix}}.payment.create",
    "payload": {
      "amountCentavos": -100,
      "payerRef": "user-1"
    },
    "actor": { "principal": "llm", "sessionId": "example-sess-2" },
    "taint": "UNTRUSTED",
    "nonce": "example-refuse-1"
  },
  "state": {
    "payments": {}
  },
  "expected": { "kind": "REFUSE" }
}
