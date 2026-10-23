import { parseEvidence, parseManifest, type EvidenceState } from "./schema";
import { sha256Hex } from "./sha256";

export interface LoadEvidenceOptions {
  fetchImpl?: typeof fetch;
  manifestUrl?: string;
}

const failure = (message: string): EvidenceState => ({
  bundle: null,
  verified: false,
  error: message,
  loading: false,
});

const reason = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Loads the manifest, fetches the current bundle, verifies its SHA-256 and validates it.
 *
 * Never throws and never returns an empty screen: every failure becomes an evidence notice the shell
 * can render next to the recorded fallback.
 */
export async function loadEvidence(options: LoadEvidenceOptions = {}): Promise<EvidenceState> {
  const doFetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const manifestUrl = options.manifestUrl ?? "/evidence/index.json";

  try {
    const manifestResponse = await doFetch(manifestUrl, { cache: "no-store" });
    if (!manifestResponse.ok) {
      return failure(`evidence manifest unavailable (HTTP ${manifestResponse.status})`);
    }
    const manifest = parseManifest(await manifestResponse.json());
    const entry = manifest.files.find((file) => file.id === manifest.current);
    if (!entry) return failure(`evidence manifest current "${manifest.current}" is not listed`);

    const response = await doFetch(entry.url, { cache: "no-store" });
    if (!response.ok) {
      return failure(`evidence file unavailable (HTTP ${response.status})`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const digest = await sha256Hex(bytes);
    const verified = digest === entry.sha256.toLowerCase();

    const bundle = parseEvidence(JSON.parse(new TextDecoder().decode(bytes)));
    if (bundle.id !== entry.id) {
      return failure(`evidence id "${bundle.id}" does not match the manifest entry "${entry.id}"`);
    }

    return {
      bundle,
      verified,
      error: verified ? null : `unverified evidence: manifest ${entry.sha256}, file ${digest}`,
      loading: false,
    };
  } catch (error) {
    return failure(reason(error));
  }
}
