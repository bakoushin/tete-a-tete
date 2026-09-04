import { privateKeyToAccount, sign } from "viem/accounts";
import { encodeAbiParameters, encodePacked, keccak256, serializeSignature, type Hex } from "viem";

export interface GatewaySigner {
  address: Hex;
  /** abi.encode(bytes result, uint64 expires, bytes sig) — what resolveWithProof() expects */
  signResponse(sender: Hex, expires: bigint, request: Hex, result: Hex): Promise<Hex>;
}

export function makeSigner(privateKey: Hex): GatewaySigner {
  const account = privateKeyToAccount(privateKey);
  return {
    address: account.address,
    async signResponse(sender, expires, request, result) {
      const hash = keccak256(
        encodePacked(
          ["bytes2", "address", "uint64", "bytes32", "bytes32"],
          ["0x1900", sender, expires, keccak256(request), keccak256(result)],
        ),
      );
      const sig = serializeSignature(await sign({ hash, privateKey }));
      return encodeAbiParameters(
        [{ type: "bytes" }, { type: "uint64" }, { type: "bytes" }],
        [result, expires, sig],
      );
    },
  };
}

declare global {
  var __tatSigner: GatewaySigner | undefined;
}

export function getSigner(): GatewaySigner {
  if (globalThis.__tatSigner) return globalThis.__tatSigner;
  const pk = process.env.GATEWAY_SIGNER_KEY as Hex | undefined;
  if (!pk) throw new Error("GATEWAY_SIGNER_KEY is not set");
  globalThis.__tatSigner = makeSigner(pk);
  return globalThis.__tatSigner;
}
