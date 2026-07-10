import { type CSSProperties } from "react";
import { ipv4ToInt, prefixLenToMask } from "@netsim/shared";

export function maskOrPrefixToMask(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const s = raw.startsWith("/") ? raw.slice(1) : raw;
  if (s.includes(".")) {
    return ipv4ToInt(s) === null ? null : s;
  }
  const n = Number(s);
  if (!Number.isInteger(n)) return null;
  return prefixLenToMask(n);
}

export function cableTypeLabel(cableType: string | undefined): string {
  if (!cableType) return "";
  switch (cableType) {
    case "auto":
      return "Auto";
    case "copper_straight":
      return "Copper (straight)";
    case "copper_crossover":
      return "Copper (crossover)";
    case "fiber":
      return "Fiber";
    default:
      return cableType;
  }
}

export function cableTypeSuffix(cableType: string | undefined): string {
  if (!cableType) return "";
  return ` [${cableTypeLabel(cableType)}]`;
}

export function edgeStyleForCableType(cableType: string | undefined): CSSProperties {
  if (!cableType) return { strokeWidth: 2 };
  switch (cableType) {
    case "fiber":
      return { strokeWidth: 2.25, stroke: "rgba(56, 189, 248, 0.85)", strokeDasharray: "7 5" };
    case "copper_straight":
      return { strokeWidth: 2, stroke: "rgba(34, 197, 94, 0.8)" };
    case "copper_crossover":
      return { strokeWidth: 2, stroke: "rgba(251, 146, 60, 0.85)" };
    case "auto":
      return { strokeWidth: 2, stroke: "rgba(148, 163, 184, 0.75)" };
    default:
      return { strokeWidth: 2 };
  }
}
