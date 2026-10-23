import type { ReadClient, ReadResult } from "./client";
import type { Hex } from "./schema";
import type { PeekConfig } from "./peek";

export interface ProviderView {
  id: number;
  bondUnits: string;
  activeDeals: number;
  registered: boolean;
}

export interface DealRead {
  owner: Hex;
  startBlock: number;
  endBlock: number;
  providerId: number;
  flags: number;
  root: Hex;
  leafCount: number;
  size: number;
  challengeIndex: number;
  challengeStart: number;
  priceUnits: string;
  claimedUnits: string;
}

export interface ChallengeRead {
  open: boolean;
  index: number;
  start: number;
  deadline: number;
  expectedPathLength: number;
}

export interface AccruedRead {
  accruedUnits: string;
  claimableUnits: string;
}

export function peekConfig(_client: ReadClient, _address: Hex): Promise<ReadResult<PeekConfig>> {
  throw new Error("not implemented");
}

export function providerOf(_client: ReadClient, _address: Hex, _who: Hex): Promise<ReadResult<ProviderView>> {
  throw new Error("not implemented");
}

export function dealOf(_client: ReadClient, _address: Hex, _dealId: number): Promise<ReadResult<DealRead>> {
  throw new Error("not implemented");
}

export function challengeStateOf(
  _client: ReadClient,
  _address: Hex,
  _dealId: number,
): Promise<ReadResult<ChallengeRead>> {
  throw new Error("not implemented");
}

export function accruedOf(_client: ReadClient, _address: Hex, _dealId: number): Promise<ReadResult<AccruedRead>> {
  throw new Error("not implemented");
}

export function healthOf(_client: ReadClient, _address: Hex, _dealId: number): Promise<ReadResult<number>> {
  throw new Error("not implemented");
}

export function codeOf(_client: ReadClient, _address: Hex): Promise<ReadResult<Hex>> {
  throw new Error("not implemented");
}
