// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IMakhzan} from "../../../src/makhzan/IMakhzan.sol";
import {TreeHarness} from "../harness/TreeHarness.sol";

/// @notice T034 — bounded actor handler for the five invariants of FR-041.
/// @dev Every action is wrapped in try/catch so an expected protocol rejection is counted, never
///      fatal, and successful calls are counted so a coverage invariant can prove the fuzz actually
///      reached each value path. Every amount is a whole number of native units.
contract MakhzanHandler is Test {
    uint256 internal constant WPU = 10_000;
    uint64 internal constant MIN_BOND = 1e15;
    uint32 internal constant MIN_DURATION = 600;
    uint32 internal constant MAX_DURATION = 14_400;
    uint16 internal constant SLASH_BPS = 2000;
    uint64 internal constant MAX_PRICE = 1e12;

    IMakhzan internal immutable m;
    TreeHarness internal immutable tree;
    bytes32 internal immutable root;
    uint32 internal immutable size;
    uint16 internal immutable blockSize;

    address[] internal actors;

    // providerAddresses[i] is the address that received providerId i + 1.
    address[] internal providerAddresses;
    uint16[] internal providerIds;
    address[] internal providerSet;
    mapping(address => bool) internal inProviderSet;

    uint32[] internal dealIds;

    // Coverage counters, read by invariant_reachablePathsAreExercised.
    uint256 public registers;
    uint256 public bonds;
    uint256 public withdrawals;
    uint256 public creations;
    uint256 public challenges;
    uint256 public answers;
    uint256 public resolves;
    uint256 public claims;
    uint256 public settles;
    uint256 public rejected;

    struct ResolveRecord {
        uint32 dealId;
        uint64 bondBefore;
        uint64 bondAfter;
    }

    ResolveRecord[] internal resolveRecords;

    // Invariant (3): at most one successful resolve per opened challenge.
    mapping(uint32 => uint32) internal openOrdinalOfDeal;
    mapping(uint32 => bool) internal ordinalResolved;
    uint32 internal ordinal;
    uint32 public doubleResolves;

    // Invariant (8): the last accepted proof must stay bound to its own position.
    bool public hasAnswer;
    uint32 public answerDealId;
    uint32 public answerIndex;
    bytes internal answerData;
    bytes32[] internal answerPath;

    constructor(
        IMakhzan m_,
        TreeHarness tree_,
        bytes32 root_,
        uint32 size_,
        uint16 blockSize_,
        address[3] memory actors_
    ) {
        m = m_;
        tree = tree_;
        root = root_;
        size = size_;
        blockSize = blockSize_;
        for (uint256 i; i < actors_.length; i++) {
            actors.push(actors_[i]);
            vm.deal(actors_[i], 1_000_000 ether);
        }
    }

    // ------------------------------------------------------------------ wiring

    function actionSelectors() external pure returns (bytes4[] memory s) {
        s = new bytes4[](9);
        s[0] = this.register.selector;
        s[1] = this.addBond.selector;
        s[2] = this.withdrawBond.selector;
        s[3] = this.createDeal.selector;
        s[4] = this.challengeDeal.selector;
        s[5] = this.answerDeal.selector;
        s[6] = this.resolveDeal.selector;
        s[7] = this.claimDeal.selector;
        s[8] = this.settleDeal.selector;
    }

    function knownDealIds() external view returns (uint32[] memory) {
        return dealIds;
    }

    function knownProviderSet() external view returns (address[] memory) {
        return providerSet;
    }

    function resolveRecordCount() external view returns (uint256) {
        return resolveRecords.length;
    }

    function resolveRecordAt(uint256 i) external view returns (uint32 dealId, uint64 bondBefore, uint64 bondAfter) {
        ResolveRecord storage r = resolveRecords[i];
        return (r.dealId, r.bondBefore, r.bondAfter);
    }

    function lastProof() external view returns (uint32 dealId, uint32 index, bytes memory data, bytes32[] memory path) {
        return (answerDealId, answerIndex, answerData, answerPath);
    }

    // ------------------------------------------------------------------ actions

    function register(uint256 actorSeed, uint64 units) external {
        address a = _actor(actorSeed);
        uint64 bounded = uint64(bound(uint256(units), MIN_BOND, 1e17));
        uint256 value = uint256(bounded) * WPU;
        vm.prank(a);
        try m.registerProvider{value: value}() {
            registers++;
            providerAddresses.push(a);
            uint16 id = uint16(providerAddresses.length);
            providerIds.push(id);
            if (!inProviderSet[a]) {
                inProviderSet[a] = true;
                providerSet.push(a);
            }
        } catch {
            rejected++;
        }
    }

    function addBond(uint256 actorSeed, uint64 units) external {
        address a = _actor(actorSeed);
        uint256 value = uint256(uint64(bound(uint256(units), 1, 1e17))) * WPU;
        vm.prank(a);
        try m.addBond{value: value}() {
            bonds++;
        } catch {
            rejected++;
        }
    }

    function withdrawBond(uint256 actorSeed) external {
        address a = _actor(actorSeed);
        vm.prank(a);
        try m.withdrawBond() {
            withdrawals++;
        } catch {
            rejected++;
        }
    }

    function createDeal(uint256 actorSeed, uint256 providerSeed, uint64 priceUnits, uint32 durationBlocks) external {
        if (providerIds.length == 0) return;
        address owner = _actor(actorSeed);
        uint16 providerId = providerIds[providerSeed % providerIds.length];
        uint64 price = uint64(bound(uint256(priceUnits), 1, MAX_PRICE));
        uint32 duration = uint32(bound(uint256(durationBlocks), MIN_DURATION, MAX_DURATION));
        uint32 id = uint32(dealIds.length) + 1;
        vm.prank(owner);
        try m.createDeal{value: uint256(price) * WPU}(providerId, root, 4, size, duration, price) {
            creations++;
            dealIds.push(id);
        } catch {
            rejected++;
        }
    }

    function challengeDeal(uint256 dealSeed, uint256 actorSeed) external {
        if (dealIds.length == 0) return;
        uint32 dealId = dealIds[dealSeed % dealIds.length];
        address owner = _dealOwner(dealId);
        // One attempt in four comes from a non-owner, to keep the owner-only guard in the fuzz.
        address caller = actorSeed % 4 == 0 ? _actor(actorSeed) : owner;
        vm.prank(caller);
        try m.challenge(dealId) {
            challenges++;
            ordinal++;
            openOrdinalOfDeal[dealId] = ordinal;
        } catch {
            rejected++;
        }
    }

    function answerDeal(uint256 dealSeed) external {
        if (dealIds.length == 0) return;
        uint32 dealId = dealIds[dealSeed % dealIds.length];
        (bool open, uint32 index,,,) = m.challengeStateOf(dealId);
        if (!open) return;
        address provider = _dealProvider(dealId);
        bytes memory data = tree.leaf(size, blockSize, index);
        bytes32[] memory path = tree.path(size, blockSize, index);
        vm.prank(provider);
        try m.answer(dealId, data, path) {
            answers++;
            hasAnswer = true;
            answerDealId = dealId;
            answerIndex = index;
            answerData = data;
            delete answerPath;
            for (uint256 i; i < path.length; i++) {
                answerPath.push(path[i]);
            }
        } catch {
            rejected++;
        }
    }

    function resolveDeal(uint256 dealSeed, uint256 actorSeed) external {
        if (dealIds.length == 0) return;
        uint32 dealId = dealIds[dealSeed % dealIds.length];
        (bool open,,,,) = m.challengeStateOf(dealId);
        if (!open) return;
        (uint16 providerId,,,) = m.providerOf(_dealProvider(dealId));
        uint64 bondBefore = providerId == 0 ? 0 : _providerBond(providerId);
        vm.prank(_actor(actorSeed));
        try m.resolve(dealId) {
            resolves++;
            uint32 o = openOrdinalOfDeal[dealId];
            if (o != 0) {
                if (ordinalResolved[o]) doubleResolves++;
                ordinalResolved[o] = true;
            }
            (uint16 afterId,,,) = m.providerOf(_dealProvider(dealId));
            uint64 bondAfter = afterId == 0 ? 0 : _providerBond(afterId);
            resolveRecords.push(ResolveRecord({dealId: dealId, bondBefore: bondBefore, bondAfter: bondAfter}));
        } catch {
            rejected++;
        }
    }

    function claimDeal(uint256 dealSeed, uint256 actorSeed) external {
        if (dealIds.length == 0) return;
        uint32 dealId = dealIds[dealSeed % dealIds.length];
        address provider = _dealProvider(dealId);
        // One claim in four comes from a non-provider, to keep the provider-only guard in the fuzz.
        address caller = actorSeed % 4 == 0 ? _actor(actorSeed) : provider;
        vm.prank(caller);
        try m.claim(dealId) {
            claims++;
        } catch {
            rejected++;
        }
    }

    function settleDeal(uint256 dealSeed, uint256 actorSeed) external {
        if (dealIds.length == 0) return;
        uint32 dealId = dealIds[dealSeed % dealIds.length];
        vm.prank(_actor(actorSeed));
        try m.settle(dealId) {
            settles++;
        } catch {
            rejected++;
        }
    }

    /// @notice Advance the chain so deadlines and end blocks are reachable within a sequence.
    function warp(uint256 blocks) external {
        vm.roll(block.number + bound(blocks, 1, 1200));
    }

    // ------------------------------------------------------------------ views

    function dealCount() external view returns (uint256) {
        return dealIds.length;
    }

    function dealIdAt(uint256 i) external view returns (uint32) {
        return dealIds[i];
    }

    // ------------------------------------------------------------------ helpers

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function _decodeDeal(uint32 dealId)
        internal
        view
        returns (address owner, uint16 providerId, uint8 flags, uint24 leafCount, uint64 price, uint64 claimed)
    {
        (owner,,, providerId, flags,, leafCount,,,, price, claimed) = m.dealOf(dealId);
    }

    function _dealOwner(uint32 dealId) internal view returns (address owner) {
        (owner,,,,,) = _decodeDeal(dealId);
    }

    function _dealProvider(uint32 dealId) internal view returns (address) {
        (, uint16 providerId,,,,) = _decodeDeal(dealId);
        return providerAddresses[providerId - 1];
    }

    function _providerBond(uint16 providerId) internal view returns (uint64 bond) {
        (, bond,,) = m.providerOf(providerAddresses[providerId - 1]);
    }
}
