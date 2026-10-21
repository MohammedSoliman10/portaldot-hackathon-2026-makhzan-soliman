// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IMakhzan} from "../../../src/makhzan/IMakhzan.sol";

/// @notice Test-only recipient that re-enters the exit paths or rejects value. Never deployed.
contract MaliciousReceiver {
    IMakhzan internal immutable m;
    uint32 internal dealId;
    uint8 internal mode; // 0 none, 1 claim, 2 settle, 3 resolve, 4 withdrawBond, 5 all four
    bool internal rejectValue;
    /// @dev Counts every re-entrant call this contract actually attempted.
    uint8 public attempts;

    constructor(IMakhzan m_) {
        m = m_;
    }

    function configure(uint32 dealId_, uint8 mode_, bool rejectValue_) external {
        dealId = dealId_;
        mode = mode_;
        rejectValue = rejectValue_;
    }

    function registerProvider() external payable {
        m.registerProvider{value: msg.value}();
    }

    function addBond() external payable {
        m.addBond{value: msg.value}();
    }

    function withdrawBond() external {
        m.withdrawBond();
    }

    function createDeal(uint16 providerId, bytes32 root, uint24 leafCount, uint32 size, uint32 duration, uint64 price)
        external
        payable
    {
        m.createDeal{value: msg.value}(providerId, root, leafCount, size, duration, price);
    }

    function challenge(uint32 dealId_) external {
        m.challenge(dealId_);
    }

    function claim(uint32 dealId_) external {
        m.claim(dealId_);
    }

    function settle(uint32 dealId_) external {
        m.settle(dealId_);
    }

    function resolve(uint32 dealId_) external {
        m.resolve(dealId_);
    }

    receive() external payable {
        if (rejectValue) revert("no value accepted");
        if (mode == 0) return;
        if (mode == 1 || mode == 5) {
            attempts++;
            try m.claim(dealId) {} catch {}
        }
        if (mode == 2 || mode == 5) {
            attempts++;
            try m.settle(dealId) {} catch {}
        }
        if (mode == 3 || mode == 5) {
            attempts++;
            try m.resolve(dealId) {} catch {}
        }
        if (mode == 4 || mode == 5) {
            attempts++;
            try m.withdrawBond() {} catch {}
        }
    }
}
