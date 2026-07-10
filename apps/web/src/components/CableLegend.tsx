import { edgeStyleForCableType } from "../utils/cableUtils";

export function CableLegend() {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 10,
        left: 20,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        zIndex: 40
      }}
    >
      <div
        style={{
          padding: 10,
          borderRadius: 10,
          background: "rgba(15, 23, 42, 0.45)",
          border: "1px solid rgba(148, 163, 184, 0.14)",
          backdropFilter: "blur(10px)",
          color: "var(--text-muted)",
          fontSize: 11,
          opacity: 0.95
        }}
      >
        <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 11, marginBottom: 8 }}>
          Cable legend
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          {([
            { type: "fiber" as const, label: "Fiber" },
            { type: "copper_straight" as const, label: "Copper (straight)" },
            { type: "copper_crossover" as const, label: "Copper (crossover)" },
            { type: "auto" as const, label: "Auto" }
          ] as const).map((x) => {
            const s = edgeStyleForCableType(x.type);
            const stroke = typeof s.stroke === "string" ? s.stroke : "rgba(148, 163, 184, 0.75)";
            const strokeWidth = typeof s.strokeWidth === "number" ? s.strokeWidth : 2;
            const dash = typeof s.strokeDasharray === "string" ? s.strokeDasharray : undefined;
            return (
              <div key={x.type} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <svg width={36} height={10} style={{ display: "block" }}>
                  <line x1={0} y1={5} x2={36} y2={5} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={dash} />
                </svg>
                <div>{x.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div
        style={{
          color: "var(--text-muted)",
          fontSize: 10,
          opacity: 0.5
        }}
      >
        NetSim v0.1.0-alpha
      </div>
    </div>
  );
}
