import { createHash } from "node:crypto";
import type { LinkEndpoint } from "@netsim/shared";

export function macForEndpoint(ep: LinkEndpoint): string {
  const h = createHash("sha256").update(`${ep.deviceId}::${ep.interfaceName}`).digest();
  const bytes = [0x02, h[0], h[1], h[2], h[3], h[4]];
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join(":");
}
