// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @notice Verifies a gateway response signed off-chain (same scheme as ENS offchain-resolver).
library SignatureVerifier {
    error SignatureExpired();

    /// @dev Hash of (target, expires, request, result) the gateway signs.
    function makeSignatureHash(address target, uint64 expires, bytes memory request, bytes memory result)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(hex"1900", target, expires, keccak256(request), keccak256(result)));
    }

    /// @param request  abi.encode(bytes callData, address sender) — the extraData from OffchainLookup
    /// @param response abi.encode(bytes result, uint64 expires, bytes sig)
    function verify(bytes calldata request, bytes calldata response)
        internal
        view
        returns (address signer, bytes memory result)
    {
        uint64 expires;
        bytes memory sig;
        (result, expires, sig) = abi.decode(response, (bytes, uint64, bytes));
        (bytes memory extraData, address sender) = abi.decode(request, (bytes, address));
        signer = ECDSA.recover(makeSignatureHash(sender, expires, extraData, result), sig);
        if (expires < block.timestamp) revert SignatureExpired();
    }
}
