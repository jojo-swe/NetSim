export function ipv4ToInt(ip: string): number | null {
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    if (part.length === 0) return null;
    const v = Number(part);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = (n << 8) | v;
  }
  return n >>> 0;
}

export function intToIpv4(n: number): string {
  return [
    (n >>> 24) & 255,
    (n >>> 16) & 255,
    (n >>> 8) & 255,
    n & 255
  ].join(".");
}

export function inSameSubnet(ip: string, mask: string, otherIp: string): boolean {
  const ipN = ipv4ToInt(ip);
  const maskN = ipv4ToInt(mask);
  const otherN = ipv4ToInt(otherIp);
  if (ipN === null || maskN === null || otherN === null) return false;
  return (ipN & maskN) === (otherN & maskN);
}

export function networkAddress(ip: string, mask: string): string | null {
  const ipN = ipv4ToInt(ip);
  const maskN = ipv4ToInt(mask);
  if (ipN === null || maskN === null) return null;
  return intToIpv4((ipN & maskN) >>> 0);
}

export function maskToPrefixLen(mask: string): number | null {
  const m = ipv4ToInt(mask);
  if (m === null) return null;

  let seenZero = false;
  let len = 0;
  for (let i = 31; i >= 0; i--) {
    const bit = (m >>> i) & 1;
    if (bit === 1) {
      if (seenZero) return null;
      len++;
    } else {
      seenZero = true;
    }
  }

  return len;
}

export function prefixLenToMask(prefixLen: number): string | null {
  if (!Number.isInteger(prefixLen) || prefixLen < 0 || prefixLen > 32) return null;
  const m = prefixLen === 0 ? 0 : ((0xffffffff << (32 - prefixLen)) >>> 0);
  const parts = [(m >>> 24) & 255, (m >>> 16) & 255, (m >>> 8) & 255, m & 255];
  return parts.join(".");
}

export function ipMatchesDestination(targetIp: string, destination: string, mask: string): boolean {
  const t = ipv4ToInt(targetIp);
  const d = ipv4ToInt(destination);
  const m = ipv4ToInt(mask);
  if (t === null || d === null || m === null) return false;
  return (t & m) === (d & m);
}
