import { describe, it, expect } from "vitest";
import {
  ipv4ToInt,
  intToIpv4,
  maskToPrefixLen,
  prefixLenToMask,
  inSameSubnet,
  networkAddress,
  ipMatchesDestination
} from "@netsim/shared";

describe("ipv4ToInt", () => {
  it("converts valid IPs", () => {
    expect(ipv4ToInt("0.0.0.0")).toBe(0);
    expect(ipv4ToInt("10.0.0.1")).toBe(0x0a000001);
    expect(ipv4ToInt("255.255.255.255")).toBe(0xffffffff);
  });

  it("rejects invalid IPs", () => {
    expect(ipv4ToInt("256.0.0.1")).toBeNull();
    expect(ipv4ToInt("10.0.0")).toBeNull();
    expect(ipv4ToInt("abc")).toBeNull();
    expect(ipv4ToInt("")).toBeNull();
  });
});

describe("intToIpv4", () => {
  it("converts valid integers", () => {
    expect(intToIpv4(0)).toBe("0.0.0.0");
    expect(intToIpv4(0x0a000001)).toBe("10.0.0.1");
    expect(intToIpv4(0xffffffff)).toBe("255.255.255.255");
  });
});

describe("maskToPrefixLen", () => {
  it("converts valid masks", () => {
    expect(maskToPrefixLen("255.255.255.0")).toBe(24);
    expect(maskToPrefixLen("255.255.0.0")).toBe(16);
    expect(maskToPrefixLen("255.0.0.0")).toBe(8);
    expect(maskToPrefixLen("0.0.0.0")).toBe(0);
    expect(maskToPrefixLen("255.255.255.255")).toBe(32);
  });

  it("rejects invalid masks", () => {
    expect(maskToPrefixLen("255.0.255.0")).toBeNull();
    expect(maskToPrefixLen("abc")).toBeNull();
  });
});

describe("prefixLenToMask", () => {
  it("converts valid prefix lengths", () => {
    expect(prefixLenToMask(24)).toBe("255.255.255.0");
    expect(prefixLenToMask(16)).toBe("255.255.0.0");
    expect(prefixLenToMask(0)).toBe("0.0.0.0");
    expect(prefixLenToMask(32)).toBe("255.255.255.255");
  });

  it("rejects invalid prefix lengths", () => {
    expect(prefixLenToMask(-1)).toBeNull();
    expect(prefixLenToMask(33)).toBeNull();
  });
});

describe("inSameSubnet", () => {
  it("returns true for same subnet", () => {
    expect(inSameSubnet("10.0.0.1", "255.255.255.0", "10.0.0.2")).toBe(true);
  });

  it("returns false for different subnets", () => {
    expect(inSameSubnet("10.0.0.1", "255.255.255.0", "10.0.1.1")).toBe(false);
  });

  it("returns false for invalid IPs", () => {
    expect(inSameSubnet("abc", "255.255.255.0", "10.0.0.1")).toBe(false);
  });
});

describe("networkAddress", () => {
  it("computes network address", () => {
    expect(networkAddress("10.0.0.5", "255.255.255.0")).toBe("10.0.0.0");
    expect(networkAddress("192.168.1.100", "255.255.255.192")).toBe("192.168.1.64");
  });
});

describe("ipMatchesDestination", () => {
  it("matches within subnet", () => {
    expect(ipMatchesDestination("10.0.0.5", "10.0.0.0", "255.255.255.0")).toBe(true);
  });

  it("does not match outside subnet", () => {
    expect(ipMatchesDestination("10.0.1.5", "10.0.0.0", "255.255.255.0")).toBe(false);
  });

  it("matches default route", () => {
    expect(ipMatchesDestination("8.8.8.8", "0.0.0.0", "0.0.0.0")).toBe(true);
  });
});
