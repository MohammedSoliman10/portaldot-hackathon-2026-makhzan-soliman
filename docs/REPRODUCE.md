# REPRODUCE — five commands, about five minutes

Everything here is read-only. None of the five commands needs a private key, and none sends a
transaction. The two `verify` commands read the public Portaldot V3 testnet; the other three run
offline against the repository.

Sections 6–8 at the end reproduce the arithmetic behind `docs/BUSINESS.md`. They are also read-only,
need nothing but Node, and take about a second.

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

## Reproducing the BUSINESS.md numbers

`docs/BUSINESS.md` quotes measured fees and arithmetic on them. The measured half is a record, not a
re-run: reproducing it means reading the evidence, not spending testnet funds again. The three checks
below cover everything in that page that can be recomputed for free.

### 6. The fee receipts, including their caps — under 1 s

```bash
node -e '
const {readdirSync,readFileSync}=require("node:fs");
for (const f of readdirSync("evidence/receipts/live").sort()) {
  const r=JSON.parse(readFileSync("evidence/receipts/live/"+f,"utf8"));
  const q=r.receipt??{}; if(!q.gasUsed) continue;
  console.log(r.action.padEnd(9), String(q.blockNumber).padStart(7),
              String(q.gasUsed).padStart(15), String(r.transaction.maxFeePerGas??"-"));
}'
```

One line per live transaction: action, block, exact `gasUsed`, and the `maxFeePerGas` the sender set.
Sorted by file name, so the first line is a `challenge`.

**`maxFeePerGas` is a cap, not the price paid.** Two transactions set it high and settled lower — the
deploy (`39,096` set, `32,580` paid) and deal 2's answer (`38,970` set, `32,475` paid). The exact fee
is therefore `gasUsed × effective price`, and the effective price is recorded with the balance delta
in the evidence: `evidence/raw/t1/59-live-deploy.txt`, `60-live-pass.txt`, `62-live-register.txt`,
`64`–`72`. Every fee in `BUSINESS.md` §5 is one of those rows or an arithmetic sum of them.

### 7. Fees, amortisation, break-even — under 1 s

```bash
node -e '
const D=(s)=>{const [w,f=""]=s.split(".");return BigInt(w+f.padEnd(18,"0"))};
const S=(v)=>{const s=v.toString().padStart(19,"0");return s.slice(0,-18)+"."+s.slice(-18)};
const div=(v,n)=>{n=BigInt(n);return (2n*v+n)/(2n*n)};
const create=D("11.5570166099781575"), answer=D("0.1629156942926175"),
      register=D("11.53771535730459888"), round=D("0.030630370989014361");
console.log("create/price   ", (Number(create)/1e18/5).toFixed(4));
console.log("round cost     ", S(round));
console.log("22 answers     ", S(22n*answer), (100*22*Number(answer)/1e18/5).toFixed(2)+"% of price");
for (const n of [1,100,10000]) console.log("per file "+String(n).padStart(5), S(div(create,n)));
console.log("register covered after", (Number(register)/1e18/0.17823157127397014).toFixed(0), "deals");
console.log("margin at 5 tPOT", (100*(5-0.178403)/5).toFixed(1)+"%");'
```

Expected output, matching `BUSINESS.md` §5 and §6:

```
create/price    2.3114
round cost      0.030630370989014361
22 answers      3.584145274437585000 71.68% of price
per file     1 11.557016609978157500
per file   100 0.115570166099781575
per file 10000 0.001155701660997816
register covered after 65 deals
margin at 5 tPOT 96.4%
```

Integer arithmetic, so the 18-decimal figures are exact rather than float-rounded. `0.17823157127397014`
is the measured answer + claim gas (the per-deal marginal cost); `0.178403` is that plus one hour of
bond capital.

### 8. Cheat odds and the round budget — under 1 s

```bash
node -e '
const f=0.9, w=50*6, n=(p)=>Math.ceil(Math.log(1-p)/Math.log(f));
console.log("n(50%)="+n(0.5), "n(90%)="+n(0.9), "n(99%)="+n(0.99));
console.log("rounds per day =", Math.floor(86400/w));
console.log("rounds in a 300-block deal =", Math.floor(300*6/w));
console.log(n(0.9)+" rounds =", (n(0.9)*w/3600).toFixed(2), "h");
console.log("caught in 6 rounds =", (100*(1-Math.pow(f,6))).toFixed(1)+"%");
console.log("bond after 1 and 3 catches =", [1,3].map(k=>(30*Math.pow(0.8,k)).toFixed(3)).join(" / "));'
```

Expected:

```
n(50%)=7 n(90%)=22 n(99%)=44
rounds per day = 288
rounds in a 300-block deal = 6
22 rounds = 1.83 h
caught in 6 rounds = 46.9%
bond after 1 and 3 catches = 24.000 / 15.360
```

`f = 0.9` is the provider that stores 90 % of the file, `w` is the measured 50-block window at 6 s per
block. This is the arithmetic behind the honesty section of `BUSINESS.md` §7, including the reason a
30-minute demo deal cannot reach 90 % confidence: only 6 of the 22 rounds fit.

## What these five do not prove

- They do not reproduce the deploy or the live rounds (those cost real testnet funds). Those are
  evidenced, not re-run: `evidence/raw/t1/59-live-deploy.txt`, `60-live-pass.txt`, `64`–`72`.
- They do not prove the provider is independent: both live deals were run by this team.
- They do not test the native deployment path. That was measured by an unsigned dry-run only:
  `evidence/raw/t1/86-native-deploy-dryrun.txt`.
- They are not a security audit.
- Sections 6–8 re-derive numbers from committed receipts and arithmetic. They do not re-measure
  anything: no gas was spent to produce them, and they cannot tell you what a future transaction will
  cost if the gas price moves.

Total wall time on a normal connection: about 15 seconds, plus `npm ci`.
