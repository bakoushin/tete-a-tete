// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IExtendedResolver} from "./IExtendedResolver.sol";
import {SignatureVerifier} from "./SignatureVerifier.sol";

interface IResolverService {
    function resolve(bytes calldata name, bytes calldata data)
        external
        view
        returns (bytes memory result, uint64 expires, bytes memory sig);
}

/**
 * @title RendezvousResolver
 * @notice Wildcard (ENSIP-10) resolver for `tete-a-tete.eth`. Every subname resolves through a
 *         CCIP-Read (EIP-3668) gateway that stores fixed-size ciphertext under random labels.
 *         The chain never learns which labels exist, who wrote them, or what they contain; it only
 *         verifies that a response was signed by a trusted gateway and has not expired.
 */
contract RendezvousResolver is IExtendedResolver, IERC165, Ownable {
    string[] private _urls;
    mapping(address => bool) public signers;

    event UrlsChanged(string[] urls);
    event SignersChanged(address[] signers, bool enabled);

    /// @dev EIP-3668
    error OffchainLookup(address sender, string[] urls, bytes callData, bytes4 callbackFunction, bytes extraData);
    error UntrustedSigner(address signer);

    constructor(string[] memory urls_, address[] memory signers_) Ownable(msg.sender) {
        _urls = urls_;
        for (uint256 i = 0; i < signers_.length; i++) {
            signers[signers_[i]] = true;
        }
        emit UrlsChanged(urls_);
        emit SignersChanged(signers_, true);
    }

    /// @notice Gateway URL templates. Clients also use this to find where to POST writes.
    function gatewayUrls() external view returns (string[] memory) {
        return _urls;
    }

    function setUrls(string[] memory urls_) external onlyOwner {
        _urls = urls_;
        emit UrlsChanged(urls_);
    }

    function setSigners(address[] calldata list, bool enabled) external onlyOwner {
        for (uint256 i = 0; i < list.length; i++) {
            signers[list[i]] = enabled;
        }
        emit SignersChanged(list, enabled);
    }

    /// @inheritdoc IExtendedResolver
    function resolve(bytes memory name, bytes memory data) external view override returns (bytes memory) {
        bytes memory callData = abi.encodeWithSelector(IResolverService.resolve.selector, name, data);
        revert OffchainLookup(
            address(this), _urls, callData, RendezvousResolver.resolveWithProof.selector, abi.encode(callData, address(this))
        );
    }

    /// @notice CCIP-Read callback: verifies the gateway signature and returns the ABI-encoded record.
    function resolveWithProof(bytes calldata response, bytes calldata extraData) external view returns (bytes memory) {
        (address signer, bytes memory result) = SignatureVerifier.verify(extraData, response);
        if (!signers[signer]) revert UntrustedSigner(signer);
        return result;
    }

    function supportsInterface(bytes4 interfaceId) public pure override returns (bool) {
        return interfaceId == type(IExtendedResolver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}
