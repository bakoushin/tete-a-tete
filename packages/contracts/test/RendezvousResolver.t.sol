// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {RendezvousResolver, IResolverService} from "../src/RendezvousResolver.sol";
import {SignatureVerifier} from "../src/SignatureVerifier.sol";

contract RendezvousResolverTest is Test {
    RendezvousResolver r;
    uint256 signerPk = 0xA11CE;
    address signer;
    bytes name = hex"0361626303657468" hex"00"; // "abc.eth" (irrelevant to the contract)
    bytes data = abi.encodeWithSignature("text(bytes32,string)", bytes32(uint256(1)), "rdv");

    function setUp() public {
        signer = vm.addr(signerPk);
        string[] memory urls = new string[](1);
        urls[0] = "http://localhost:3000/api/ccip/{sender}/{data}";
        address[] memory signers = new address[](1);
        signers[0] = signer;
        r = new RendezvousResolver(urls, signers);
    }

    function _request() internal view returns (bytes memory) {
        return abi.encodeWithSelector(IResolverService.resolve.selector, name, data);
    }

    function _response(uint256 pk, uint64 expires, bytes memory result) internal view returns (bytes memory) {
        bytes32 h = keccak256(abi.encodePacked(hex"1900", address(r), expires, keccak256(_request()), keccak256(result)));
        (uint8 v, bytes32 rr, bytes32 ss) = vm.sign(pk, h);
        return abi.encode(result, expires, abi.encodePacked(rr, ss, v));
    }

    function test_supportsInterface() public view {
        assertTrue(r.supportsInterface(0x9061b923));
        assertTrue(r.supportsInterface(0x01ffc9a7));
        assertFalse(r.supportsInterface(0xffffffff));
    }

    function test_resolveRevertsWithOffchainLookup() public {
        (bool ok, bytes memory ret) = address(r).staticcall(abi.encodeCall(r.resolve, (name, data)));
        assertFalse(ok);
        assertEq(bytes4(ret), RendezvousResolver.OffchainLookup.selector);
        bytes memory body = new bytes(ret.length - 4);
        for (uint256 i = 0; i < body.length; i++) body[i] = ret[i + 4];
        (address sender, string[] memory urls, bytes memory callData, bytes4 cb, bytes memory extra) =
            abi.decode(body, (address, string[], bytes, bytes4, bytes));
        assertEq(sender, address(r));
        assertEq(urls.length, 1);
        assertEq(callData, _request());
        assertEq(cb, RendezvousResolver.resolveWithProof.selector);
        assertEq(extra, abi.encode(_request(), address(r)));
    }

    function test_validProof() public view {
        bytes memory result = abi.encode("ciphertext");
        bytes memory resp = _response(signerPk, uint64(block.timestamp + 60), result);
        assertEq(r.resolveWithProof(resp, abi.encode(_request(), address(r))), result);
    }

    function test_expiredProof() public {
        bytes memory result = abi.encode("ciphertext");
        bytes memory resp = _response(signerPk, uint64(block.timestamp + 60), result);
        vm.warp(block.timestamp + 61);
        vm.expectRevert(SignatureVerifier.SignatureExpired.selector);
        r.resolveWithProof(resp, abi.encode(_request(), address(r)));
    }

    function test_untrustedSigner() public {
        bytes memory result = abi.encode("ciphertext");
        bytes memory resp = _response(0xB0B, uint64(block.timestamp + 60), result);
        vm.expectRevert(abi.encodeWithSelector(RendezvousResolver.UntrustedSigner.selector, vm.addr(0xB0B)));
        r.resolveWithProof(resp, abi.encode(_request(), address(r)));
    }

    function test_tamperedResult() public {
        bytes memory resp = _response(signerPk, uint64(block.timestamp + 60), abi.encode("a"));
        (bytes memory res, uint64 exp, bytes memory sig) = abi.decode(resp, (bytes, uint64, bytes));
        res;
        bytes memory forged = abi.encode(abi.encode("b"), exp, sig);
        vm.expectRevert();
        r.resolveWithProof(forged, abi.encode(_request(), address(r)));
    }

    function test_onlyOwnerAdmin() public {
        string[] memory urls = new string[](1);
        urls[0] = "x";
        vm.prank(address(0xdead));
        vm.expectRevert();
        r.setUrls(urls);
        r.setUrls(urls);
        assertEq(r.gatewayUrls()[0], "x");
        address[] memory list = new address[](1);
        list[0] = signer;
        r.setSigners(list, false);
        assertFalse(r.signers(signer));
    }
}
