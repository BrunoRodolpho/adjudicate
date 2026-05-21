{
  "intent": {
    "kind": "{{intentPrefix}}.kyc.vendor.callback",
    "payload": {
      "sessionId": "sess-1",
      "score": 95,
      "vendorReference": "vendor-tx-1"
    },
    "actor": { "principal": "system", "sessionId": "example-sess-1" },
    "taint": "TRUSTED",
    "nonce": "example-execute-1"
  },
  "state": {
    "session": {
      "id": "sess-1",
      "userId": "user-1",
      "status": "vendor_pending"
    }
  },
  "expected": { "kind": "EXECUTE" }
}
