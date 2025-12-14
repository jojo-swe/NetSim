import { motion } from "framer-motion";
import { Router, Box, Server, Shield, Cloud, Layers2, Monitor } from "lucide-react";

type Props = {
  onAddRouter: () => void;
  onAddSwitch: () => void;
  onAddL3Switch: () => void;
  onAddFirewall: () => void;
  onAddServer: () => void;
  onAddCloud: () => void;
  onAddHost: () => void;
};

export function DevicePalette({
  onAddRouter,
  onAddSwitch,
  onAddL3Switch,
  onAddFirewall,
  onAddServer,
  onAddCloud,
  onAddHost
}: Props) {
  return (
    <motion.div
      initial={{ x: -100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="glass-panel"
      style={{
        position: "absolute",
        left: 20,
        top: 20,
        padding: "16px 12px",
        borderRadius: "var(--radius-lg)",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        zIndex: 50,
        background: "rgba(15, 23, 42, 0.6)", // slightly darker
        backdropFilter: "blur(16px)"
      }}
    > 
      <div className="tooltip-container" style={{ position: "relative" }}>
        <button className="device-btn" onClick={onAddRouter}>
          <Router size={24} color="#38BDF8" />
        </button>
        <span className="tooltip">Add Router</span>
      </div>

      <div className="tooltip-container" style={{ position: "relative" }}>
        <button className="device-btn" onClick={onAddSwitch}>
          <Box size={24} color="#818CF8" />
        </button>
        <span className="tooltip">Add Switch</span>
      </div>

      <div className="tooltip-container" style={{ position: "relative" }}>
        <button className="device-btn" onClick={onAddL3Switch}>
          <Layers2 size={24} color="#FBBF24" />
        </button>
        <span className="tooltip">Add L3 Switch</span>
      </div>

      <div className="tooltip-container" style={{ position: "relative" }}>
        <button className="device-btn" onClick={onAddFirewall}>
          <Shield size={24} color="#F87171" />
        </button>
        <span className="tooltip">Add Firewall</span>
      </div>

      <div className="tooltip-container" style={{ position: "relative" }}>
        <button className="device-btn" onClick={onAddServer}>
          <Server size={24} color="#A78BFA" />
        </button>
        <span className="tooltip">Add Server</span>
      </div>

      <div className="tooltip-container" style={{ position: "relative" }}>
        <button className="device-btn" onClick={onAddCloud}>
          <Cloud size={24} color="#60A5FA" />
        </button>
        <span className="tooltip">Add Cloud</span>
      </div>

      <div className="tooltip-container" style={{ position: "relative" }}>
        <button className="device-btn" onClick={onAddHost}>
          <Monitor size={24} color="#34D399" />
        </button>
        <span className="tooltip">Add Host</span>
      </div>

      <style>{`
        .device-btn {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-light);
          border-radius: 12px;
          width: 44px;
          height: 44px;
          padding: 0;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .device-btn:hover {
          background: rgba(56, 189, 248, 0.1);
          border-color: rgba(56, 189, 248, 0.3);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }
        .device-btn:active {
          transform: translateY(0);
          box-shadow: none;
        }
        
        .tooltip-container:hover .tooltip {
          opacity: 1;
          transform: translateX(10px);
        }
        .tooltip {
          position: absolute;
          left: 100%;
          top: 50%;
          transform: translateY(-50%) translateX(0);
          margin-left: 10px;
          padding: 6px 10px;
          background: #0F172A;
          border: 1px solid var(--border-light);
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
          color: var(--text-primary);
          opacity: 0;
          pointer-events: none;
          transition: all 0.2s;
          white-space: nowrap;
          z-index: 100;
          box-shadow: var(--shadow-lg);
        }
      `}</style>
    </motion.div>
  );
}

