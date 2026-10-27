// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IMakhzan} from "./IMakhzan.sol";
import {MakhzanGuard} from "./MakhzanGuard.sol";

/// @title StorageGate
/// @notice A minimal consumer of Makhzan: it holds one payment per deal and lets it go only while
///         the deal is genuinely healthy, or back to the payer when the provider failed or the term
///         is over. No admin, no owner, no upgrade path.
contract StorageGate {
    error BadLock();
    error AlreadyLocked();

    event Locked(uint32 indexed dealId, address indexed payer, address indexed payee, uint96 amount);

    struct Lock {
        address payer; // slot 0: 20 bytes
        uint96 amount; // slot 0: 12 bytes
        address payee; // slot 1: 20 bytes
        uint8 status; // slot 1: 1 byte  0 none, 1 locked, 2 released, 3 refunded
    }

    IMakhzan public immutable makhzan;
    mapping(uint32 dealId => Lock) public lockOf;

    constructor(IMakhzan makhzan_) {
        makhzan = makhzan_;
    }

    /// @notice Deposit the payment for `dealId`. One lock per deal; only while the deal is healthy.
    function lock(uint32 dealId, address payee) external payable {
        if (payee == address(0) || msg.value == 0 || msg.value > type(uint96).max) revert BadLock();
        if (lockOf[dealId].status != 0) revert AlreadyLocked();
        MakhzanGuard.requireHealthy(makhzan, dealId);

        lockOf[dealId] = Lock(msg.sender, uint96(msg.value), payee, 1);
        emit Locked(dealId, msg.sender, payee, uint96(msg.value));
    }
}
