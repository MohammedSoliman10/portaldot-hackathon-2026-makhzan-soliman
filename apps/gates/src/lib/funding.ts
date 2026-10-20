/** Funding is true when either the native free balance or the EVM balance is non-zero. */
export function isFunded(nativeFree: string | bigint, evmWei: string | bigint): boolean {
  return BigInt(nativeFree) > 0n || BigInt(evmWei) > 0n;
}

export interface FundingFlagInput {
  label: string;
  ss58: string;
  evm: string;
  nativeFree: string;
  evmWei: string;
  at: string;
}

/** Public evidence only: no key material and no balances beyond the two observed values. */
export function fundingFlagText(input: FundingFlagInput): string {
  return `${[
    `label=${input.label}`,
    `ss58=${input.ss58}`,
    `evm=${input.evm}`,
    `native_free=${input.nativeFree}`,
    `evm_wei=${input.evmWei}`,
    `observed_at=${input.at}`,
  ].join("\n")}\n`;
}
