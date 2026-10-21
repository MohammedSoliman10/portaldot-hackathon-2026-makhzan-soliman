/** Shared contract-error mapper used by the CLI and the daemon. */
export const ERROR_MESSAGES: Record<string, string> = {
  NotRegistered: "caller is not a registered provider",
  AlreadyRegistered: "address already has a provider id",
  BondTooSmall: "value is below the minimum bond",
  HasOpenDeal: "provider still has an unsettled deal",
  NoDeal: "no deal with that id",
  NotOwner: "caller is not the deal owner",
  NotProvider: "caller is not the deal's provider",
  BadParams: "a creation or input rule failed",
  DealExpired: "the deal's end block has passed",
  ChallengeOpen: "a challenge is already open on this deal",
  NoChallenge: "no open challenge on this deal",
  ProofRejected: "bytes or path failed verification, or the length is wrong",
  WindowOpen: "the response window has not closed yet, or an answer arrived after its deadline",
  ZeroClaim: "nothing has accrued since the last claim",
  AlreadySettled: "the deal is already settled",
  BeforeEnd: "settlement attempted before the end block",
  TransferFailed: "a value transfer reverted",
};

function textOf(input: unknown): string {
  if (input instanceof Error) return input.message;
  if (typeof input === "string") return input;
  return String(input);
}

/** Maps a revert to the documented message; an unknown error is surfaced verbatim. */
export function mapContractError(input: unknown): string {
  const text = textOf(input);
  for (const [name, message] of Object.entries(ERROR_MESSAGES)) {
    if (new RegExp(`\\b${name}\\b`).test(text)) return message;
  }
  return text;
}
