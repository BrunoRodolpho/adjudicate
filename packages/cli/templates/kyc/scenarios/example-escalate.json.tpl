{
  "intent": {
    "kind": "{{intentPrefix}}.kyc.vendor.callback",
    "payload": {
      "sessionId": "sess-2",
      "score": 12,
      "vendorReference": "vendor-tx-2"
    },
    "actor": { "principal": "system", "sessionId": "example-sess-4" },
    "taint": "TRUSTED",
    "nonce": "example-escalate-1"
  },
  "state": {
    "session": {
      "id": "sess-2",
      "userId": "user-2",
      "status": "vendor_pending"
    }
  },
  "expected": { "kind": "ESCALATE" }
}
