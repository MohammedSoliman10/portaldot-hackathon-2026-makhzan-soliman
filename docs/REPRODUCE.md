# REPRODUCE — five commands, about five minutes

Everything here is read-only. None of the five commands needs a private key, and none sends a
transaction. The two `verify` commands read the public Portaldot V3 testnet; the other three run
offline against the repository.

## Once (about one minute)

```bash
git clone https://github.com/MohammedSoliman10/portaldot-hackathon-2026-makhzan-soliman.git
cd portaldot-hackathon-2026-makhzan-soliman/apps/makhzan
npm ci
cd ../..
```

Requirements: Node 24, git, and network access for commands 1–2. Foundry is **not** needed for these
five commands. Do not export `MAKHZAN_PRIVATE_KEY`; `verify` is dispatched before the settings loader
and never asks for one.

## 1. Verify live deal 1 (keyless) — about 5 s

```bash
cd apps/makhzan
MAKHZAN_NETWORK=live \
MAKHZAN_RPC_URL=https://test-evm-rpc-v3.portaldot.dev \
MAKHZAN_CHAIN_ID=420420777 \
MAKHZAN_CONTRACT=0x60481DFcFCA34A8F095939D9675eC715127B2e44 \
node src/cliMain.ts verify 1
```

Expected last line: `RESULT: PASS (7 pass, 0 fail, 0 unknown, 0 pending)`, exit code `0`. It checks
the provider bond, the deal root, the challenge block/index, the answer at block `172295`, the claimed
amount and `healthOf(1)`. Recorded run: `evidence/raw/t1/76-verify-deal1.txt`.

## 2. Verify live deal 2 (keyless) — about 5 s

```bash
MAKHZAN_NETWORK=live \
MAKHZAN_RPC_URL=https://test-evm-rpc-v3.portaldot.dev \
MAKHZAN_CHAIN_ID=420420777 \
MAKHZAN_CONTRACT=0x60481DFcFCA34A8F095939D9675eC715127B2e44 \
node src/cliMain.ts verify 2
```

Expected last line: `RESULT: PASS (9 pass, 0 fail, 0 unknown, 0 pending)`, exit code `0`. This deal
contains a slashed challenge (20% of the bond) and a later claim. Recorded run:
`evidence/raw/t1/77-verify-deal2.txt`.

> If the public RPC is down or has pruned the log range, the command prints `UNKNOWN … <node message>`
> or `INCOMPLETE` and exits `1`. That is deliberate: it does not guess a pass.

## 3. Fresh-client retrieval — under 1 s

```bash
cd apps/makhzan
node --test --test-name-pattern "verifyFile accepts" test/retrieve.test.ts
```

Expected: `ℹ pass 1`, `ℹ fail 0`. This is the same verifier that reconstructed the 1 MiB file from the
provider payload in the live run: it rebuilds every block, checks each Merkle path against the root it
was given, and returns the exact bytes plus their sha256.

Why this fixture and not the live payload: the live retrieval needs the provider daemon that served
the file (`node scripts/retrieve-live.mjs --deal 1 --daemon http://127.0.0.1:8787 …`), which is not
part of a clean clone. The verifier logic is the part that matters, and it is exercised here without a
server. Live record: `evidence/raw/t1/75-live-retrieval.txt`.

## 4. Tamper rejection — under 1 s

```bash
node --test --test-name-pattern "rejects one flipped data byte" test/retrieve.test.ts
```

Expected: `ℹ pass 1`, `ℹ fail 0`. The test flips one bit in block 0 of a valid payload and asserts the
verifier throws `ProofRejected: block 0 does not match the expected root`. A copy that does not match
the on-chain root cannot be written out as the file.

## 5. Docs vs evidence — under 1 s

```bash
cd ../..    # repository root
node scripts/docs-hygiene.mjs
```

Expected: `docs hygiene: 100 facts in README.md, docs/CHECKIN.md all match evidence/`, exit code `0`.
The check extracts every address, tx/block hash, SS58 address, block number and tPOT/bond figure from
`README.md` and `docs/CHECKIN.md` and requires each one to exist in `evidence/`, with tPOT converted
to native units and wei where needed. Put a wrong digit in a hash and it fails.

## What these five do not prove

- They do not reproduce the deploy or the live rounds (those cost real testnet funds). Those are
  evidenced, not re-run: `evidence/raw/t1/59-live-deploy.txt`, `60-live-pass.txt`, `64`–`72`.
- They do not prove the provider is independent: both live deals were run by this team.
- They do not test the native deployment path. That was measured by an unsigned dry-run only:
  `evidence/raw/t1/86-native-deploy-dryrun.txt`.
- They are not a security audit.

Total wall time on a normal connection: about 15 seconds, plus `npm ci`.
