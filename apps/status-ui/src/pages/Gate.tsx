import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { BlockLink } from "../components/BlockLink";
import { useMode } from "../app/app-context";
import { useEvidence } from "../data/evidence-context";
import { guardDecision, releaseVerdict } from "../data/gate";
import { formatCount, formatNative, formatWei, formatWeiAsNative } from "../data/labels";
import type { ReadClient } from "../data/client";
import { useGate } from "../data/use-gate";
import { healthLabel } from "../data/health";
import { Card } from "../components/shared/Card";
import { Chip } from "../components/shared/Chip";

function Field({
  name,
  value,
  unit,
  detail,
  testId,
}: {
  name: string;
  value: ReactNode;
  unit?: string;
  detail?: string;
  testId?: string;
}) {
  return (
    <div className="border-t border-line py-3 sm:grid sm:grid-cols-[11rem_1fr] sm:gap-4 sm:items-start">
      <dt className="text-xs font-mono uppercase tracking-wider text-muted">{name}</dt>
      <dd className="min-w-0 text-sm" data-testid={testId}>
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="numeral font-mono font-semibold text-ink break-words">{value}</span>
          {unit ? <span className="text-muted"> {unit}</span> : null}
          <Chip label="MEASURED" />
        </div>
        {detail ? <p className="mt-1 break-all text-[15px] text-muted">{detail}</p> : null}
      </dd>
    </div>
  );
}

const DECISION_TEXT: Record<ReturnType<typeof guardDecision>, string> = {
  healthy: "healthy — no open challenge and still inside the term",
  pending: "pending — a challenge is open and still inside its response window",
  default: "default — a challenge is open and past its deadline, unresolved",
  "settled-or-none": "settled or none — the deal is settled, or the id never existed",
  expired: "expired — no open challenge, but the term is over",
};

/**
 * The StorageGate consumer, read from outside: one payment per deal, released only while the guard
 * says healthy and the payee's bond clears the floor. Everything here is a view.
 */
export function Gate({ client }: { client?: ReadClient }) {
  const mode = useMode();
  const evidence = useEvidence();
  const bundle = evidence.bundle;
  const [dealId, setDealId] = useState(2);
  const [typed, setTyped] = useState("2");
  const live = useGate(mode, dealId, { client });

  const gate = mode.gateAddress;
  const recorded = bundle?.deals.find((deal) => deal.id === dealId) ?? null;
  const decision =
    live.health !== null && live.block !== null && live.endBlock !== null
      ? guardDecision(live.health, live.block, live.endBlock)
      : null;
  const verdict =
    live.lock !== null && decision !== null && live.bondUnits !== null
      ? releaseVerdict({
          status: live.lock.status,
          decision,
          minBondUnits: live.lock.minBondUnits,
          bondUnits: live.bondUnits,
        })
      : null;
  const bondMismatch =
    live.provider !== null && live.dealProviderId !== null && live.provider.id !== live.dealProviderId;

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const next = Number(typed);
    if (Number.isSafeInteger(next) && next >= 0 && next <= 4_294_967_295) setDealId(next);
  };

  return (
    <section className="space-y-12">
      <header>
        <p className="eyebrow">08 / gate</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-gold-bright">The gate that pays on a healthy deal</h1>
        <p className="mt-3 max-w-[68ch] text-muted leading-relaxed">
          <span className="mono font-mono font-semibold text-ink">StorageGate</span> is a consumer of Makhzan: it holds one payment per
          deal and lets the payee take it only while the deal is healthy and inside its term, or back to
          the payer after a default. This page reads it; it cannot lock, release or refund anything.
        </p>
      </header>

      {mode.gateAddressError !== null ? (
        <Card as="section" className="border border-danger bg-surface p-6">
          <h2 className="text-lg font-bold text-gold-bright">The gate address is not usable</h2>
          <p className="mt-2 max-w-[62ch] text-sm text-muted">{mode.gateAddressError}</p>
          <p className="mt-2 text-xs text-muted">
            No address is shown, because a guess here would be a lie about what was deployed.
          </p>
          <p className="mt-3">
            <Chip label="MEASURED" />
          </p>
        </Card>
      ) : gate === null ? (
        <>
          <Card as="section" className="border border-line bg-surface p-6">
            <h2 className="text-lg font-bold text-gold-bright">StorageGate is not deployed yet</h2>
            <p className="mt-2 max-w-[62ch] text-sm text-muted">
              This build sets no <span className="mono font-mono text-ink">VITE_GATE_ADDRESS</span>, so there is nothing to
              read and no address is invented here. The contract and its tests live in{" "}
              <span className="mono font-mono text-ink break-all">contracts/src/makhzan/StorageGate.sol</span>; when a deployment sets
              that variable, this page reads the lock, the guard decision and the payee's bond.
            </p>
            <p className="mt-3">
              <span className="label-chip" data-label="DESIGN NOTE">
                DESIGN NOTE
              </span>
            </p>
          </Card>

          <Card as="section" aria-labelledby="explain-heading" className="p-6">
            <h2 id="explain-heading" className="eyebrow text-gold-bright font-semibold">
              The limit worth knowing
            </h2>
            <p className="mt-2 max-w-[62ch] text-sm text-muted">
              healthOf == 1 means no open challenge, not proof the file is stored; minBond is how a
              consumer notices a past slash.
            </p>
            <ul className="mt-3 max-w-[62ch] list-disc space-y-2 pl-5 text-sm text-muted">
              <li>
                A deal that was slashed can still report health 1 afterwards. A lock with a non-zero{" "}
                <span className="mono font-mono text-ink">minBond</span> is how a consumer notices: the payee's bond has
                shrunk, so release reverts <span className="mono font-mono text-ink">BondTooLow</span>.
              </li>
              <li>
                An expired deal still reports health 1, because <span className="mono font-mono text-ink">healthOf</span>{" "}
                never reads the end block. The guard adds that check, and so does this page.
              </li>
              <li>
                The gate counts the <em>payee's</em> provider record, and only when its id is the deal's
                provider id. Any other payee has no bond to prove and reads as 0.
              </li>
              <li>Read-only: every value here is one <span className="mono font-mono text-ink">eth_call</span> at one block.</li>
            </ul>
          </Card>
        </>
      ) : (
        <>
          <Card as="section" aria-labelledby="address-heading" className="p-6">
            <h2 id="address-heading" className="eyebrow text-gold-bright font-semibold">
              What it reads
            </h2>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="border-t border-line py-3 sm:grid sm:grid-cols-[11rem_1fr] sm:gap-4">
                <dt className="text-xs font-mono uppercase tracking-wider text-muted">Gate address</dt>
                <dd className="hash text-xs">{gate}</dd>
              </div>
              <div className="border-t border-line py-3 sm:grid sm:grid-cols-[11rem_1fr] sm:gap-4">
                <dt className="text-xs font-mono uppercase tracking-wider text-muted">Makhzan address</dt>
                <dd className="mono break-all font-mono text-xs">
                  {mode.address ? (
                    <Link
                      to="/"
                      className="underline text-ink hover:text-gold-bright"
                      aria-label="Makhzan deployment overview"
                    >
                      {mode.address}
                    </Link>
                  ) : (
                    "not configured"
                  )}
                </dd>
              </div>
            </dl>
          </Card>

          <Card as="section" aria-labelledby="deal-heading" className="p-6">
            <h2 id="deal-heading" className="eyebrow text-gold-bright font-semibold">
              Which deal
            </h2>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {[1, 2].map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={dealId === id}
                  aria-label={`Select deal ${id}`}
                  onClick={() => {
                    setDealId(id);
                    setTyped(String(id));
                  }}
                  className={`min-h-[44px] rounded-full px-4 py-2 font-mono text-xs font-semibold transition-colors ${
                    dealId === id
                      ? "bg-gold text-on-gold"
                      : "border border-line bg-surface text-ink hover:border-line-strong hover:bg-surface-2"
                  }`}
                >
                  Deal {id}
                </button>
              ))}
              <form onSubmit={submit} className="flex flex-wrap items-center gap-3">
                <label htmlFor="gate-deal-id" className="text-xs font-mono uppercase tracking-wider text-muted font-medium">
                  Deal id
                </label>
                <input
                  id="gate-deal-id"
                  type="number"
                  min={0}
                  max={4_294_967_295}
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                  className="min-h-[44px] w-24 rounded-xl border border-line bg-surface px-3 py-2 font-mono text-xs text-ink shadow-xs focus:border-line-strong focus:outline-none"
                />
                <button
                  type="submit"
                  className="min-h-[44px] rounded-full border border-line bg-surface px-5 py-2 font-mono text-xs font-semibold text-ink hover:border-line-strong hover:bg-surface-2"
                >
                  Read
                </button>
              </form>
            </div>
          </Card>

          <Card as="section" aria-labelledby="read-heading" className="p-6">
            <h2 id="read-heading" className="eyebrow text-gold-bright font-semibold">
              What the gate would see for deal {formatCount(dealId)}
            </h2>

            {live.status === "off" ? (
              <p className="mt-3 max-w-[62ch] text-sm text-muted">
                This build makes no live read: the mode is {mode.mode}, so no client is open. Set a
                live mode with an RPC URL to measure the gate.
              </p>
            ) : live.status === "blocked" ? (
              <p className="mt-3 max-w-[62ch] text-sm text-muted">{live.blockingDetail}</p>
            ) : live.status === "no-code" ? (
              <p data-testid="gate-no-code" className="mt-3 max-w-[62ch] text-sm text-muted">
                There is no contract at <span className="hash text-ink">{gate}</span> on chain{" "}
                {mode.expectedChainId}. The address is configured, but nothing is deployed there — so
                no lock is read and none is invented.
              </p>
            ) : live.status === "error" ? (
              <p className="mt-3 max-w-[62ch] text-sm text-muted">
                The read failed: {live.error}. Nothing below is filled in from a guess.
              </p>
            ) : live.status === "checking" ? (
              <p className="mt-3 text-sm text-muted">Reading the gate…</p>
            ) : null}

            {live.status === "live" && live.lock !== null ? (
              <div data-testid="gate-live" data-deal-id={dealId}>
                <dl className="mt-3">
                  <Field
                    name="Lock status"
                    value={live.lock.status}
                    testId="gate-lock-status"
                    detail={`lockOf(${dealId}).status = ${live.lock.statusCode}`}
                  />
                  <Field name="Payer" value={<span className="mono text-xs font-mono">{live.lock.payer}</span>} />
                  <Field name="Payee" value={<span className="mono text-xs font-mono">{live.lock.payee}</span>} />
                  <Field
                    name="Amount"
                    value={formatWeiAsNative(live.lock.amountWei ?? live.lock.amountUnits)}
                    unit="tPOT"
                    detail={`${formatWei(live.lock.amountWei ?? live.lock.amountUnits)} wei`}
                  />
                  <Field
                    name="Min bond"
                    value={
                      live.lock.minBondUnits === "0"
                        ? "no floor"
                        : formatNative(live.lock.minBondUnits)
                    }
                    unit={live.lock.minBondUnits === "0" ? undefined : "tPOT"}
                    detail={`${formatWei(live.lock.minBondUnits)} planck`}
                  />
                  <Field
                    name="Deal health"
                    value={live.health === null ? "not read" : `healthOf = ${live.health}`}
                    unit={live.health === null ? undefined : `(${healthLabel(live.health)})`}
                    testId="gate-health"
                    detail={`read at block ${formatCount(live.block ?? 0)}`}
                  />
                  <Field
                    name="End block"
                    value={<BlockLink block={live.endBlock} />}
                    detail={
                      live.block === null
                        ? undefined
                        : live.endBlock !== null && live.block >= live.endBlock
                          ? `block ${formatCount(live.block)} is at or past the end block`
                          : `block ${formatCount(live.block)} is still inside the term`
                    }
                  />
                  <Field
                    name="Guard decision"
                    value={decision === null ? "not read" : decision}
                    testId="gate-decision"
                    detail={decision === null ? undefined : DECISION_TEXT[decision]}
                  />
                  <Field
                    name="Provider bond"
                    value={
                      live.bondUnits === null
                        ? "not read"
                        : formatNative(live.bondUnits)
                    }
                    unit={live.bondUnits === null ? undefined : "tPOT"}
                    testId="gate-bond"
                    detail={
                      live.provider === null
                        ? "the payee has no provider record, so the gate counts 0"
                        : bondMismatch
                          ? `the payee is provider ${live.provider.id}, but deal ${dealId} names provider ${live.dealProviderId ?? "none"}; the payee is not the deal's provider, so the gate counts 0`
                          : `providerOf(payee) = provider ${live.provider.id}, the same id the deal names`
                    }
                  />
                </dl>

                {live.lock.status === "released" ? (
                  <div
                    data-testid="gate-released"
                    className="mt-6 rounded-2xl border border-line bg-surface-2 p-4 text-sm text-ink"
                  >
                    <p className="font-mono font-semibold">
                      Released: {formatWeiAsNative(live.lock.amountWei ?? live.lock.amountUnits)} tPOT paid to the payee
                    </p>
                    <p className="mt-2 text-xs text-muted">
                      The payment was released to payee {live.lock.payee}.
                    </p>
                  </div>
                ) : live.lock.status === "refunded" ? (
                  <div
                    data-testid="gate-refunded"
                    className="mt-6 rounded-2xl border border-line bg-surface-2 p-4 text-sm text-ink"
                  >
                    <p className="font-mono font-semibold">
                      Refunded: {formatWeiAsNative(live.lock.amountWei ?? live.lock.amountUnits)} tPOT returned to the payer
                    </p>
                    <p className="mt-2 text-xs text-muted">
                      The payment was refunded to payer {live.lock.payer}.
                    </p>
                  </div>
                ) : live.lock.status === "locked" ? (
                  <div
                    data-testid="gate-verdict"
                    className={`mt-6 rounded-2xl border p-4 text-sm ${
                      verdict?.kind === "pass"
                        ? "border-ok bg-ok-surface text-ok"
                        : "border-danger bg-danger-surface text-danger"
                    }`}
                  >
                    <p className="font-mono font-semibold">
                      {verdict === null
                        ? "the verdict is not readable yet"
                        : verdict.kind === "pass"
                          ? "release would pass now"
                          : `release would revert: ${verdict.name}`}
                    </p>
                    <p className="mt-2 text-xs text-muted">
                      The guard checks expiry before the bond floor, so an expired deal shows Expired even if the bond is too low.
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      Assuming the recorded payee sends the transaction, at block{" "}
                      {formatCount(live.block ?? 0)}. This page cannot send it, and it does not know who
                      will.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </Card>

          <Card as="section" aria-labelledby="evidence-heading" className="p-6">
            <h2 id="evidence-heading" className="eyebrow text-gold-bright font-semibold">
              What the evidence recorded
            </h2>
            <p data-testid="gate-evidence" className="mt-2 max-w-[62ch] text-sm text-muted">
              {recorded === null ? (
                <>
                  Deal {formatCount(dealId)} is not in the evidence bundle
                  {bundle === null ? " (it has not loaded)" : ` (${bundle.id})`}, so only the live reads
                  above describe it. <Chip label="REPORTED" />
                </>
              ) : (
                <>
                  The evidence bundle records deal {recorded.id}: {formatNative(recorded.priceUnits)} tPOT
                  for blocks {formatCount(recorded.startBlock)} to {formatCount(recorded.endBlock)},
                  provider {recorded.providerId}. <Chip label="REPORTED" />
                </>
              )}
            </p>
          </Card>

          <Card as="section" aria-labelledby="live-gate-demo-heading" className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
              <h2 id="live-gate-demo-heading" className="eyebrow text-gold-bright font-semibold">
                Live gate demo
              </h2>
              <Chip label="REPORTED" />
            </div>
            <p className="mt-2 max-w-[64ch] text-sm text-muted">
              Recorded live-run gate operations and refusal results from <span className="mono font-mono text-ink">evidence/raw/t8/</span> on chain 420420777.
            </p>

            <div className="mt-4 space-y-4">
              <div className="rounded-xl border border-line bg-surface-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-mono text-sm font-bold text-gold-bright">
                    Deal 3: lock refused Expired
                  </h3>
                  <Chip label="REPORTED" />
                </div>
                <p className="mt-1.5 text-xs text-muted leading-relaxed">
                  Deal 3 was created at block 250,092 (term 600 blocks, endBlock 250,692). The lock transaction simulation at block 251,940 was refused by the guarded CLI because <span className="font-mono text-ink">block &gt;= endBlock</span> (Expired). 0 gas was spent.
                </p>
                <dl className="mt-2.5 grid grid-cols-1 gap-1 text-xs sm:grid-cols-[6.5rem_1fr]">
                  <dt className="font-mono text-muted">Create tx</dt>
                  <dd className="font-mono text-ink break-all">0x196d1ab6b059441ad92a17e83d98b5da2f8fa8c223ed6f79a42df238284689ee</dd>
                  <dt className="font-mono text-muted">Refusal</dt>
                  <dd className="font-mono text-danger font-semibold">call would revert with Expired (at block 251,940)</dd>
                </dl>
              </div>

              <div className="rounded-xl border border-line bg-surface-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-mono text-sm font-bold text-gold-bright">
                    Deal 4: locked and released (2 tPOT to provider-1)
                  </h3>
                  <Chip label="REPORTED" />
                </div>
                <p className="mt-1.5 text-xs text-muted leading-relaxed">
                  Deal 4 was created at block 252,512, locked with 2 tPOT (minBond 20 tPOT) at block 252,523, and successfully released 2 tPOT to provider-1 at block 252,538 while provider bond was 24 tPOT.
                </p>
                <dl className="mt-2.5 grid grid-cols-1 gap-1 text-xs sm:grid-cols-[6.5rem_1fr]">
                  <dt className="font-mono text-muted">Create tx</dt>
                  <dd className="font-mono text-ink break-all">0x853225285c317dc91de4ecc9aee61be950fad7801ea64fcf25d79710d1104761</dd>
                  <dt className="font-mono text-muted">Lock tx</dt>
                  <dd className="font-mono text-ink break-all">0x3719248237ec37c916b11e3d014aebba05d84cedcdcdc79cc1b9feaa18a62203</dd>
                  <dt className="font-mono text-muted">Release tx</dt>
                  <dd className="font-mono text-ink break-all">0x4c63d339e7db1cfa9ef7b48194d38f6b2c2613f60d6cf0d3d3c6afbbc6d35c3f</dd>
                </dl>
              </div>

              <div className="rounded-xl border border-line bg-surface-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-mono text-sm font-bold text-gold-bright">
                    Deal 5: release refused BondTooLow &amp; refund refused RefundNotAllowed
                  </h3>
                  <Chip label="REPORTED" />
                </div>
                <p className="mt-1.5 text-xs text-muted leading-relaxed">
                  Deal 5 was locked with minBond 30 tPOT. At block 252,560, release was refused because provider-1 active bond (24 tPOT) was below the 30 tPOT floor (BondTooLow). At block 252,564, refund was refused because the deal was healthy and before endBlock (RefundNotAllowed).
                </p>
                <dl className="mt-2.5 grid grid-cols-1 gap-1 text-xs sm:grid-cols-[6.5rem_1fr]">
                  <dt className="font-mono text-muted">Create tx</dt>
                  <dd className="font-mono text-ink break-all">0x12557be0d42359a70cbb22acd05310efff94c1bd19223c7d524e8c59400662be</dd>
                  <dt className="font-mono text-muted">Lock tx</dt>
                  <dd className="font-mono text-ink break-all">0xf84af2e383b8239c350a16bdf074a14925cd954cacd3ca25ec1621a5fcf869db</dd>
                  <dt className="font-mono text-muted">Release refusal</dt>
                  <dd className="font-mono text-danger font-semibold">revert BondTooLow at block 252560 (active bond 24.0 tPOT &lt; floor 30.0 tPOT)</dd>
                  <dt className="font-mono text-muted">Refund refusal</dt>
                  <dd className="font-mono text-danger font-semibold">revert RefundNotAllowed at block 252564 (healthy, block 252564 &lt; endBlock 255544)</dd>
                </dl>
              </div>
            </div>
          </Card>

          <Card as="section" aria-labelledby="explain-heading" className="p-6">
            <h2 id="explain-heading" className="eyebrow text-gold-bright font-semibold">
              The limit worth knowing
            </h2>
            <p className="mt-2 max-w-[62ch] text-sm text-muted">
              healthOf == 1 means no open challenge, not proof the file is stored; minBond is how a
              consumer notices a past slash.
            </p>
            <ul className="mt-3 max-w-[62ch] list-disc space-y-2 pl-5 text-sm text-muted">
              <li>
                A deal that was slashed can still report health 1 afterwards. A lock with a non-zero{" "}
                <span className="mono font-mono text-ink">minBond</span> is how a consumer notices: the payee's bond has
                shrunk, so release reverts <span className="mono font-mono text-ink">BondTooLow</span>.
              </li>
              <li>
                An expired deal still reports health 1, because <span className="mono font-mono text-ink">healthOf</span>{" "}
                never reads the end block. The guard adds that check, and so does this page.
              </li>
              <li>
                The gate counts the <em>payee's</em> provider record, and only when its id is the deal's
                provider id. Any other payee has no bond to prove and reads as 0.
              </li>
              <li>Read-only: every value here is one <span className="mono font-mono text-ink">eth_call</span> at one block.</li>
            </ul>
          </Card>
        </>
      )}
    </section>
  );
}
