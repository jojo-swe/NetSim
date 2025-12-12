import { useRef } from "react";
import { Upload, Save, RotateCcw, CheckCircle2 } from "lucide-react";

type Props = {
  labs: { id: string; title: string }[];
  selectedLabId: string;
  onSelectLab: (id: string) => void;
  onValidate: () => void;
  validating: boolean;
  onSave: () => void;
  onLoad: (file: File) => void;
  onReset: () => void;
  validationResult: { score: number; passed: boolean } | null;
};

export function LabControls({
  labs,
  selectedLabId,
  onSelectLab,
  onValidate,
  validating,
  onSave,
  onLoad,
  onReset,
  validationResult
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="glass-panel" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12, width: 280 }}>
      {/* Lab Selection & Validation */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>
          Active Lab
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <select
            value={selectedLabId}
            onChange={(e) => onSelectLab(e.target.value)}
            style={{
              flex: 1,
              background: "rgba(0,0,0,0.2)",
              border: "1px solid var(--border-light)",
              color: "var(--text-primary)",
              borderRadius: "var(--radius-sm)",
              padding: "6px 10px",
              fontSize: 13,
              outline: "none"
            }}
          >
            {labs.map((lab) => (
              <option key={lab.id} value={lab.id}>
                {lab.title}
              </option>
            ))}
          </select>
          <button
            className="btn-primary"
            onClick={onValidate}
            disabled={validating}
            style={{ padding: "6px 12px" }}
          >
            {validating ? "..." : <CheckCircle2 size={16} />}
          </button>
        </div>
      </div>

      {/* Validation Result */}
      {validationResult && (
        <div
          style={{
            padding: 10,
            borderRadius: "var(--radius-sm)",
            background: validationResult.passed ? "rgba(52, 211, 153, 0.1)" : "rgba(248, 113, 113, 0.1)",
            border: `1px solid ${validationResult.passed ? "rgba(52, 211, 153, 0.2)" : "rgba(248, 113, 113, 0.2)"}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 13
          }}
        >
          <span>Score: <strong>{validationResult.score}%</strong></span>
          <span style={{ fontWeight: 600, color: validationResult.passed ? "var(--accent-success)" : "var(--accent-error)" }}>
            {validationResult.passed ? "PASS" : "FAIL"}
          </span>
        </div>
      )}

      <div style={{ height: 1, background: "var(--border-light)" }} />

      {/* Actions */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <button className="btn-icon" onClick={onSave} title="Save Lab">
          <Save size={18} />
        </button>
        
        <button className="btn-icon" onClick={() => fileInputRef.current?.click()} title="Load Lab">
          <Upload size={18} />
        </button>
        
        <button className="btn-icon" onClick={onReset} title="Reset Topology">
          <RotateCcw size={18} />
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        style={{ display: "none" }}
        onChange={(e) => {
          if (e.target.files?.[0]) {
            onLoad(e.target.files[0]);
            e.target.value = "";
          }
        }}
      />
    </div>
  );
}
