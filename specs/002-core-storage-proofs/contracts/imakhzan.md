# Contract Surface: `IMakhzan`

**Feature**: `002-core-storage-proofs` | **Status**: Design contract for `contracts/src/makhzan/`

One deployed contract `Makhzan` behind this interface. Amounts are stored as native units (planck,
tPOT with 14 decimals); `msg.value` is 18-decimal wei and must be an exact multiple of
`WEI_PER_UNIT = 10_000` (`[assumption]` until G07 confirms it). All deadlines are block numbers.
Every function either performs its stated effect or reverts; none silently succeeds.

## Functions

### Provider

```solidity
function registerProvider() external payable;        // wei multiple of 10_000; units >= minBond, <= uint64 max
function addBond() external payable;                 // registered caller; wei multiple; units stay <= uint64 max
function withdrawBond() external;                    // requires activeDeals == 0; clears registration
function providerOf(address who) external view returns (
    uint16 id, uint64 bond, uint24 activeDeals, bool registered
);
```

### Deals

```solidity
function createDeal(
    uint16 providerId,
    bytes32 root,
    uint24 leafCount,
    uint32 size,
    uint32 durationBlocks,
    uint64 price
) external payable;                                  // msg.value == price * 10_000

function dealOf(uint32 dealId) external view returns (
    address owner, uint32 startBlock, uint32 endBlock, uint16 providerId, uint8 flags,
    bytes32 root, uint24 leafCount, uint32 size, uint32 challengeIndex,
    uint32 challengeStart, uint64 price, uint64 claimed
);
```

### Challenge

```solidity
function challenge(uint32 dealId) external;          // deal owner; deal active; no open challenge
function answer(uint32 dealId, bytes calldata data, bytes32[] calldata path) external;
function resolve(uint32 dealId) external;            // permissionless after deadline; slash to deal owner
function challengeStateOf(uint32 dealId) external view returns (
    bool open, uint32 index, uint32 start, uint32 deadline, uint32 expectedPathLength
);
```

### Payments

```solidity
function claim(uint32 dealId) external;              // deal provider only; pays the provider
function settle(uint32 dealId) external;             // permissionless; after endBlock; no open challenge; remainder to owner
function accruedOf(uint32 dealId) external view returns (uint64 accrued, uint64 claimable);
```

### Reads

```solidity
function peek(bytes32[] calldata slots) external view returns (bytes32[] memory values);
```

`peek` is a read-only generic slot reader used by the operator tooling and the evidence writer. It
returns the requested slot values in request order, with an unallocated slot reading as zero. It
cannot write and exposes nothing that a public chain does not already expose.

## Events

```solidity
event ProviderRegistered(address indexed provider, uint16 indexed id, uint64 bond);
event BondAdded(address indexed provider, uint64 newBond);
event BondWithdrawn(address indexed provider, uint64 amount);
event DealCreated(uint32 indexed dealId, address indexed owner, uint16 indexed providerId,
                  bytes32 root, uint32 size, uint32 endBlock, uint64 price);
event ChallengeOpened(uint32 indexed dealId, uint32 index, uint32 deadline);
event ChallengePassed(uint32 indexed dealId);
event ChallengeFailed(uint32 indexed dealId, uint64 slash);
event Claimed(uint32 indexed dealId, uint64 amount);
event Settled(uint32 indexed dealId, uint64 toProvider, uint64 remainder);
```

Events are for observers. The daemon MUST NOT depend on historic event queries to discover state
(see `cli-daemon.md`); it reads events only for the round it just observed on-chain.

## Custom errors

Short, argument-free errors, mapped to messages by the off-chain components.

| Error | Meaning (off-chain message) |
| --- | --- |
| `NotRegistered` | caller is not a registered provider |
| `AlreadyRegistered` | address already has a provider id |
| `BondTooSmall` | value is below the minimum bond |
| `HasOpenDeal` | provider still has an unsettled deal |
| `NoDeal` | no deal with that id |
| `NotOwner` | caller is not the deal owner |
| `NotProvider` | caller is not the deal's provider |
| `BadParams` | a creation or input rule failed |
| `DealExpired` | the deal's end block has passed |
| `ChallengeOpen` | a challenge is already open on this deal |
| `NoChallenge` | no open challenge on this deal |
| `ProofRejected` | bytes or path failed verification, or the length is wrong |
| `WindowOpen` | the response window has not closed yet |
| `ZeroClaim` | nothing has accrued since the last claim |
| `AlreadySettled` | the deal is already settled |
| `BeforeEnd` | settlement attempted before the end block |
| `TransferFailed` | a value transfer reverted |

`NotImplemented` is a scaffolding-only error: it exists in the initial skeleton so every unimplemented
state-changing stub reverts instead of returning empty data, `Interface.t.sol` asserts it, and it MUST
be gone from the deployed contract (asserted by the final local gate, T062).

## Guarantees and non-guarantees

- Guaranteed by the contract: proof verification is on-chain and consults no off-chain input; a pass
  requires the challenged bytes; a slash never exceeds the bond; a challenge resolves at most once;
  settlement pays the provider before returning anything to the owner. `resolve` and `settle` are
  permissionless but cannot redirect value; `withdrawBond`, `claim`, `settle` and `resolve` follow
  checks-effects-interactions and revert on a failed transfer.
- Tier 1 assumes EOA recipients. A contract owner or provider that rejects incoming value can block
  its own payout and, through `resolve`, the counterparty's exit; pull payments are a Tier 2 item.
- **Not** guaranteed: that the provider keeps the whole file. A passed challenge proves possession of
  one randomly chosen block at one moment. The protocol's answer to a lost file is the challenge
  probability and the slash, not exhaustive auditing. This is stated in `docs/EXPLAIN.md`.
