{
  "intent": {
    "kind": "{{intentPrefix}}.approval.approve",
    "payload": {
      "requestId": "req-1"
    },
    "actor": { "principal": "operator", "sessionId": "example-sess-1" },
    "taint": "TRUSTED",
    "nonce": "example-execute-1"
  },
  "state": {
    "approver": { "id": "alice", "role": "approver" },
    "request": {
      "id": "req-1",
      "requestedBy": "bob",
      "amount": 500,
      "status": "pending"
    }
  },
  "expected": { "kind": "EXECUTE" }
}
