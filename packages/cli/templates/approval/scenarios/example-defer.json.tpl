{
  "intent": {
    "kind": "{{intentPrefix}}.approval.request",
    "payload": {
      "requestedBy": "bob",
      "amount": 500,
      "reason": "Quarterly software license renewal"
    },
    "actor": { "principal": "llm", "sessionId": "example-sess-3" },
    "taint": "UNTRUSTED",
    "nonce": "example-defer-1"
  },
  "state": {
    "approver": { "id": "alice", "role": "approver" },
    "request": null
  },
  "expected": { "kind": "DEFER" }
}
