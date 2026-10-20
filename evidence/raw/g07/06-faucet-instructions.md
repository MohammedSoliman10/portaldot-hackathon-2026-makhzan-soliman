# Faucet route investigation (STEP 2a)

UTC: 2026-10-20T05:30Z

## What was checked

| Target | Result |
| --- | --- |
| `https://portaldot.dev` | DNS does not resolve (`curl: (6) Could not resolve host`) |
| `https://docs.portaldot.dev` | DNS does not resolve |
| `https://testnet.portaldot.dev` | DNS does not resolve |
| `https://faucet.portaldot.dev` | DNS does not resolve |
| `https://test-evm-rpc-v3.portaldot.dev` | HTTP 405 "Used HTTP Method is not allowed. POST is required"; JSON-RPC only |
| DoraHacks hackathon detail page | distribution is by Discord support ticket / DM, not an HTTP faucet |
| Web search for "Portaldot faucet" | no official faucet endpoint found |

## Official instructions found

Source: `https://dorahacks.io/hackathon/portaldot-hacker-house-2026/detail`
(section "PortaldotV3 Testnet: Updated Network Info & Testnet Token Distribution", retrieved
2026-10-20T05:30Z)

Quoted:

> Haven't submitted your wallet address yet? Please open a support ticket here on Discord and include:
> A screenshot of your hackathon registration/participation
> Your correct native POT wallet address (beginning with 5)
> Make sure you send your native POT address (starting with 5), not an EVM address (starting with 0x).

And:

> If you have not received your test tokens, please contact an admin by DM:
> Discord: In the Portaldot Discord server, DM admin @titus242471
> When contacting an admin, please provide your Portaldot native wallet address in SS58 format (starting with 5).

Official Discord: `https://discord.gg/portaldot` / `https://discord.gg/Vt9VpG6Ed`
Node console: `https://node-console.portaldot.dev/`

## Conclusion

There is **no plain HTTP faucet** that works without a login, captcha or Discord identity. No request
was made by the harness, and no Discord automation or token was used. The owner must send the
ready-to-paste message in `/mnt/e/obsidian.md/SOLLY/makhzan-sync/MESSAGES.md` (message 1) through the
official support ticket or admin DM.

The poller was started at 05:30:51Z against the approved owner address and continues every 60 s for
90 minutes: `evidence/raw/g07/05-owner-poll.txt`.
