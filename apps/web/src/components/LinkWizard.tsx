import { type Edge } from "reactflow";
import { devicePorts, deviceIsMdix, type CableType, type DeviceType, type DevicePort } from "@netsim/shared";
import { type LinkWizardState } from "../types";
import { cableTypeLabel, cableTypeSuffix, edgeStyleForCableType } from "../utils/cableUtils";

type LinkWizardProps = {
  linkWizard: LinkWizardState;
  linkWizardUi: {
    srcAvail: DevicePort[];
    dstAvail: DevicePort[];
    error?: string;
    canCreate: boolean;
  } | null;
  inferDeviceType: (deviceId: string) => DeviceType;
  suggestCableType: (sourceId: string, sourceIf: string, targetId: string, targetIf: string) => CableType;
  createLink: (
    sourceId: string,
    targetId: string,
    opts?: { sourceIf?: string; targetIf?: string; cableType?: CableType }
  ) => Promise<{ id: string; a: { deviceId: string; interfaceName: string }; b: { deviceId: string; interfaceName: string }; cableType?: string }>;
  setEdges: (updater: (prev: Edge[]) => Edge[]) => void;
  setLinkWizard: (updater: (prev: LinkWizardState | null) => LinkWizardState | null) => void;
};

export function LinkWizard({
  linkWizard,
  linkWizardUi,
  inferDeviceType,
  suggestCableType,
  createLink,
  setEdges,
  setLinkWizard
}: LinkWizardProps) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 120,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20
      }}
      onMouseDown={() => setLinkWizard(() => null)}
    >
      <div
        style={{
          width: 520,
          maxWidth: "95vw",
          background: "var(--bg-panel)",
          border: "1px solid rgba(148, 163, 184, 0.18)",
          borderRadius: 12,
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
          padding: 16
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ color: "var(--text-primary)", fontWeight: 600, fontSize: 14 }}>Create cable</div>
          <button
            onClick={() => setLinkWizard(() => null)}
            style={{
              border: "1px solid rgba(148, 163, 184, 0.18)",
              background: "transparent",
              color: "var(--text-muted)",
              borderRadius: 8,
              padding: "6px 10px",
              cursor: "pointer"
            }}
          >
            Cancel
          </button>
        </div>

        <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>{linkWizard.sourceId} port</div>
              <select
                value={linkWizard.sourceIf}
                onChange={(e) =>
                  setLinkWizard((w) => {
                    if (!w) return w;
                    const nextSourceIf = e.target.value;
                    const next: typeof w = { ...w, sourceIf: nextSourceIf, error: undefined };
                    if (!w.cableTypeLocked) {
                      if (nextSourceIf && w.targetIf) {
                        next.cableType = suggestCableType(w.sourceId, nextSourceIf, w.targetId, w.targetIf);
                      } else {
                        next.cableType = "auto";
                      }
                    }
                    return next;
                  })
                }
                style={{ width: "100%", padding: 8, borderRadius: 8, background: "var(--bg-app)", color: "var(--text-primary)", border: "1px solid rgba(148, 163, 184, 0.18)" }}
              >
                <option value="" disabled>
                  {linkWizardUi?.srcAvail.length ? "Select port" : "No free ports"}
                </option>
                {(linkWizardUi?.srcAvail ?? []).map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} ({p.kind.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>{linkWizard.targetId} port</div>
              <select
                value={linkWizard.targetIf}
                onChange={(e) =>
                  setLinkWizard((w) => {
                    if (!w) return w;
                    const nextTargetIf = e.target.value;
                    const next: typeof w = { ...w, targetIf: nextTargetIf, error: undefined };
                    if (!w.cableTypeLocked) {
                      if (w.sourceIf && nextTargetIf) {
                        next.cableType = suggestCableType(w.sourceId, w.sourceIf, w.targetId, nextTargetIf);
                      } else {
                        next.cableType = "auto";
                      }
                    }
                    return next;
                  })
                }
                style={{ width: "100%", padding: 8, borderRadius: 8, background: "var(--bg-app)", color: "var(--text-primary)", border: "1px solid rgba(148, 163, 184, 0.18)" }}
              >
                <option value="" disabled>
                  {linkWizardUi?.dstAvail.length ? "Select port" : "No free ports"}
                </option>
                {(linkWizardUi?.dstAvail ?? []).map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} ({p.kind.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>Cable type</div>
            <select
              value={linkWizard.cableType}
              onChange={(e) =>
                setLinkWizard((w) =>
                  w ? { ...w, cableType: e.target.value as CableType, cableTypeLocked: true, error: undefined } : w
                )
              }
              style={{ width: "100%", padding: 8, borderRadius: 8, background: "var(--bg-app)", color: "var(--text-primary)", border: "1px solid rgba(148, 163, 184, 0.18)" }}
            >
              <option value="auto">Auto</option>
              <option value="copper_straight">Copper straight-through</option>
              <option value="copper_crossover">Copper crossover</option>
              <option value="fiber">Fiber</option>
            </select>
            <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-muted)" }}>
              {cableTypeLabel(linkWizard.cableType)}
            </div>
          </div>

          {linkWizardUi?.error ? (
            <div style={{ fontSize: 12, color: "var(--accent-danger)" }}>{linkWizardUi.error}</div>
          ) : null}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button
              onClick={() => setLinkWizard(() => null)}
              style={{
                border: "1px solid rgba(148, 163, 184, 0.18)",
                background: "transparent",
                color: "var(--text-muted)",
                borderRadius: 10,
                padding: "8px 12px",
                cursor: "pointer"
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (!linkWizardUi?.canCreate) return;
                const srcType = inferDeviceType(linkWizard.sourceId) as DeviceType;
                const dstType = inferDeviceType(linkWizard.targetId) as DeviceType;

                const srcKind = devicePorts(srcType).find((p) => p.name === linkWizard.sourceIf)?.kind ?? "rj45";
                const dstKind = devicePorts(dstType).find((p) => p.name === linkWizard.targetIf)?.kind ?? "rj45";

                if (linkWizard.cableType === "fiber" && (srcKind !== "sfp" || dstKind !== "sfp")) {
                  setLinkWizard((w) => (w ? { ...w, error: "Fiber cable requires SFP ports on both ends" } : w));
                  return;
                }
                if (
                  (linkWizard.cableType === "copper_straight" || linkWizard.cableType === "copper_crossover") &&
                  (srcKind !== "rj45" || dstKind !== "rj45")
                ) {
                  setLinkWizard((w) => (w ? { ...w, error: "Copper cable requires RJ45 ports on both ends" } : w));
                  return;
                }

                if (linkWizard.cableType === "copper_straight" || linkWizard.cableType === "copper_crossover") {
                  const sameRole = deviceIsMdix(srcType) === deviceIsMdix(dstType);
                  if (linkWizard.cableType === "copper_straight" && sameRole) {
                    setLinkWizard((w) => (w ? { ...w, error: "Straight-through requires one MDI and one MDI-X" } : w));
                    return;
                  }
                  if (linkWizard.cableType === "copper_crossover" && !sameRole) {
                    setLinkWizard((w) => (w ? { ...w, error: "Crossover requires both ends to match (MDI/MDI-X)" } : w));
                    return;
                  }
                }

                void (async () => {
                  try {
                    const link = await createLink(linkWizard.sourceId, linkWizard.targetId, {
                      sourceIf: linkWizard.sourceIf,
                      targetIf: linkWizard.targetIf,
                      cableType: linkWizard.cableType
                    });

                    const edge: Edge = {
                      id: link.id,
                      source: linkWizard.sourceId,
                      target: linkWizard.targetId,
                      label: `${linkWizard.sourceId} ${link.a.interfaceName} ↔ ${linkWizard.targetId} ${link.b.interfaceName}${cableTypeSuffix(link.cableType)}`,
                      data: { a: link.a, b: link.b, cableType: link.cableType },
                      style: edgeStyleForCableType(link.cableType)
                    };

                    setEdges((eds: Edge[]) => [...eds, edge]);
                    setLinkWizard(() => null);
                  } catch (err) {
                    const message = err instanceof Error ? err.message : "Failed to create link";
                    setLinkWizard((w) => (w ? { ...w, error: message } : w));
                  }
                })();
              }}
              style={{
                border: "1px solid rgba(56, 189, 248, 0.35)",
                background: "rgba(56, 189, 248, 0.12)",
                color: "var(--text-primary)",
                borderRadius: 10,
                padding: "8px 12px",
                cursor: linkWizardUi?.canCreate ? "pointer" : "not-allowed",
                opacity: linkWizardUi?.canCreate ? 1 : 0.55
              }}
              disabled={!linkWizardUi?.canCreate}
            >
              Create
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
