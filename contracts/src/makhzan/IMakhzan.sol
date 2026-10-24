// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IMakhzan
/// @notice Stable protocol surface for Makhzan, per specs/002-core-storage-proofs/contracts/imakhzan.md.
/// @dev Amounts are native units (planck); callers send wei that is an exact multiple of WEI_PER_UNIT.
interface IMakhzan {
    // ------------------------------------------------------------------ errors

    error NotRegistered();
    error AlreadyRegistered();
    error BondTooSmall();
    error HasOpenDeal();
    error NoDeal();
    error NotOwner();
    error NotProvider();
    error BadParams();
    error DealExpired();
    error ChallengeOpen();
    error NoChallenge();
    error ProofRejected();
    error WindowOpen();
    error ZeroClaim();
    error AlreadySettled();
    error BeforeEnd();
    error TransferFailed();
    /// @dev Scaffolding only: every unimplemented state-changing stub reverts with this. It must be
    ///      absent from the deployed contract (final local gate).
    error NotImplemented();

    // ------------------------------------------------------------------ events

    event ProviderRegistered(address indexed provider, uint16 indexed id, uint64 bond);
    event BondAdded(address indexed provider, uint64 newBond);
    event BondWithdrawn(address indexed provider, uint64 amount);
    event DealCreated(
        uint32 indexed dealId,
        address indexed owner,
        uint16 indexed providerId,
        bytes32 root,
        uint32 size,
        uint32 endBlock,
        uint64 price
    );
    event ChallengeOpened(uint32 indexed dealId, uint32 index, uint32 deadline);
    event ChallengePassed(uint32 indexed dealId);
    event ChallengeFailed(uint32 indexed dealId, uint64 slash);
    event Claimed(uint32 indexed dealId, uint64 amount);
    event Settled(uint32 indexed dealId, uint64 toProvider, uint64 remainder);

    // ------------------------------------------------------------------ provider

    function registerProvider() external payable;
    function addBond() external payable;
    function withdrawBond() external;
    function providerOf(address who) external view returns (uint16 id, uint64 bond, uint24 activeDeals, bool registered);

    // ------------------------------------------------------------------ deals

    function createDeal(
        uint16 providerId,
        bytes32 root,
        uint24 leafCount,
        uint32 size,
        uint32 durationBlocks,
        uint64 price
    ) external payable;

    function dealOf(uint32 dealId)
        external
        view
        returns (
            address owner,
            uint32 startBlock,
            uint32 endBlock,
            uint16 providerId,
            uint8 flags,
            bytes32 root,
            uint24 leafCount,
            uint32 size,
            uint32 challengeIndex,
            uint32 challengeStart,
            uint64 price,
            uint64 claimed
        );

    // ------------------------------------------------------------------ challenge

    function challenge(uint32 dealId) external;
    function answer(uint32 dealId, bytes calldata data, bytes32[] calldata path) external;
    function resolve(uint32 dealId) external;
    function challengeStateOf(uint32 dealId)
        external
        view
        returns (bool open, uint32 index, uint32 start, uint32 deadline, uint32 expectedPathLength);

    // ------------------------------------------------------------------ payments

    function claim(uint32 dealId) external;
    function settle(uint32 dealId) external;
    function accruedOf(uint32 dealId) external view returns (uint64 accrued, uint64 claimable);

    /// @notice Availability for other contracts: 0 no such deal or settled; 1 healthy;
    ///         2 challenge pending (open, inside the window); 3 in default (open, past the deadline).
    function healthOf(uint32 dealId) external view returns (uint8);

    // ------------------------------------------------------------------ reads

    function peek(bytes32[] calldata slots) external view returns (bytes32[] memory values);
}
