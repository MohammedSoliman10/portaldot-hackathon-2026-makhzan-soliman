/** Shared contract-error mapper used by the CLI and the daemon. */
export const ERROR_MESSAGES: Record<string, string> = {};

/** Maps a revert to the documented message; an unknown error is surfaced verbatim. */
export function mapContractError(_input: unknown): string {
  throw new Error("not implemented");
}
