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
    error NotLocked();
    error NotPayee();
    error NotPayer();
    error RefundNotAllowed();
    error BondTooLow();
    error TransferFailed();

    event Locked(uint32 indexed dealId, address indexed payer, address indexed payee, uint96 amount);
    event Released(uint32 indexed dealId, address indexed payee, uint96 amount);
    event Refunded(uint32 indexed dealId, address indexed payer, uint96 amount);

    struct Lock {
        address payer; // slot 0: 20 bytes
        uint96 amount; // slot 0: 12 bytes
        address payee; // slot 1: 20 bytes
        uint64 minBond; // slot 1: 8 bytes  provider bond floor in planck, 0 = no check
        uint8 status; // slot 1: 1 byte  0 none, 1 locked, 2 released, 3 refunded
    }

    IMakhzan public immutable makhzan;
    mapping(uint32 dealId => Lock) public lockOf;

    constructor(IMakhzan makhzan_) {
        makhzan = makhzan_;
    }

    /// @notice Deposit the payment for `dealId`. One lock per deal; only while the deal is healthy.
    /// @param minBond provider bond floor in planck, checked at release; 0 disables the check.
    function lock(uint32 dealId, address payee, uint64 minBond) external payable {
        if (payee == address(0) || msg.value == 0 || msg.value > type(uint96).max) revert BadLock();
        if (lockOf[dealId].status != 0) revert AlreadyLocked();
        MakhzanGuard.requireHealthy(makhzan, dealId);

        lockOf[dealId] = Lock(msg.sender, uint96(msg.value), payee, minBond, 1);
        emit Locked(dealId, msg.sender, payee, uint96(msg.value));
    }

    /// @notice The recorded payee takes the payment, once, while the guard says healthy.
    function release(uint32 dealId) external {
        Lock storage l = lockOf[dealId];
        if (l.status != 1) revert NotLocked();
        if (msg.sender != l.payee) revert NotPayee();
        MakhzanGuard.requireHealthy(makhzan, dealId);
        if (l.minBond != 0 && _dealProviderBond(dealId, l.payee) < l.minBond) revert BondTooLow();

        uint96 amount = l.amount;
        l.status = 2;
        emit Released(dealId, msg.sender, amount);

        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    /// @notice The payer recovers the payment after a default, or once the term is over unreleased.
    function refund(uint32 dealId) external {
        Lock storage l = lockOf[dealId];
        if (l.status != 1) revert NotLocked();
        if (msg.sender != l.payer) revert NotPayer();
        if (makhzan.healthOf(dealId) != 3 && block.number < MakhzanGuard.endBlockOf(makhzan, dealId)) {
            revert RefundNotAllowed();
        }

        uint96 amount = l.amount;
        l.status = 3;
        emit Refunded(dealId, msg.sender, amount);

        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    /// @dev The deal provider's current bond, in planck. Makhzan exposes `providerOf(address)`, not
    ///      a providerId lookup, so the payee's provider record is used and its id must match the
    ///      deal's providerId. Any other payee has no bond to prove and reads as 0.
    function _dealProviderBond(uint32 dealId, address payee) private view returns (uint64 bond) {
        (,,, uint16 providerId,,,,,,,,) = makhzan.dealOf(dealId);
        (uint16 id, uint64 current,,) = makhzan.providerOf(payee);
        // An unregistered payee has id 0, and a real deal's providerId is never 0.
        return id == providerId ? current : 0;
    }
}
