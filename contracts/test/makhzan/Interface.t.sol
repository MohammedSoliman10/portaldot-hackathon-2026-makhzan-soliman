// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IMakhzan} from "../../src/makhzan/IMakhzan.sol";
import {Makhzan} from "../../src/makhzan/Makhzan.sol";

/// @notice Structural conformance for the documented surface in contracts/imakhzan.md (T017).
contract InterfaceTest is Test {
    string internal constant ABI_JSON = "out/Makhzan.sol/Makhzan.json";

    struct DealView {
        address owner;
        uint32 startBlock;
        uint32 endBlock;
        uint16 providerId;
        uint8 flags;
        bytes32 root;
        uint24 leafCount;
        uint32 size;
        uint32 challengeIndex;
        uint32 challengeStart;
        uint64 price;
        uint64 claimed;
    }

    function _dealView(Makhzan m, uint32 dealId) internal view returns (DealView memory d) {
        (bool ok, bytes memory ret) = address(m).staticcall(abi.encodeWithSelector(IMakhzan.dealOf.selector, dealId));
        require(ok, "dealOf failed");
        d = abi.decode(ret, (DealView));
    }

    function _deploy() internal returns (Makhzan) {
        return new Makhzan(50, 1024, 2000, 1e15, 600, 14_400);
    }

    function _selector(string memory signature) internal pure returns (bytes4) {
        return bytes4(keccak256(bytes(signature)));
    }

    /// @dev Reads the compiled artifact and returns one selector per public/external function.
    function _functionSelectors() internal view returns (bytes4[] memory selectors) {
        string memory json = vm.readFile(ABI_JSON);
        string[] memory signatures = vm.parseJsonKeys(json, ".methodIdentifiers");
        selectors = new bytes4[](signatures.length);
        for (uint256 i; i < signatures.length; i++) {
            selectors[i] = bytes4(keccak256(bytes(signatures[i])));
        }
    }

    function test_abiIsExactlyTheDocumentedSurface() public view {
        bytes4[] memory actual = _functionSelectors();
        bytes4[15] memory expected = [
            _selector("registerProvider()"),
            _selector("addBond()"),
            _selector("withdrawBond()"),
            _selector("providerOf(address)"),
            _selector("createDeal(uint16,bytes32,uint24,uint32,uint32,uint64)"),
            _selector("dealOf(uint32)"),
            _selector("challenge(uint32)"),
            _selector("answer(uint32,bytes,bytes32[])"),
            _selector("resolve(uint32)"),
            _selector("challengeStateOf(uint32)"),
            _selector("claim(uint32)"),
            _selector("settle(uint32)"),
            _selector("accruedOf(uint32)"),
            _selector("healthOf(uint32)"),
            _selector("peek(bytes32[])")
        ];

        assertEq(actual.length, expected.length, "undocumented external function present");
        for (uint256 i; i < actual.length; i++) {
            bool known;
            for (uint256 j; j < expected.length; j++) {
                if (actual[i] == expected[j]) known = true;
            }
            assertTrue(known, "ABI selector is not in contracts/imakhzan.md");
        }
        for (uint256 j; j < expected.length; j++) {
            bool present;
            for (uint256 i; i < actual.length; i++) {
                if (actual[i] == expected[j]) present = true;
            }
            assertTrue(present, "documented selector missing from Makhzan");
        }
    }

    /// @dev Salt a raw slot without a product function: this only seeds state a real deal would own.
    function _dealSlot(uint32 dealId) internal pure returns (bytes32) {
        return keccak256(abi.encode(uint256(dealId), uint256(3)));
    }

    function test_peekReturnsRawSlotsInRequestOrder() public {
        Makhzan m = _deploy();
        bytes32 base = _dealSlot(7);
        bytes32 slotA = bytes32(uint256(0x1111));
        bytes32 slotB = bytes32(uint256(0x2222));
        bytes32 slotC = bytes32(uint256(0x3333));
        vm.store(address(m), base, slotA);
        vm.store(address(m), bytes32(uint256(base) + 1), slotB);
        vm.store(address(m), bytes32(uint256(base) + 2), slotC);

        bytes32[] memory requested = new bytes32[](5);
        requested[0] = base;
        requested[1] = bytes32(uint256(base) + 2);
        requested[2] = bytes32(uint256(base) + 1);
        requested[3] = _dealSlot(999);
        requested[4] = bytes32(uint256(base) + 3);
        bytes32[] memory values = m.peek(requested);

        assertEq(values.length, 5, "length");
        assertEq(values[0], slotA, "slot A in request order");
        assertEq(values[1], slotC, "slot C in request order");
        assertEq(values[2], slotB, "slot B in request order");
        assertEq(values[3], bytes32(0), "unallocated deal slot is zero");
        assertEq(values[4], bytes32(0), "slot past the deal record is zero");
    }

    function test_unknownIdsReadAsZero() public {
        Makhzan m = _deploy();
        (uint16 id, uint64 bond, uint24 activeDeals, bool registered) = m.providerOf(address(0xdead));
        assertEq(id, 0, "unknown provider id");
        assertEq(bond, 0, "unknown provider bond");
        assertEq(activeDeals, 0, "unknown provider deals");
        assertFalse(registered, "unknown provider not registered");

        DealView memory d = _dealView(m, 999);
        assertEq(d.owner, address(0), "unknown deal owner");
        assertEq(d.startBlock, 0, "unknown start");
        assertEq(d.endBlock, 0, "unknown end");
        assertEq(d.providerId, 0, "unknown provider id");
        assertEq(d.flags, 0, "unknown flags");
        assertEq(d.root, bytes32(0), "unknown root");
        assertEq(d.leafCount, 0, "unknown leaf count");
        assertEq(d.size, 0, "unknown size");
        assertEq(d.challengeIndex, 0, "unknown challenge index");
        assertEq(d.challengeStart, 0, "unknown challenge start");
        assertEq(d.price, 0, "unknown price");
        assertEq(d.claimed, 0, "unknown claimed");

        (bool open, uint32 index, uint32 start, uint32 deadline, uint32 expectedPathLength) = m.challengeStateOf(999);
        assertFalse(open, "unknown challenge open");
        assertEq(index, 0, "unknown challenge index");
        assertEq(start, 0, "unknown challenge start");
        assertEq(deadline, 0, "unknown challenge deadline");
        assertEq(expectedPathLength, 0, "unknown path length");

        (uint64 accrued, uint64 claimable) = m.accruedOf(999);
        assertEq(accrued, 0, "unknown accrued");
        assertEq(claimable, 0, "unknown claimable");
    }
}
