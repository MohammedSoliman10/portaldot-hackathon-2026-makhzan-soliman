// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IMakhzan} from "../IMakhzan.sol";

/// @title BondLib
/// @notice The single seam for bond value: every credit, debit, slash and transfer goes through here.
///         Amounts are native units; wei conversion happens once at the Makhzan boundary.
library BondLib {
    uint8 internal constant REGISTERED = 1;

    /// @dev 32/32: addr(20) | bond(8) | activeDeals(3) | flags(1).
    struct Provider {
        address addr;
        uint64 bond;
        uint24 activeDeals;
        uint8 flags;
    }

    function isRegistered(Provider storage p) internal view returns (bool) {
        return p.flags & REGISTERED != 0;
    }

    /// @dev Adds units, rejecting zero (for a top-up) and any sum that leaves uint64.
    function credit(Provider storage p, uint256 units) internal {
        if (units == 0) revert IMakhzan.BadParams();
        uint256 next = uint256(p.bond) + units;
        if (next > type(uint64).max) revert IMakhzan.BadParams();
        p.bond = uint64(next);
    }

    /// @dev Clears the whole element (refundable) and returns the units owed.
    function clear(Provider storage p) internal returns (uint64 units) {
        units = p.bond;
        p.addr = address(0);
        p.bond = 0;
        p.activeDeals = 0;
        p.flags = 0;
    }

    /// @dev floor(bond * bps / 10_000), never more than the bond.
    function slash(Provider storage p, uint16 bps) internal returns (uint64 amount) {
        amount = uint64(uint256(p.bond) * bps / 10_000);
        p.bond -= amount;
    }

    /// @dev Native transfer that reverts the whole call on failure (FR-028).
    function pay(address to, uint256 amount) internal {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert IMakhzan.TransferFailed();
    }
}
