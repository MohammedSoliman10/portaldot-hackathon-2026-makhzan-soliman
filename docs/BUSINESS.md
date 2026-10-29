# BUSINESS — who pays, what it costs, and what would have to be true

## In one screen

- **The problem:** Off-chain storage offers promises and invoices, but buyers have no way to audit custody or penalise missing data on-chain.
- **What we built:** Makhzan, an accountable storage protocol on Portaldot EVM where providers bond tPOT and are challenged on random blocks with a 20% slash on failure.
- **What is measured live:** Two deals, one provider, one pass, one slash, linear accrual, settlement, and keyless verification on the Portaldot V3 testnet.
- **The biggest honest limit:** One provider and operator (all ours), with challenge randomness relying on a blockhash/prevrandao fallback rather than a VRF.
- **What we need:** Foundation support for redeployment budget, an independent provider, day-scale deal runs, and clarity on V3 randomness.
- **Where to verify:** Complete reproduction commands in `docs/REPRODUCE.md`, receipts in `evidence/`, and a read-only status UI and MCP server.

This page is the business case for a sceptical judge. It uses only numbers measured on Portaldot V3
(`chain id 420420777`) or arithmetic on those numbers. Nothing here is a projection that pretends to
be a measurement, and nothing is an interview we did not do.

**Labels.** `[measured]` = read from a receipt, a balance delta or on-chain state. `[derived]` =
arithmetic on measured values. `[assumed]` = an invented input, stated where it is used.
`[design note]` = a plan, not a fact. `[reported by another team]` = a competitor's own README claim
that we did not verify on chain.

**Scope, stated before the pitch.** Two deals, one provider, one operator — all of them ours. No
third party has run a deal. There is no paying customer, no interview and no letter of intent. The
cost side is measured to the wei; the demand side is a hypothesis. Every command that reproduces a
number below is in `docs/REPRODUCE.md`.

Source for every figure: `CHECKPOINT-ECONOMICS.md` (fees, deploy, deal parameters) and
`CHECKPOINT-SENSITIVITY.md` (cheat odds, break-even, bond sizing). Assumptions A1–A8 are listed in
that second file and repeated where they matter.

---

## 1. Who needs this

A payer appears wherever one party must believe another party still holds data it cannot see. Four
segments, each with a different reason to care:

| Segment | Who pays, for what | What they do today | Why the guarantee matters |
| --- | --- | --- | --- |
| **AI agents and agent platforms** | The agent operator, per dataset or per retrieval campaign | Trusts an object store, an RPC cache or a "pinning" invoice | An agent that buys inputs cannot audit a provider, and a silent data loss is invisible until a decision is already wrong. A challenge with money at risk is a check the agent can run itself, keylessly |
| **dApps with off-chain data** | The dApp, per dataset root | Pays an indexer or RPC vendor; stores JSON on IPFS and hopes | On-chain state can reference a root; nothing on-chain could previously punish a provider that stopped serving the file behind it |
| **Document and RWA custody** | The counterparty holding the file — custodian, auditor, escrow agent | Contractual SLAs, periodic manual checks, a trusted notary | A bond plus a challenge turns "we promise" into "you can take 20 % of our stake for one missed block", and a third party can re-verify the whole history without our keys |
| **Node and archive operators on Portaldot** | The provider side: they earn the deal price | Run validators/archive nodes; storage is a cost centre | A registered provider with a bond can sell spare disk as a service with a public, checkable track record (`healthOf`) |

The payer hypothesis, in one line: **a team that already pays for an indexer or an RPC vendor will
pay a small per-deal premium for the ability to punish a provider** `[design note]`. We have not
tested that willingness to pay (§11).

## 2. The problem in one paragraph

Storage is sold as a promise. A provider says it holds your file, you pay monthly, and the only
evidence you get is an invoice and an uptime graph that the provider writes itself. Off-chain data is
now load-bearing for on-chain systems — an agent's dataset, an order book snapshot, a title deed scan
— and none of the usual tools give the buyer a way to *test* the claim and *take money* when it is
false. Checking a sha256 by hand proves the file existed at the moment you checked; it says nothing
about the other 364 days, and it cannot be repeated by someone who does not already have a copy.
Makhzan turns that promise into a challenge with a deadline and a bond: the buyer names a random
block, the provider must produce it with a Merkle path or lose part of its stake, and anyone can
re-verify the outcome from public chain data.

## 3. Why Portaldot

| Property | Measurement | Why it decides the design |
| --- | --- | --- |
| **EVM contracts** | Solidity, `via_ir`, `solc 0.8.28`, runtime `6,566 B`; deployed and exercised `[measured]` | The protocol is ordinary Solidity, so Foundry tests, existing tooling and a normal audit market apply. No new VM to learn |
| **Native value inside the EVM** | Bond held in the contract's native balance; `1 tPOT = 10^14 planck`, `1 planck = 10^4 wei` `[measured]` | A bond and a slash are only credible if the money is the chain's own token, not a wrapped IOU. Value moves as native balance |
| **6-second blocks** | 100 intervals, all exactly `6.000 s` `[measured]` | A 50-block challenge window is 300 s — short enough that a buyer can hunt during a working session, long enough that a provider has time to answer |
| **`TransactionStorage` anchoring** | Small manifest stored natively; native deploy deposit `130.9395 tPOT` vs EVM reserve `165.513 tPOT` in an unsigned dry-run `[measured]` | Gives a cheap, chain-native copy of the deal manifest (root, size, provider, contract) next to the EVM record. It anchors *the commitment*; it is not a retrieval guarantee `[design note]` |
| **`pallet-revive`** | EVM bytecode accepted on V3; contract deployed through it `[measured]` | Portaldot can host this without a bridge, and the same contract can be reached from Substrate-side tooling later |

The uncomfortable half of "why Portaldot": deploying here is **not cheap**. One contract creation
cost **529.844316817465986480 tPOT** total, of which **165.513 tPOT** is a storage reserve and
**364.331 tPOT** was execution fee `[measured]`. That single number shapes the business more than any
other: you deploy **one** contract and serve many deals from it, because a per-deal contract would
cost more than the deal. It also means parameter changes (window, slash rate, per-deal bond) are a
redeploy, not a config tweak — see §9.

## 4. How it earns

**Today, in the deployed contract** `[measured]`: the client escrows a price when it creates a deal;
the provider claims it after the deal; a missed challenge moves 20 % of the provider's bond to the
deal owner. The config read back after deploy is `window 50`, `blockSize 1024`, `slashBps 2000`,
`minBond 10 tPOT`, `minDuration 100`, `maxDuration 100800` — **there is no protocol-fee parameter**.
Protocol revenue is zero. Value flows are the escrowed price, the bond and the slash.

So the revenue line is: **the provider keeps the deal price minus its own gas.** At the demo price
that is a large margin (§5), and the margin is the thing a real provider would compete away.

Options for a fee, none of them built `[design note]`:

| Option | How it would work | What it needs first |
| --- | --- | --- |
| Small protocol fee | A basis-point cut of `claim`, taken by the contract or a treasury address | A redeploy (`529.844 tPOT` measured cost) and a decision on who receives it |
| Permissionless challenger reward | Split the 6 tPOT slash between the deal owner and whoever called `resolve` | A redeploy; today the whole slash is credited to the owner whether or not the caller is the owner |
| Paid verification / attestation | Sell the keyless `verify` bundle to an enterprise that must show an auditor the file was held | A product around a command that is currently free and open |
| Provider subscription | Charge providers for listing/health history rather than for deals | Multi-provider data we do not have (one provider so far) |

The honest order of these: the challenger reward is the one that also fixes an incentive bug — today a
third party has every reason to let a bad provider keep going, because only the deal owner is paid.
It is the first thing we would build with funding, and it is a contract change, not a docs change.

## 5. Cost facts

All per-transaction figures below are measured on the Portaldot V3 testnet at an effective gas
price of `32,450 – 32,580 wei` `[measured]`. A gas-price change moves every tPOT figure linearly
(A6).

| Item | Cost (tPOT) | Label |
| --- | ---: | --- |
| One-off provider registration | **11.537715357304598880** | measured |
| Create a deal (client) | **11.557016609978157500** | measured |
| Challenge (client) | **0.015313410910980000** | measured |
| Answer (provider) | **0.162915694292617500** | measured |
| Claim (provider) | **0.015315876981352640** | measured |
| Resolve / slash (anyone) | **0.015316960078034360** | measured |
| Challenge + resolve, one hunting round | **0.030630370989014361** | derived |
| Deploy the contract (once, this team) | **529.844316817465986480** | measured |
| Bond locked by the provider | **30.000000000000000000** | measured |
| Slash on a missed challenge | **6.000000000000000000** (exactly 20 %) | measured |

Three things follow, and each one is a design constraint rather than a marketing point.

1. **Opening a deal costs 2.31× the service price.** `11.557 / 5.000 = 2.3114` `[derived]`. Gas, not
   the provider, is the largest line item for a small deal. This is why §6 exists.
2. **A challenge is cheap for the buyer and expensive for the provider.** The buyer spends `0.0306`
   per round; the provider spends `0.1629` to answer the same round. A buyer who used the 22 rounds
   needed for 90 % confidence would cost the provider
   `22 × 0.162915694292617500 = 3.584145274437585000 tPOT` in answer gas alone —
   **71.7 % of a 5 tPOT price** `[derived]`. The 96 % margin in the next table holds for roughly one
   challenge per deal, not for a determined hunter. Any real price has to be set against expected
   challenge frequency, not against zero.
3. **One catch repays the deal.** A catch pays the owner `6.000 tPOT` against a `5.000 tPOT` price and
   `0.0306` per hunt — about 196 rounds of hunting `[derived]`. Detection is profitable for the buyer;
   that asymmetry is what makes the product work, and also what makes (2) a griefing surface.

**The 5 tPOT price is a demo value, not a tariff.** It was set to make the live runs legible, not from
a cost study. There is no measured market price for tPOT (`A8`), so no USD figure appears anywhere in
this document, and none should be inferred.

**Never read the GiB-month arithmetic as a price.** `CHECKPOINT-ECONOMICS.md` §6 divides the 5 tPOT
demo price by a 1 MiB deal and a 30-minute duration and gets large per-GiB-month numbers. That is
arithmetic on a demo, not a rate card: the contract charges a **flat price per deal**, independent of
size and duration (`A7`), so per-byte figures move by orders of magnitude with deal shape.

**Provider margin** `[derived]` from measured fees, at the 5 tPOT demo price, register sunk, gas only:

| Duration | Marginal cost | Margin at 5 tPOT | Margin | Register recovered after |
| --- | ---: | ---: | ---: | --- |
| 1 hour | 0.178403 | 4.821597 | 96.4 % | 3 deals |
| 1 day | 0.182341 | 4.817659 | 96.4 % | 3 deals |
| 7 days | 0.206999 | 4.793001 | 95.9 % | 3 deals |

That margin excludes storage, bandwidth, hardware and ops (`A5`) and excludes the bond's opportunity
cost at an assumed `5 %/yr` (`A4`). It is a gross margin on gas, nothing more. Two structural costs
sit under it: the one-off registration needs ~65 deals to fall below per-deal gas
(`11.5377 / 0.1782` `[derived]`), and one determined challenger can eat most of a small deal's price
(point 2 above).

## 6. Why one deal should cover a whole dataset root

The create fee is fixed at `11.557016609978157500 tPOT` and is a **per-deal** cost in the contract,
not a per-leaf one `[measured for a 1 MiB deal; the fee does not scale with leaf count]`. Put a
thousand documents under one Merkle root and the deal still pays `11.557`. Amortised per file
`[derived]`:

| Files under one root | Create fee per file | Price per file | Total per file |
| ---: | ---: | ---: | ---: |
| 1 | **11.557016609978157500** | 5.000000000000000000 | 16.557016609978157500 |
| 100 | **0.115570166099781575** | 0.050000000000000000 | 0.165570166099781575 |
| 10,000 | **0.001155701660997816** | 0.005000000000000000 | 0.001655701660997816 |

Batching lowers the absolute per-file cost 10,000× but leaves the **fee:price ratio at 2.31:1 at every
N** `[derived]`. Gas cannot be amortised away; only a higher price or cheaper gas fixes that. The
provider's revenue is `5 tPOT per deal, not per file` `[measured]` — at 10,000 files that is
`0.0005 tPOT per file` `[derived]` for storing ~10 GiB, which is why the flat price strongly favours
large deals and punishes small ones.

Answer cost does not grow with file count the way it grows with tree depth: answering is **one Merkle
path**, `10` hashes for a `1,024`-leaf tree, measured at `5,012,790,593,619` gas for the proof path
`[measured for 1,024 leaves; proof length grows as log₂(leaf count), so a 10,000× larger dataset adds
roughly 13 more hashes]` `[derived]`. So the packaging is: **one deal per dataset root, priced per
deal, verified per block.** Per-file deals are the shape that makes the economics fail.

## 7. What the security actually buys — and what it does not

This section is the one a judge should read before believing §5.

**Six rounds fit in the demo deal, not twenty-two.** A challenge round occupies one 50-block window
= 300 s. The 300-block deal we actually ran (1,800 s) therefore fits **6 rounds** `[derived]`. For a
provider that stores 90 % of the file, 6 rounds detect it **46.9 %** of the time; the 22 rounds needed
for 90 % confidence do not fit `[derived from A1–A2]`.

| Provider stores | Caught per round | Rounds for 50 % | for 90 % | for 99 % |
| ---: | ---: | ---: | ---: | ---: |
| 90 % | 10 % | 7 | **22** | 44 |
| 50 % | 50 % | 1 | 4 | 7 |
| 10 % | 90 % | 1 | 1 | 2 |

**A real deal lasts days, and that fixes it.** At 6 s blocks and a 50-block window there are
`86,400 / 300 = 288` rounds per day `[derived]`. The 22 rounds that give 90 % detection of a 90 %
provider are `22 × 300 s = 6,600 s ≈ 1.83 h` of chain time `[derived]` — so on a day-long deal the
statistics work with room to spare, and on a 30-minute demo they do not. The limitation is the deal
duration we could afford to run, not the protocol's ceiling: `maxDuration` is `100800` blocks (7 days)
`[measured]`.

**The window is a deployed constant.** `window 50` is constructor state, read back after deploy
`[measured]`; changing it is a redeploy (`529.844 tPOT` measured), which is why a v2 would make it a
parameter, together with the slash rate and a per-deal bond `[design note]`.

**One bond backs every deal.** The 30 tPOT bond is per provider, not per deal. With a 20 % slash, the
deterrence ceiling is `6 tPOT per deal` at `q = 1`, `3 tPOT` at `q = 0.5`, and it **shrinks with every
catch** — 30 → 24 → 19.2 → 15.36, so 6 → 4.8 → 3.07 tPOT of deterrent `[derived]`. A provider holding
100 deals can save `100 × S` while risking at most 20 % of one bond per round caught. Bond sizing must
therefore scale with total storage under management, which the current design does not do. The general
rule is clean: one round needs `B ≥ 5S` for a saving `S` `[derived]`.

**The selector is a fallback, and its randomness is unproven.** The index is
`keccak256(blockhash, prevrandao, dealId) % leafCount`. It is not a VRF. Every detection number above
assumes the index is uniform (A1), and a provider with block control can do better than these odds.
We have not yet received a statement from the Portaldot team on randomness on V3; we make no claim about
it in either direction. A v2 would use a VRF or a native randomness source `[design note]`.

**What a pass does not prove**, in the same words as `docs/EXPLAIN.md`: one block, at one time, from a
provider that could produce it. Not continuous storage, not a distinct copy of duplicated blocks, not
bandwidth, not the whole file. The slash covers an unanswered challenge; it does not cover a
provider that answers challenges and serves nothing to real users.

**A pass is still worth money.** It is the difference between an invoice and a checkable fact, and the
check is free for a third party: `verify 1` and `verify 2` read the live chain with no key and print
`PASS (7 …)` / `PASS (9 …)` `[measured]`. The evidence bundle is the product's audit trail.

## 8. Competition

Method: 55 hackathon repositories were read (README text; 25 in depth). **Everything below is
self-reported `[reported by another team]`; we opened no competitor app and verified no competitor
transaction on chain.** Across all 55, we found no other bonded storage-proof protocol with a
challenge and a slash — several use `TransactionStorage`, `remark.store` or IPFS, none put money at
risk on retrieval.

| Closest peer | What it is | Where we compare |
| --- | --- | --- |
| **ReviveCheck** | Release-attestation middleware: registry contracts, a guard library, a reference consumer, 13 read-only tools over MCP/REST/CLI, reports stored via `remark.store`, several deployed registry versions | Middleware-plus-consumer architecture with an MCP and CLI surface. Makhzan provides a read-only MCP server and an economic guarantee: an on-chain slash for data that is not produced |
| **SEAM** | "Execution layer": manifest in, verified receipt out; policy and approval gates; documented finalized V3 transactions | Polished, honest, process-strong. No on-chain primitive to bond against |
| **Plumbline** | Checks Portaldot's documented calls against the runtime, verdict per call, V3-vs-mainnet diffs, ~263 tests | Developer tooling that validates Portaldot runtime behaviour against documentation. Different focus from bonded storage verification |
| **PortalKit** | `create-portalkit-app` scaffolder, doctor command, plus an ERC-4626 RWA vault with simulated KYC | Broader developer-experience play; shallower at the chain level |
| **PortalOps / Pindex / PalletDock** | Event/webhook layer with MCP; metadata-driven indexer with REST+GraphQL; contract workspace with hosted API | Infrastructure we would *use*, not compete with. None of them can punish a provider |
| **Reachpot** | Uses `TransactionStorage` for a hash-pinned snapshot, plus native-asset and DEX precompiles, full lifecycle on testnet | Anchors snapshots using `TransactionStorage`; complementary focus to holding active storage providers accountable |
| **Kaizen / Katalyst / AirLock** | Node-ops resilience drills with on-chain anchors; GenLayer-decided vaults; a payout firewall with a recorded 4 tPOT attack stopped | Projects covering node resilience, AI-evaluated vaults, and transaction firewalls. Different problem domains; none provides a bonded storage-proof mechanism |

**What we do not do, stated plainly.** We are not a bridge, an indexer, an event/webhook layer, a
runtime-vs-docs checker, a scaffolder or an agent-payments rail. A read-only MCP server exists
(`apps/makhzan-mcp`, keyless and safe). We use no Portaldot-native module in the live path — the
`TransactionStorage` anchor is a plan, not a shipped feature. We do not promise refunds of the storage
reserve (refundability is unmeasured and contested). We do not verify continuous storage, bandwidth
or availability. We have one provider, one operator and two deals, and no consumer beyond the local
`StorageGate` demo <!-- [update after live gate] -->.

## 9. 30 / 60 / 90 days

All of this is `[design note]`; none of it is built. Ordered by what would change a judge's mind
fastest, and constrained by the fact that a contract change means a `529.844 tPOT` redeploy.

**Days 0–30 — make the guarantee real at scale.**
1. One independent provider (not us) completes a full deal, so the "one operator" caveat dies.
2. A multi-MiB deal — target 1 GiB — to test proof length, answer gas and the flat price at real size.
3. A day-scale deal (288 rounds), which is the first configuration where the detection maths in §7 is
   honest rather than a caveat.
4. v2 contract with `window`, `slashBps` and a **per-deal bond or bond scaling** as parameters, plus a
   challenger reward paid from the slash. Tests first, then one redeploy.
5. Keep `V3-GOTCHAS.md` current and pitch it as a findings page the Portaldot docs can link to.

**Days 31–60 — make it usable without our keys.**
1. `TransactionStorage` manifest anchor written and read back by `verify` (native path; needs a
   signer we do not have today).
2. Read-only MCP server exposing `verify`, `health` and `deal`, reusing the existing keyless client.
3. Three design-partner conversations with a concrete price question — "would you pay X per dataset
   root per day, and what would you drop to afford it" — to replace §1's hypothesis with evidence.
4. A pricing experiment on testnet: two or three price points across comparable deals, measured.

**Days 61–90 — make it defensible.**
1. A randomness answer: a VRF, or a documented portaldot-native source, or an explicit "we accept the
   fallback and here is the bound". No third option.
2. External audit of the slash and settle paths — the money paths, not the Merkle library.
3. Multi-provider, with bond sizing that scales with total storage under management.
4. A published per-deal cost model with real provider opex (storage, bandwidth, ops), so the price can
   stop being a demo number.
5. Fiat pricing only if a feed exists; until then, quote tPOT and say so.

## 10. What Foundation support would unlock

Not "more marketing". Four specific things, in order of what unblocks what:

| Support | What it unblocks | Why it is not optional |
| --- | --- | --- |
| **Redeploy budget** (~530 tPOT EVM, or ~131 tPOT deposit plus fees on the native path) | Per-deal bonds, parameterised window/slash, challenger reward | The current contract cannot be re-parameterised. Every fix in §9 is behind that one cost |
| **A funded independent provider** (bond 30 tPOT, register 11.537715357304598880 tPOT, plus that provider's own gas) | A third-party deal, a real track record, multi-provider health | One-operator evidence is the weakest part of the technical story |
| **Budget for a day-scale deal** (22 hunting rounds = 0.674 tPOT of client gas; the provider pays 0.1629 per answer) | 288 rounds, so §7 stops being a caveat | Detection maths only becomes honest at that duration |
| **An answer on randomness, and on native deposit refundability** | Whether the selector can ship, and whether we may promise a refund | Both are currently "unmeasured and contested"; both decide what a v2 can claim |

Beyond money, two things are worth more than they cost: an **audit** of the two money paths, and a
listing in the Portaldot docs/ecosystem so a provider can find this without reading a hackathon repo.
The RPC matters too — the public endpoint prunes old receipts, which is why `verify` reports `UNKNOWN`
instead of guessing, and why we keep receipts in `evidence/`.

## 11. What this document does not claim

- No interviews, no customers, no revenue, no letter of intent. §1 is a hypothesis.
- No fiat price, no exchange rate, no USD figure (`A8`).
- No tariff: `5 tPOT` is a demo value, and the per-GiB-month arithmetic is not a rate card.
- No claim that the demo deal length is sufficient for the security argument — §7 says the opposite.
- No claim about randomness quality, provider independence, retrieval bandwidth, or refundability.
- No competitor claim verified on chain; §8 is their READMEs.
- No projection of deal volume, market size or growth. We have two deals.
