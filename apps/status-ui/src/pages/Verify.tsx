import { useMemo, useState, type DragEvent } from "react";
import { useParams } from "react-router-dom";
import { getPath, verify as verifyPath } from "@makhzan/merkle";
import { useMode } from "../app/app-context";
import { createReadClient } from "../data/client";
import { useEvidence } from "../data/evidence-context";
import { blockAt, buildFileTree, firstMismatchingBlock, type FileTree, type FileTreeOptions } from "../data/file-tree";
import { formatCount, type Label } from "../data/labels";
import { readFileBytes } from "../data/read-file";
import { runRefusal, type RefusalOutcome, type RefusalRunOptions } from "../data/refusal-run";
import { REFUSAL_CALLER, REFUSAL_CALLS, calldataFor, type RefusalCall, type RefusalId } from "../data/refusals";
import { loadSample, SAMPLE } from "../data/sample";
import { sha256Hex } from "../data/sha256";
import type { Hex } from "../data/schema";
import { useLiveDeployment, type LiveOptions } from "../data/use-live";
import { Card } from "../components/shared/Card";
import { Chip } from "../components/shared/Chip";

export interface VerifyOptions extends LiveOptions {
  fetchImpl?: typeof fetch;
  buildOptions?: FileTreeOptions;
  refusalOptions?: RefusalRunOptions;
}

interface LoadedFile {
  name: string;
  bytes: Uint8Array;
  sha256: Hex;
  tree: FileTree;
  source: "sample" | "file";
}

interface Work {
  name: string;
  stage: "reading" | "sha256" | "hashing" | "levels";
  done: number;
  total: number;
}

interface TamperResult {
  index: number;
  root: Hex;
  rejected: boolean;
}

function Field({
  name,
  value,
  unit,
  detail,
  label,
  source,
  mono = false,
}: {
  name: string;
  value: string;
  unit?: string;
  detail?: string;
  label: Label;
  source: string;
  mono?: boolean;
}) {
  return (
    <div className="border-t border-slate-100 py-3 sm:grid sm:grid-cols-[10rem_1fr] sm:gap-4 sm:items-start">
      <dt className="text-xs font-mono uppercase tracking-wider text-slate-500">{name}</dt>
      <dd className="mt-1 text-sm sm:mt-0">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className={`break-all font-semibold text-slate-900 ${mono ? "mono font-mono" : "numeral font-mono"}`}>{value}</span>
          {unit ? <span className="text-xs text-slate-500"> {unit}</span> : null}
          <Chip label={label} />
        </div>
        {detail ? <p className="mono mt-1 break-all text-xs text-slate-500">{detail}</p> : null}
        <p className="mono mt-1 break-words text-[11px] text-slate-400">{source}</p>
      </dd>
    </div>
  );
}

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Recomputes the deal's Merkle root in the browser and compares it with the root the chain holds.
 *
 * The bytes never leave the tab: the file is hashed in chunks so a large file shows progress instead
 * of freezing, and the tree comes from the shared Merkle module the contract's tests use.
 */
export function Verify(options: VerifyOptions) {
  const { fetchImpl, buildOptions, refusalOptions, ...liveOptions } = options;
  const mode = useMode();
  const evidence = useEvidence();
  const params = useParams();
  const dealId = params.dealId === undefined ? 2 : Number(params.dealId);
  const bundle = evidence.bundle;
  const recordedDeal = bundle?.deals.find((deal) => deal.id === dealId) ?? null;
  const client = useMemo(() => liveOptions.client ?? createReadClient(mode), [liveOptions.client, mode]);
  const live = useLiveDeployment(mode, {
    ...liveOptions,
    client: client ?? undefined,
    providerAddress: bundle?.providers[0]?.address ?? null,
    dealIds: [dealId],
  });

  const [work, setWork] = useState<Work | null>(null);
  const [result, setResult] = useState<LoadedFile | null>(null);
  const [tamper, setTamper] = useState<TamperResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [runs, setRuns] = useState<Partial<Record<RefusalId, RefusalOutcome>>>({});
  const [busy, setBusy] = useState<RefusalId | null>(null);

  const liveDeal = live.deals[dealId] ?? null;
  const dealRoot = liveDeal?.root ?? recordedDeal?.root ?? null;
  const dealSize = liveDeal?.size ?? recordedDeal?.size ?? null;
  const dealLeaves = liveDeal?.leafCount ?? recordedDeal?.leafCount ?? null;
  const dealLabel: Label = liveDeal ? "MEASURED" : "REPORTED";
  const dealSource = liveDeal
    ? `chain ${mode.expectedChainId} @ block ${formatCount(live.block ?? 0)} · ${live.at}`
    : recordedDeal
      ? `evidence/${bundle?.id ?? "none"}.json`
      : "no deal root recorded";

  async function run(name: string, bytes: Uint8Array, source: "sample" | "file"): Promise<void> {
    setWork({ name, stage: "reading", done: 0, total: 0 });
    setResult(null);
    setTamper(null);
    setError(null);
    try {
      setWork({ name, stage: "sha256", done: 0, total: 0 });
      const digest = await sha256Hex(bytes);
      const tree = await buildFileTree(bytes, {
        ...buildOptions,
        onProgress: (done, total, stage) => setWork({ name, stage, done, total }),
      });
      setResult({ name, bytes, sha256: digest, tree, source });
    } catch (caught) {
      setError(reason(caught));
    } finally {
      setWork(null);
    }
  }

  async function useSample(): Promise<void> {
    try {
      const bytes = await loadSample(fetchImpl ?? globalThis.fetch.bind(globalThis));
      await run(SAMPLE.name, bytes, "sample");
    } catch (caught) {
      setError(reason(caught));
    }
  }

  async function dropFile(file: File | undefined): Promise<void> {
    if (!file) return;
    try {
      const bytes = await readFileBytes(file);
      await run(file.name, bytes, "file");
    } catch (caught) {
      setError(reason(caught));
    }
  }

  async function runCall(call: RefusalCall): Promise<void> {
    if (client === null || mode.address === null) return;
    setBusy(call.id);
    try {
      const outcome = await runRefusal(client, mode.address, call, refusalOptions);
      setRuns((current) => ({ ...current, [call.id]: outcome }));
    } finally {
      setBusy(null);
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setDragging(false);
    void dropFile(event.dataTransfer?.files?.[0]);
  }

  async function flipOneByte(): Promise<void> {
    if (result === null) return;
    const copy = Uint8Array.from(result.bytes);
    const index = result.tree.blockCount - 1;
    const offset = index * result.tree.blockSize;
    copy[offset] = (copy[offset] ?? 0) ^ 0xff;
    setTamper(null);
    setWork({ name: `${result.name} (tampered copy)`, stage: "hashing", done: 0, total: 0 });
    try {
      const tree = await buildFileTree(copy, {
        ...buildOptions,
        onProgress: (done, total, stage) => setWork({ name: `${result.name} (tampered copy)`, stage, done, total }),
      });
      const first = firstMismatchingBlock(result.tree.leafHashes, tree.leafHashes);
      const changed = first ?? index;
      const path = getPath(result.tree, changed);
      const rejected = !verifyPath(
        result.tree.root,
        blockAt(copy, result.tree.blockSize, changed),
        changed,
        result.tree.blockCount,
        path,
      );
      setTamper({ index: changed, root: tree.root, rejected });
    } catch (caught) {
      setError(reason(caught));
    } finally {
      setWork(null);
    }
  }

  let verdict: "PASS" | "FAIL" | "PENDING" = "PENDING";
  let verdictReason = "No deal root is available, so there is nothing to compare against.";
  if (result !== null && dealRoot !== null) {
    const sameRoot = result.tree.root === dealRoot;
    const sameSize = dealSize === null || result.tree.size === dealSize;
    if (sameRoot && sameSize) {
      verdict = "PASS";
      verdictReason = `The file root equals the deal ${dealId} root ${liveDeal ? "read from the chain now" : "in the recorded evidence"}.`;
    } else if (!sameSize) {
      verdict = "FAIL";
      verdictReason = `The file is ${formatCount(result.tree.size)} bytes; deal ${dealId} committed ${formatCount(dealSize ?? 0)} bytes.`;
    } else {
      verdict = "FAIL";
      verdictReason = `The file root does not equal the deal ${dealId} root.`;
    }
  }
  const verdictClass =
    verdict === "PASS"
      ? "text-emerald-700 font-bold"
      : verdict === "FAIL"
        ? "text-red-700 font-bold"
        : "text-slate-500 font-bold";

  const sampleIntegrity =
    result?.source === "sample" && result.sha256 !== SAMPLE.sha256
      ? `The served sample does not match the recorded sha256 ${SAMPLE.sha256}; do not trust this run.`
      : null;

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow">03 / verify</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Verify a file</h1>
        <p className="mt-3 max-w-[68ch] text-slate-600 leading-relaxed">
          Drop the file, or use the sample the deals committed. This page hashes it in the browser,
          splits it into {formatCount(SAMPLE.blockSize)}-byte blocks, rebuilds the same keccak256 Merkle
          tree the contract commits to, and compares the root with the root deal {dealId} holds now. The
          bytes never leave the tab and nothing is signed.
        </p>
        <p className="mt-3 max-w-[68ch] text-xs text-slate-500">
          MEASURED — read from the chain now, or computed in this browser from the bytes you loaded; the
          source on each row says which. REPORTED — recorded evidence. PENDING — not run.
        </p>
      </header>

      {/* Sample Meta Card */}
      <Card as="section" aria-labelledby="sample-heading">
        <h2 id="sample-heading" className="eyebrow text-slate-700 font-semibold">
          The sample file
        </h2>
        <p className="mt-2 max-w-[68ch] text-sm text-slate-600 leading-relaxed">
          Deals 1 and 2 committed this exact 1 MiB file. It is served byte-for-byte, so the numbers
          below can be checked without trusting this page.
        </p>
        <dl className="mt-4" data-testid="verify-sample-meta">
          <Field name="File" value={SAMPLE.name} label="REPORTED" source="src/data/sample.ts" mono />
          <Field
            name="Size"
            value={formatCount(SAMPLE.size)}
            unit="bytes"
            label="REPORTED"
            source="src/data/sample.ts"
          />
          <Field
            name="Blocks"
            value={formatCount(SAMPLE.blockCount)}
            unit="blocks"
            detail={`${formatCount(SAMPLE.blockSize)} bytes per block`}
            label="REPORTED"
            source="src/data/sample.ts"
          />
          <Field name="SHA-256" value={SAMPLE.sha256} label="REPORTED" source="scripts/check-sample.mjs" mono />
          <Field name="Deal root" value={SAMPLE.root} label="REPORTED" source="scripts/check-sample.mjs" mono />
        </dl>
        <p className="mt-4 max-w-[68ch] text-xs text-slate-500 border-t border-slate-100 pt-3">
          {SAMPLE.provenance} Created {SAMPLE.createdUtc} with <code className="mono">{SAMPLE.command}</code>.
        </p>
      </Card>

      {/* Dropzone Card */}
      <Card as="section" aria-labelledby="drop-heading">
        <h2 id="drop-heading" className="eyebrow text-slate-700 font-semibold">
          Drop a file
        </h2>
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`mt-4 rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
            dragging
              ? "border-ochre bg-amber-50/40"
              : "border-slate-200 bg-slate-50/60 hover:border-slate-300"
          }`}
        >
          <p className="text-sm font-medium text-slate-700">Drop a file here to hash and verify locally</p>
          <p className="text-xs text-slate-500 mt-1">Files never leave your browser</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <label className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-full border border-slate-300 bg-white px-5 py-2.5 font-mono text-xs font-semibold text-slate-800 shadow-xs hover:border-ochre hover:text-slate-900 transition-all focus-within:outline-2 focus-within:outline-ochre">
              Choose a file
              <input
                type="file"
                aria-label="Choose a file to verify"
                className="sr-only"
                onChange={(event) => {
                  void dropFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
            <button
              type="button"
              aria-label="Use the sample file"
              onClick={() => void useSample()}
              disabled={work !== null}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-ochre px-5 py-2.5 font-mono text-xs font-semibold text-ink shadow-xs hover:bg-[#e5b350] transition-all disabled:opacity-50 cursor-pointer focus-visible:outline-2 focus-visible:outline-ochre"
            >
              Use the sample file
            </button>
            {mode.clientEnabled ? (
              <button
                type="button"
                aria-label="Re-read the deal root from the chain"
                onClick={live.refresh}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 font-mono text-xs font-medium text-slate-800 shadow-xs hover:border-ochre hover:text-ochre transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-ochre"
              >
                Re-read the deal root
              </button>
            ) : null}
          </div>
        </div>

        {work !== null ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4" data-testid="verify-progress" aria-live="polite">
            <p className="font-mono text-xs font-medium text-slate-800">
              {work.stage === "reading"
                ? `Reading ${work.name}…`
                : work.stage === "sha256"
                  ? `Computing SHA-256 of ${work.name}…`
                  : work.stage === "hashing"
                    ? `Hashing block ${formatCount(work.done)} of ${formatCount(work.total)}…`
                    : "Building the Merkle tree…"}
            </p>
            <progress
              className="mt-3 h-2 w-full overflow-hidden rounded-full accent-amber-500"
              value={work.stage === "reading" || work.stage === "sha256" ? 0 : work.done}
              max={work.total === 0 ? 1 : work.total}
            />
          </div>
        ) : null}

        {error !== null ? (
          <p role="alert" className="mt-4 border-l-2 border-red-600 bg-red-50 py-2 pl-3 text-sm text-red-900 rounded-r-lg">
            {error}
          </p>
        ) : null}
      </Card>

      {/* Refusals Card */}
      <Card as="section" aria-labelledby="refusals-heading">
        <h2 id="refusals-heading" className="eyebrow text-slate-700 font-semibold">
          Refusals we can run
        </h2>
        <p className="mt-2 max-w-[68ch] text-sm text-slate-600 leading-relaxed">
          Three calls the contract must reject. Each button sends an{" "}
          <code className="mono">{`eth_call`}</code> from <span className="mono break-all">{REFUSAL_CALLER}</span> — the
          burn address, which is neither the deal owner nor provider 1 — and shows the selector that came
          back with the error name decoded from the ABI. Nothing is signed or sent, and no value is
          attached, so this cannot move a tPOT.
        </p>
        <ul className="mt-5 space-y-6">
          {REFUSAL_CALLS.map((call) => {
            const run = runs[call.id] ?? null;
            const running = busy === call.id;
            const available = client !== null && mode.clientEnabled && mode.address !== null;
            return (
              <li key={call.id} className="border-t border-slate-100 pt-4">
                <h3 className="text-base font-bold text-slate-900">{call.title}</h3>
                <p className="mt-1 max-w-[68ch] text-sm text-slate-600 leading-relaxed">{call.description}</p>
                <div className="mt-2 space-y-0.5 font-mono text-[11px] text-slate-500">
                  <p className="break-all">checks first: {call.expectedCheck}</p>
                  <p className="break-all">
                    eth_call to {mode.address ?? "no address"} · from {REFUSAL_CALLER}
                  </p>
                  <p className="break-all">calldata {calldataFor(call)}</p>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void runCall(call)}
                    disabled={!available || running}
                    className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 font-mono text-xs font-semibold text-slate-800 shadow-xs hover:border-ochre hover:text-slate-900 transition-all disabled:opacity-50 cursor-pointer focus-visible:outline-2 focus-visible:outline-ochre"
                  >
                    {running ? "Running…" : "Run the call"}
                  </button>
                  {available ? null : (
                    <Chip label="PENDING LIVE RUN" />
                  )}
                  {available ? null : (
                    <span className="text-xs text-slate-500">no live client in this build, so there is nothing to call</span>
                  )}
                </div>
                {run !== null ? (
                  <dl className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4" data-testid={`refusal-result-${call.id}`}>
                    {run.status === "reverted" ? (
                      <>
                        <Field
                          name="Selector"
                          value={run.selector ?? "not a four-byte selector"}
                          label="MEASURED"
                          source={`eth_call at latest · ${run.at}`}
                          mono
                        />
                        <Field
                          name="Decoded error"
                          value={run.name === null ? "unknown selector" : `${run.name}()`}
                          label="MEASURED"
                          source={run.note}
                          mono
                        />
                        <Field
                          name="Revert data"
                          value={run.raw}
                          label="MEASURED"
                          source="the node's answer to eth_call"
                          mono
                        />
                        <Field
                          name="Calldata sent"
                          value={run.calldata}
                          label="MEASURED"
                          source={`${run.attempts} attempt${run.attempts === 1 ? "" : "s"} · ${formatCount(run.ms)} ms`}
                          mono
                        />
                      </>
                    ) : (
                      <Field
                        name="Result"
                        value={run.status === "returned" ? "returned data" : run.status}
                        label="MEASURED"
                        source={"message" in run ? run.message : run.note}
                      />
                    )}
                  </dl>
                ) : null}
              </li>
            );
          })}
        </ul>
        <p className="mt-4 max-w-[68ch] text-xs text-slate-500 border-t border-slate-100 pt-3">
          Each attempt times out after 8 s and is retried once, so a slow phone sees a timeout instead of
          a spinner that never stops. A revert is never retried: it is the answer.
        </p>
      </Card>

      {/* Result Card */}
      {result !== null ? (
        <Card as="section" aria-labelledby="result-heading" data-testid="verify-result" className="space-y-4">
          <h2 id="result-heading" className="eyebrow text-slate-700 font-semibold">
            Result
          </h2>
          <div data-testid="verify-verdict" aria-live="polite" className="flex items-center gap-2 text-sm">
            <span className={`font-mono text-base ${verdictClass}`}>{verdict}</span>
            <span className="text-slate-600"> — {verdictReason}</span>
          </div>
          {sampleIntegrity !== null ? (
            <p role="alert" className="border-l-2 border-red-600 bg-red-50 py-2 pl-3 text-sm text-red-900 rounded-r-lg">
              {sampleIntegrity}
            </p>
          ) : null}
          <dl className="mt-4">
            <Field name="File" value={result.name} label="MEASURED" source="the file you loaded" mono />
            <Field
              name="SHA-256"
              value={result.sha256}
              label="MEASURED"
              source="computed in this browser"
              mono
            />
            <Field
              name="Size"
              value={formatCount(result.tree.size)}
              unit="bytes"
              label="MEASURED"
              source="computed in this browser"
            />
            <Field
              name="Blocks"
              value={formatCount(result.tree.blockCount)}
              unit="blocks"
              detail={`${formatCount(result.tree.blockSize)} bytes per block, shared chunker`}
              label="MEASURED"
              source="apps/makhzan/src/chunk.ts"
            />
            <Field
              name="File root"
              value={result.tree.root}
              label="MEASURED"
              source="shared Merkle module, apps/makhzan/src/merkle.ts"
              mono
            />
            <Field
              name={`Deal ${dealId} root`}
              value={dealRoot ?? "not available"}
              label={dealLabel}
              source={dealSource}
              mono
            />
            <Field
              name={`Deal ${dealId} size`}
              value={dealSize === null ? "not recorded" : formatCount(dealSize)}
              unit={dealSize === null ? undefined : "bytes"}
              detail={dealLeaves === null ? undefined : `${formatCount(dealLeaves)} blocks`}
              label={dealLabel}
              source={dealSource}
            />
            <Field
              name="Roots equal"
              value={dealRoot === null ? "cannot compare" : result.tree.root === dealRoot ? "yes" : "no"}
              label="MEASURED"
              source="this page"
            />
          </dl>

          <div className="pt-2">
            <button
              type="button"
              aria-label="Flip one byte in memory copy to test tamper rejection"
              onClick={() => void flipOneByte()}
              disabled={work !== null}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-slate-300 bg-white px-5 py-2.5 font-mono text-xs font-semibold text-slate-800 shadow-xs hover:border-ochre hover:text-slate-900 transition-all disabled:opacity-50 cursor-pointer focus-visible:outline-2 focus-visible:outline-ochre"
            >
              Flip one byte in a copy
            </button>
          </div>

          {tamper !== null ? (
            <div data-testid="tamper-result" className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-5">
              <h3 className="text-base font-bold text-slate-900">Tampered copy</h3>
              <p className="mt-1 max-w-[68ch] text-sm text-slate-600 leading-relaxed">
                One byte of block {formatCount(tamper.index)} was flipped in a copy held in memory. The
                file you loaded was not touched.
              </p>
              <p className="mt-3 text-sm" data-testid="tamper-verdict">
                <span className={`font-mono font-bold ${tamper.rejected ? "text-red-700" : "text-emerald-700"}`}>
                  {tamper.rejected ? "FAIL" : "UNEXPECTED PASS"}
                </span>
                <span className="text-slate-600">
                  {tamper.rejected
                    ? ` — the original path for block ${formatCount(tamper.index)} no longer verifies against the file root, so the same check the contract runs rejects it.`
                    : " — the flipped block still verified, which should be impossible; do not trust this run."}
                </span>
              </p>
              <dl className="mt-4">
                <Field
                  name="First mismatching block"
                  value={formatCount(tamper.index)}
                  label="MEASURED"
                  source="computed in this browser against the loaded file"
                />
                <Field
                  name="Tampered root"
                  value={tamper.root}
                  label="MEASURED"
                  source="computed in this browser"
                  mono
                />
                <Field name="File root" value={result.tree.root} label="MEASURED" source="the file you loaded" mono />
                <Field
                  name="Path check"
                  value={tamper.rejected ? "rejected" : "accepted"}
                  label="MEASURED"
                  source="shared verify() on the original path for that block"
                />
              </dl>
            </div>
          ) : null}
        </Card>
      ) : null}

      <p className="max-w-[68ch] text-xs text-slate-500 leading-relaxed">
        Read-only: this page cannot sign, send or spend. A PASS means the bytes you loaded hash to the
        root the contract holds; it does not prove where the file came from.
      </p>
    </div>
  );
}
