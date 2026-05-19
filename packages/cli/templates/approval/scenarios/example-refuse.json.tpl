{
  "intent": {
    "kind": "{{intentPrefix}}.approval.approve",
    "payload": {
      "requestId": "req-2"
    },
    "actor": { "principal": "operator", "sessionId": "example-sess-2" },
    "taint": "TRUSTED",
    "nonce": "example-refuse-1"
  },
  "state": {
    "approver": { "id": "alice", "role": "approver" },
    "request": {
      "id": "req-2",
      "requestedBy": "alice",
      "amount": 100,
      "status": "pending"
    }
  },
  "expected": { "kind": "REFUSE" }
}
