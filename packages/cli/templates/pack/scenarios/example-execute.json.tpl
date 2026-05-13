{
  "intent": {
    "kind": "{{intentPrefix}}.demo.create",
    "payload": {},
    "actor": { "principal": "llm", "sessionId": "example-sess-1" },
    "taint": "UNTRUSTED",
    "nonce": "example-execute-1"
  },
  "state": {
    "entities": {}
  },
  "expected": { "kind": "EXECUTE" }
}
