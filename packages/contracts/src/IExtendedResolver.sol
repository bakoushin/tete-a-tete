// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice ENSIP-10 wildcard resolution. interfaceId == 0x9061b923
interface IExtendedResolver {
    function resolve(bytes memory name, bytes memory data) external view returns (bytes memory);
}
