# Triad MCP server

Lets an agent check a payment or cargo change with Triad before acting on it. It speaks MCP over stdio.

| Tool | What it does |
| --- | --- |
| `check_payment_change` | Takes who you pay (as you had it before the email) and the email asking for a change. Returns CLEAR, HOLD or BLOCK with plain next steps and a signed evidence file. |
| `record_callback_answer` | After a HOLD, a person calls the contact on record; this records what they said. Triad decides again without buying anything. |
| `share_decision` | Publishes a decision's evidence file under a permalink. Use it only with the owner's consent: the file holds supplier details. |
| `verify_evidence` | Recomputes an evidence file's hash, checks its receipts, and recovers who signed it. |

```json
{
  "mcpServers": {
    "triad": {
      "command": "pnpm",
      "args": ["--dir", "/path/to/triad", "--filter", "@triad/mcp", "start"],
      "env": { "TRIAD_URL": "https://triad-five-steel.vercel.app" }
    }
  }
}
```

**Payment.** Each address gets 5 free checks a day. After that a check costs $0.05 in devnet USDC over x402 on Solana. Set `TRIAD_PAYER_KEYFILE` to a Solana devnet keypair holding devnet USDC, and the server pays by itself. It caps every payment at 0.10 USDC. Optionally, set `SOLANA_RPC_URL` to choose the RPC it uses.
