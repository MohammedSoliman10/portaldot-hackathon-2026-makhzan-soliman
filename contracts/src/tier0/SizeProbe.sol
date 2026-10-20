// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title SizeProbe
/// @notice Disposable G02 probe. Deploys runtime code of exactly `size` zero bytes.
/// @dev The constructor returns uninitialised memory, so the deployed code is N STOP opcodes.
///      This isolates the code-size limit from compiler output. Not a product contract.
contract SizeProbe {
    constructor(uint256 size) {
        assembly {
            return(0, size)
        }
    }
}
