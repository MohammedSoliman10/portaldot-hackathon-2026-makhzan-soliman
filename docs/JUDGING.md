# JUDGING — criterion-to-evidence map

This page maps the four judging criteria to what is actually in the repository. It is written to be
useful to a sceptical judge: every claim points at a file, and every section names the weak spot that
should reduce the score. Labels follow the project convention — `[measured]`, `[reported by another
team]`, `[design note]`.

**Scope reminder.** The live chain work is one contract and two deals, run by this team with our own
provider. It is not a production network, and no third party has used it. Local numbers come from
Foundry/anvil; live numbers come from Portaldot V3 (`chain id 420420777`, spec `3002`).

## At a glance

| Criterion | Weight | What we can defend | Honest verdict |
| --- | --- | --- | --- |
| Technical Feasibility | 30 | Deployed and exercised end-to-end on a public testnet; 208 contract tests (unit, fuzz, invariant), 171 client tests, keyless live audit, byte-for-byte deployment check, a consumer gate demo | **Strong**, with one-operator, fallback-randomness and local-gate caveats |
| Innovation | 30 | Merkle commitment + challenge/slash + evidence bundle + keyless verification in one small flow | **Modest**; the primitives are known, the packaging is the contribution |
| Ecosystem Contribution | 20 | Measured Portaldot V3 gotchas, native dry-run and TransactionStorage facts, docs-vs-evidence check, reusable client patterns | **Useful but small**; no upstream PR, no SDK, no third-party adoption |
| Business Potential | 20 | A clear payer hypothesis and a cost model that can be tested | **Unvalidated**; no interviews, no pricing test, no paying user |

---

## 1. Technical Feasibility — 30 points

**Claim.** One Solidity contract can hold a Merkle root, open a challenge, verify an answer, slash a
non-answer, and release payment; a separate keyless client can audit every step from chain data.

| Evidence | What it shows |
| --- | --- |
| `evidence/raw/t1/59-live-deploy.txt` | Deploy on Portaldot V3: tx `0xf29a52c5…e3e7`, block `171308`, config read back, `code 6566 B` |
| `evidence/raw/t1/60-live-pass.txt`, `64`–`72` | Live register, deal A, one passed challenge, one slashed challenge (exactly 20%), claim, settle |
| `evidence/raw/t1/76-verify-deal1.txt`, `77-verify-deal2.txt` | Keyless `verify`: `RESULT: PASS (7 pass…)` and `PASS (9 pass…)`, exit `0` only on PASS |
| `evidence/raw/t1/75-live-retrieval.txt` | Fresh client rebuilt 1 MiB as 1,024 blocks, sha256 matched, tampered copy rejected with `ProofRejected` |
| `evidence/raw/t1/85-gate-live2g.txt` | `forge test`: **152 passed**; Makhzan **157**, gates **49**, scanner **6**, docs-hygiene **5**; e2e PASS |
| `evidence/verify-deployment.json` | Deployed runtime equals the artifact byte for byte, `firstDiff: null` |
| `evidence/raw/t1/48-e2e-local.txt` | Local SC-001/SC-002 run from deploy to settle, one command |
| `evidence/raw/t1/101-gate-demo-local.txt` | `gate-demo` on local anvil: deploy, lock with a bond floor, release while healthy, challenge/expire/resolve (slash), `BondTooLow`, `RefundNotAllowed`, refund at the end block, gate balance `0` |
| `evidence/raw/t1/100-gate-deploy.txt`, `102-size-check-gate.txt` | StorageGate deploys through the same dry run and pending record as Makhzan, `2,528 B` runtime against a `2,600 B` budget enforced next to Makhzan's |
| `evidence/raw/t1/78-chain-facts.txt`, `79-account-mapping-deposits.txt` | Chain constants, H160→AccountId32 mapping, deposit split reconciled against `system.account.reserved` |

**Weak spots (discount these).**

- One operator: the owner, provider and daemon are all ours. There is no third-party provider, no
  independent key holder, and no adversarial participant.
- Scale: 1 MiB / 1,024 blocks in the demo. Nothing here proves behaviour at 1 GiB or with hundreds of
  concurrent deals.
- Challenge index comes from the documented D5 fallback, not a VRF. A miner-style adversary with block
  control is discussed in `docs/THREAT_MODEL.md` but not defeated by this design.
- Retrieval is not incentivised beyond the bond. A provider can hold the root commitment and still fail
  to serve bytes; the current slash covers an unanswered challenge, not a bandwidth drought.
- No audit, no formal verification, no fuzzing of the TypeScript client.
- The EVM deploy was expensive (`529.844316817465986480 tPOT` total); the native dry-run shows a
  different storage-deposit charge (`130.9395 tPOT`) and a fee estimate around `0.7467 tPOT`
  (`evidence/raw/t1/86-native-deploy-dryrun.txt`), but no native deploy was executed.
- The consumer gate is **local only**: never deployed to Portaldot, no third party has used it, and its
  bond floor is read in the same transaction as the payment. A floor of `0` disables the check, and the
  floor only works when the payee is the provider's registered address (`docs/EXPLAIN.md`,
  `docs/THREAT_MODEL.md`).

**What would raise this score.** An independent provider completing a full deal, a multi-megabyte
run, and a measured retrieval-incentive path.

---

## 2. Innovation — 30 points

**Claim.** The contribution is the *packaging*: a small contract that turns "do you still have my
file?" into a challenge with money at risk, plus an evidence bundle that a third party can re-check
without our keys.

| Evidence | What it shows |
| --- | --- |
| `contracts/src/makhzan/` + `docs/architecture.md` | Merkle root, challenge window, packed slot layout, bond/slash, escrow, settle |
| `evidence/raw/t1/75-live-retrieval.txt` | The verifier is the client: no trusted server in the retrieval check |
| `evidence/raw/t1/76-verify-deal1.txt`, `77-verify-deal2.txt` | A judge can audit a deal from public chain data with no key |
| `evidence/raw/t1/54-evidence-green.txt`, `58-daemon-evidence-red.txt` | Evidence is produced from read-back state, not from optimistic logs |
| `evidence/raw/t1/86-native-deploy-dryrun.txt` | Native-vs-EVM cost behaviour measured, not assumed |
| `docs/V3-GOTCHAS.md` | Chain-specific traps found by measurement (gas band, deposit split, receipt timeout) |

**Weak spots (discount these).**

- The cryptography is standard: Merkle trees, keccak, ECDSA. No new proof system, no erasure coding,
  no zero-knowledge anything.
- Proof-of-storage designs are well represented (Filecoin, Arweave, Crust, PDP/PoR literature). This
  is a compact variant for an EVM-compatible Substrate chain, not a new category.
- The "innovation" is mostly integration and honesty of evidence. A judge who weights novel
  cryptography heavily should score this low.
- The status UI and verify flow are conveniences; they are not research contributions.

**What would raise this score.** A retrieval-sampling mechanism that prices bandwidth, or a
cross-chain attestation that makes the receipt useful outside this contract.

---

## 3. Ecosystem Contribution — 20 points

**Claim.** We measured a young chain carefully and published what we found, including the parts that
contradicted our own earlier notes.

| Evidence | What it shows |
| --- | --- |
| `docs/V3-GOTCHAS.md` | Ten measured sections: via-IR accepted, deploy cost and its split, gas band, `10,000 wei` factor and ED, 15 s receipt trap, custom selectors, H160 mapping, deposit split, no answer/settle refund, TransactionStorage facts |
| `evidence/raw/t1/78-chain-facts.txt` | TransactionStorage metadata, fees for 0 B…4 MiB, retention semantics, scanner block URL |
| `evidence/raw/t1/79-account-mapping-deposits.txt` | `accountInfoOf` split = `system.account.reserved`, `nativeDepositOf` empty |
| `evidence/raw/t1/81-deploy-cost.txt` | The deploy-cost split, labelled as inferred where the receipt has no field |
| `evidence/raw/t1/86-native-deploy-dryrun.txt`, `87-txstorage-store.txt` | Native instantiate dry-run and whether a store would be authorized |
| `scripts/docs-hygiene.mjs` | Every address/hash/block/amount in README and CHECKIN must exist in `evidence/` |
| `docs/decisions.md` | Decisions and reversals recorded with dates, including T1-003 and the deploy-cost correction |

**Weak spots (discount these).**

- No upstream contribution: no PR to polkadot-sdk, no Portaldot documentation patch, no published SDK.
- The findings are point-in-time (spec `3002`, specific block heights). A runtime upgrade can invalidate
  them, and we do not run a watcher.
- The repository is small and has no external users; "ecosystem contribution" here means reusable
  documentation and patterns, not adoption.
- `docs-hygiene` covers only two files, so other docs can drift.

**What would raise this score.** A merged upstream docs/PR, or another team using the H160 mapping and
deposit-reconciliation snippets.

---

## 4. Business Potential — 20 points

**Claim (hypothesis, not validation).** Teams that must prove they still hold data — storage
providers, backup vendors, archives, compliance teams — could pay per deal for a challengeable
receipt instead of trusting logs.

| Evidence | What it shows |
| --- | --- |
| `README.md` → "Who would pay and why" | The payer hypothesis, stated as a hypothesis with no validation claimed |
| `evidence/raw/t1/28-payments-green.txt`, `49-settle-claimed-green.txt` | Price escrow, claim, settle and exactly-once accounting work |
| `evidence/raw/t1/81-deploy-cost.txt`, `86-native-deploy-dryrun.txt` | A cost basis for a per-deal price, measured rather than guessed |
| `docs/THREAT_MODEL.md` | What the bond does and does not cover, so a buyer can price the risk |

**Weak spots (discount these, heavily).**

- Zero customer evidence: no interviews, no LOIs, no willingness-to-pay survey, no pricing test.
- The only live deals are ours. There is no paying user and no design partner.
- Costs are testnet-denominated and the native path is not productised; a real price would need
  mainnet fees, storage cost and support cost.
- The buyer is not obvious: a storage provider may prefer its own audits, and a compliance buyer may
  need certifications we do not have.
- Competition is strong and better funded; switching costs favour incumbents.

**What would raise this score.** One design partner running a real file, and a written price the
partner accepts. Until then this criterion should be scored as unvalidated.

---

## How to re-check this page

Every file above is in the repository at the commit that carries this page. The commands in
`docs/REPRODUCE.md` re-run the core live audit and the local retrieval/tamper checks in about five
minutes. If a number here and a number in `evidence/` disagree, the evidence file wins.
