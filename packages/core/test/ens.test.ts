import { describe, expect, it } from "vitest";
import { dnsDecode, dnsEncode, nodeOf } from "../src/ens";
import { bytesToHex } from "../src/bytes";

describe("ens", () => {
  it("dns-encodes like ENSIP-10", () => {
    expect(bytesToHex(dnsEncode("eth"))).toBe("0365746800");
    expect(dnsDecode(dnsEncode("abc.tete-a-tete.eth"))).toBe("abc.tete-a-tete.eth");
  });
  it("namehash matches known value", () => {
    expect(nodeOf("eth")).toBe("0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae");
  });
});
