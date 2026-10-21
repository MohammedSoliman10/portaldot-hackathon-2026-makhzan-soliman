// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IMakhzan} from "./IMakhzan.sol";
import {MerkleLib} from "./lib/MerkleLib.sol";
import {BondLib} from "./lib/BondLib.sol";
import {PayLib} from "./lib/PayLib.sol";

/// @title Makhzan
/// @notice Bonded storage with retrieval challenges. Skeleton: reads implemented, state-changing
///         entry points revert NotImplemented until their task lands.
contract Makhzan is IMakhzan {
    /// @dev [assumption] until G07's measured implied factor confirms it. Declared exactly once.
    uint256 internal constant WEI_PER_UNIT = 10_000;

    uint8 internal constant DEAL_SETTLED = 1;
    uint8 internal constant DEAL_CHALLENGE_OPEN = 2;

    /// @dev 3 slots (A, B, C) per contracts/storage-layout.md.
    struct Deal {
        // slot A (31/32)
        address owner; // 20
        uint32 startBlock; // 4
        uint32 endBlock; // 4
        uint16 providerId; // 2
        uint8 flags; // 1
        // slot B (32/32)
        bytes32 root; // 32
        // slot C (31/32)
        uint24 leafCount; // 3
        uint32 size; // 4
        uint32 challengeIndex; // 4
        uint32 challengeStart; // 4
        uint64 price; // 8
        uint64 claimed; // 8
    }

    // slot 0: challengeWindow(4) | challengeBlockSize(2) | slashBps(2) | minBond(8)
    //         | nextDealId(4) | providerCount(2) | minDurationBlocks(4) | maxDurationBlocks(4) = 30/32
    uint32 internal challengeWindow;
    uint16 internal challengeBlockSize;
    uint16 internal slashBps;
    uint64 internal minBond;
    uint32 internal nextDealId;
    uint16 internal providerCount;
    uint32 internal minDurationBlocks;
    uint32 internal maxDurationBlocks;

    // slot 1, 2, 3
    mapping(address => uint16) internal providerIdOf;
    BondLib.Provider[] internal providers;
    mapping(uint32 => Deal) internal deals;

    constructor(
        uint32 challengeWindow_,
        uint16 challengeBlockSize_,
        uint16 slashBps_,
        uint64 minBond_,
        uint32 minDurationBlocks_,
        uint32 maxDurationBlocks_
    ) {
        if (
            challengeWindow_ == 0 || challengeBlockSize_ < 1024 || challengeBlockSize_ > 4096 || slashBps_ == 0
                || slashBps_ > 10_000 || minBond_ == 0 || minDurationBlocks_ == 0
                || maxDurationBlocks_ < minDurationBlocks_
        ) revert BadParams();
        challengeWindow = challengeWindow_;
        challengeBlockSize = challengeBlockSize_;
        slashBps = slashBps_;
        minBond = minBond_;
        minDurationBlocks = minDurationBlocks_;
        maxDurationBlocks = maxDurationBlocks_;
    }

    // ------------------------------------------------------------------ provider

    function registerProvider() external payable override {
        if (providerIdOf[msg.sender] != 0) revert AlreadyRegistered();
        if (providerCount == type(uint16).max) revert BadParams();
        uint256 units = _toUnits(msg.value);
        if (units < minBond) revert BondTooSmall();
        uint16 id = ++providerCount;
        providers.push();
        BondLib.Provider storage p = providers[id - 1];
        p.addr = msg.sender;
        BondLib.credit(p, units);
        p.flags = BondLib.REGISTERED;
        providerIdOf[msg.sender] = id;
        emit ProviderRegistered(msg.sender, id, p.bond);
    }

    function addBond() external payable override {
        uint16 id = providerIdOf[msg.sender];
        if (id == 0) revert NotRegistered();
        BondLib.Provider storage p = providers[id - 1];
        BondLib.credit(p, _toUnits(msg.value));
        emit BondAdded(msg.sender, p.bond);
    }

    function withdrawBond() external override {
        uint16 id = providerIdOf[msg.sender];
        if (id == 0) revert NotRegistered();
        BondLib.Provider storage p = providers[id - 1];
        if (p.activeDeals != 0) revert HasOpenDeal();
        uint64 units = BondLib.clear(p);
        delete providerIdOf[msg.sender];
        emit BondWithdrawn(msg.sender, units);
        BondLib.pay(msg.sender, uint256(units) * WEI_PER_UNIT);
    }

    /// @dev Wei must be a whole number of native units; dust is rejected, never rounded.
    function _toUnits(uint256 value) internal pure returns (uint256) {
        if (value % WEI_PER_UNIT != 0) revert BadParams();
        return value / WEI_PER_UNIT;
    }

    function providerOf(address who)
        external
        view
        override
        returns (uint16 id, uint64 bond, uint24 activeDeals, bool registered)
    {
        id = providerIdOf[who];
        if (id == 0) return (0, 0, 0, false);
        BondLib.Provider storage p = providers[id - 1];
        return (id, p.bond, p.activeDeals, BondLib.isRegistered(p));
    }

    // ------------------------------------------------------------------ deals

    function createDeal(
        uint16 providerId,
        bytes32 root,
        uint24 leafCount,
        uint32 size,
        uint32 durationBlocks,
        uint64 price
    ) external payable override {
        if (root == bytes32(0) || size == 0 || leafCount == 0 || price == 0) revert BadParams();
        if (durationBlocks < minDurationBlocks || durationBlocks > maxDurationBlocks) revert BadParams();
        if (providerId == 0 || providerId > providerCount) revert BadParams();
        BondLib.Provider storage p = providers[providerId - 1];
        if (!BondLib.isRegistered(p) || p.bond < minBond) revert BadParams();
        uint256 expectedLeaves = (uint256(size) + challengeBlockSize - 1) / challengeBlockSize;
        if (leafCount != expectedLeaves) revert BadParams();
        if (msg.value != uint256(price) * WEI_PER_UNIT) revert BadParams();
        if (nextDealId == type(uint32).max) revert BadParams();
        if (block.number > type(uint32).max - durationBlocks) revert BadParams();

        uint32 dealId = ++nextDealId;
        uint32 start = uint32(block.number);
        uint32 end = start + durationBlocks;
        Deal storage d = deals[dealId];
        d.owner = msg.sender;
        d.startBlock = start;
        d.endBlock = end;
        d.providerId = providerId;
        d.root = root;
        d.leafCount = leafCount;
        d.size = size;
        d.price = price;
        p.activeDeals += 1;
        emit DealCreated(dealId, msg.sender, providerId, root, size, end, price);
    }

    function dealOf(uint32 dealId)
        external
        view
        override
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
        )
    {
        Deal storage d = deals[dealId];
        return (
            d.owner,
            d.startBlock,
            d.endBlock,
            d.providerId,
            d.flags,
            d.root,
            d.leafCount,
            d.size,
            d.challengeIndex,
            d.challengeStart,
            d.price,
            d.claimed
        );
    }

    // ------------------------------------------------------------------ challenge

    function challenge(uint32 dealId) external override {
        Deal storage d = deals[dealId];
        if (d.owner == address(0)) revert NoDeal();
        if (msg.sender != d.owner) revert NotOwner();
        if (block.number > d.endBlock) revert DealExpired();
        if (d.flags & DEAL_CHALLENGE_OPEN != 0) revert ChallengeOpen();
        uint256 deadline = block.number + challengeWindow;
        if (deadline > type(uint32).max) revert BadParams();

        uint32 index = _selectIndex(dealId, d.leafCount);
        d.challengeIndex = index;
        d.challengeStart = uint32(block.number);
        d.flags |= DEAL_CHALLENGE_OPEN;
        emit ChallengeOpened(dealId, index, uint32(deadline));
    }

    /// @dev D5 selector: one internal swap point. Parent hash + prevrandao + deal id, modulo the
    ///      committed leaf count. Not claimed unpredictable until the randomness gate (G03) rules;
    ///      the documented fallback is a commit-reveal path in this same function.
    function _selectIndex(uint32 dealId, uint24 leafCount) internal view returns (uint32) {
        bytes32 seed = keccak256(abi.encodePacked(blockhash(block.number - 1), block.prevrandao, dealId));
        return uint32(uint256(seed) % leafCount);
    }

    function answer(uint32 dealId, bytes calldata data, bytes32[] calldata path) external override {
        Deal storage d = deals[dealId];
        if (d.owner == address(0)) revert NoDeal();
        if (msg.sender != providers[d.providerId - 1].addr) revert NotProvider();
        if (d.flags & DEAL_CHALLENGE_OPEN == 0) revert NoChallenge();
        if (block.number > d.challengeStart + challengeWindow) revert WindowOpen();

        uint256 expectedLen = challengeBlockSize;
        if (d.challengeIndex == d.leafCount - 1) {
            expectedLen = uint256(d.size) - uint256(d.leafCount - 1) * challengeBlockSize;
        }
        if (!MerkleLib.verifyLeaf(d.root, data, d.challengeIndex, d.leafCount, expectedLen, path)) {
            revert ProofRejected();
        }

        d.flags &= ~DEAL_CHALLENGE_OPEN;
        emit ChallengePassed(dealId);
    }

    function resolve(uint32 dealId) external override {
        Deal storage d = deals[dealId];
        if (d.flags & DEAL_CHALLENGE_OPEN == 0) revert NoChallenge();
        if (block.number <= d.challengeStart + challengeWindow) revert WindowOpen();

        d.flags &= ~DEAL_CHALLENGE_OPEN;
        BondLib.Provider storage p = providers[d.providerId - 1];
        uint64 slash = BondLib.slash(p, slashBps);
        emit ChallengeFailed(dealId, slash);
        BondLib.pay(d.owner, uint256(slash) * WEI_PER_UNIT);
    }

    function challengeStateOf(uint32 dealId)
        external
        view
        override
        returns (bool open, uint32 index, uint32 start, uint32 deadline, uint32 expectedPathLength)
    {
        Deal storage d = deals[dealId];
        open = d.flags & DEAL_CHALLENGE_OPEN != 0;
        if (!open) return (false, 0, 0, 0, 0);
        index = d.challengeIndex;
        start = d.challengeStart;
        deadline = start + challengeWindow;
        expectedPathLength = MerkleLib.pathLength(index, d.leafCount);
    }

    // ------------------------------------------------------------------ payments

    function claim(uint32 dealId) external override {
        Deal storage d = deals[dealId];
        if (d.owner == address(0)) revert NoDeal();
        BondLib.Provider storage p = providers[d.providerId - 1];
        if (msg.sender != p.addr) revert NotProvider();
        if (d.flags & DEAL_SETTLED != 0) revert AlreadySettled();

        uint64 accrued = _accrued(d);
        uint64 claimable = accrued > d.claimed ? accrued - d.claimed : 0;
        if (claimable == 0) revert ZeroClaim();

        d.claimed = accrued;
        emit Claimed(dealId, claimable);
        BondLib.pay(msg.sender, uint256(claimable) * WEI_PER_UNIT);
    }

    function settle(uint32 dealId) external override {
        Deal storage d = deals[dealId];
        if (d.owner == address(0)) revert NoDeal();
        if (d.flags & DEAL_SETTLED != 0) revert AlreadySettled();
        if (block.number < d.endBlock) revert BeforeEnd();
        if (d.flags & DEAL_CHALLENGE_OPEN != 0) revert ChallengeOpen();

        d.flags |= DEAL_SETTLED;
        BondLib.Provider storage p = providers[d.providerId - 1];
        if (p.activeDeals != 0) p.activeDeals -= 1;

        uint64 accrued = _accrued(d);
        uint64 toProvider = accrued > d.claimed ? accrued - d.claimed : 0;
        uint64 remainder = d.price > accrued ? d.price - accrued : 0;
        // C1: `claimed` means total paid, so it reaches the accrued total before any transfer.
        d.claimed = accrued;
        emit Settled(dealId, toProvider, remainder);

        if (toProvider != 0) BondLib.pay(p.addr, uint256(toProvider) * WEI_PER_UNIT);
        if (remainder != 0) BondLib.pay(d.owner, uint256(remainder) * WEI_PER_UNIT);
    }

    function accruedOf(uint32 dealId) external view override returns (uint64 accrued, uint64 claimable) {
        Deal storage d = deals[dealId];
        if (d.owner == address(0)) return (0, 0);
        accrued = _accrued(d);
        claimable = accrued > d.claimed ? accrued - d.claimed : 0;
    }

    function _accrued(Deal storage d) internal view returns (uint64) {
        return PayLib.accrued(d.price, d.startBlock, d.endBlock, block.number);
    }

    // ------------------------------------------------------------------ reads

    function peek(bytes32[] calldata slots) external view override returns (bytes32[] memory values) {
        values = new bytes32[](slots.length);
        for (uint256 i; i < slots.length; i++) {
            bytes32 slot = slots[i];
            bytes32 value;
            // sload is the whole point of this read-only accessor.
            assembly {
                value := sload(slot)
            }
            values[i] = value;
        }
    }
}
