{
  "intent": {
    "kind": "{{intentPrefix}}.payment.refund",
    "payload": {
      "paymentId": "pay-1",
      "refundCentavos": 5000,
      "reason": "customer requested"
    },
    "actor": { "principal": "llm", "sessionId": "example-sess-1" },
    "taint": "UNTRUSTED",
    "nonce": "example-execute-1"
  },
  "state": {
    "payments": {
      "pay-1": {
        "id": "pay-1",
        "amountCentavos": 10000,
        "status": "confirmed"
      }
    }
  },
  "expected": { "kind": "EXECUTE" }
}
