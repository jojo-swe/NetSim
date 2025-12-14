import { memo } from "react";
import { Handle, NodeProps, Position } from "reactflow";
import { Router, Box, Server, Cloud, Shield, Layers2, Monitor } from "lucide-react";

/**
 * Modern "Linear" style Device Node
 * - Uses Lucide React icons
 * - Discrete handles to ensure clickability
 * - Gradient backgrounds and glow effects
 */
const DeviceNode = ({ data, selected }: NodeProps) => {
  const label = data.label.toLowerCase();
  const upperId = data.deviceId.toUpperCase();

  const isRouter = label.includes("router") || upperId.startsWith("R");
  const isL3Switch =
    upperId.startsWith("L3SW") || (label.includes("l3") && label.includes("switch"));
  const isSwitch = label.includes("switch") || upperId.startsWith("SW");
  const isFirewall = label.includes("firewall") || upperId.startsWith("FW");
  const isServer = label.includes("server") || upperId.startsWith("SRV");
  const isCloud = label.includes("cloud") || label.includes("internet") || upperId.startsWith("CLOUD");
  const isHost = label.includes("host") || upperId.startsWith("H");

  // Icon Selection
  let Icon = Box;
  if (isRouter) Icon = Router;
  else if (isL3Switch) Icon = Layers2;
  else if (isSwitch) Icon = Box; // Switch often looks like a box with arrows, but Box is clean for now. 
  else if (isFirewall) Icon = Shield;
  else if (isCloud) Icon = Cloud;
  else if (isServer) Icon = Server;
  else if (isHost) Icon = Monitor;
  // actually let's use a specific look for switch if possible or just generic. 
  // Lucide doesn't have a perfect "Switch" icon, so we use Box or maybe something else.
  // Let's stick to Box for switch, Router for Router.
  
  // Custom Gradients
  const bgGradient = selected 
    ? "linear-gradient(135deg, rgba(56, 189, 248, 0.2) 0%, rgba(59, 130, 246, 0.2) 100%)"
    : "linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%)";
    
  const borderColor = selected ? "var(--accent-primary)" : "rgba(255,255,255,0.1)";
  const shadow = selected ? "0 0 20px rgba(56, 189, 248, 0.3), inset 0 0 10px rgba(56, 189, 248, 0.1)" : "0 4px 6px -1px rgba(0, 0, 0, 0.3)";

  return (
    <div 
      className="device-node-container"
      style={{
        position: 'relative',
        width: 60,
        height: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Node Body */}
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '16px',
          background: bgGradient,
          border: `1px solid ${borderColor}`,
          boxShadow: shadow,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
          backdropFilter: 'blur(8px)',
          zIndex: 10 // Ensure above handles visually, but handles need to be clickable
        }}
      >
        <Icon 
          size={28} 
          color={selected ? "#38BDF8" : "#94A3B8"} 
          strokeWidth={1.5}
        />
      </div>

      {/* Label - Floating Below */}
      <div
        style={{
          position: "absolute",
          top: "115%",
          left: "50%",
          transform: "translateX(-50%)",
          fontSize: "11px",
          fontWeight: 500,
          color: selected ? "var(--text-primary)" : "var(--text-muted)",
          whiteSpace: "nowrap",
          textShadow: "0 1px 2px rgba(0,0,0,0.8)",
          transition: "color 0.2s"
        }}
      >
        {data.label}
      </div>

      {/* Handles 
          We place them at cardinal directions. 
          Make them slightly larger than visual dot for hit area, but visual dot is small.
      */}
      <Handle
        type="target"
        position={Position.Top}
        id="t"
        style={{ 
          width: 8, height: 8, background: 'var(--text-muted)', 
          top: -4, border: '2px solid var(--bg-app)', 
          opacity: 0.5, transition: 'opacity 0.2s',
          zIndex: 20
        }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="b"
        style={{ 
          width: 8, height: 8, background: 'var(--text-muted)', 
          bottom: -4, border: '2px solid var(--bg-app)',
          opacity: 0.5, transition: 'opacity 0.2s',
          zIndex: 20
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="r"
        style={{ 
          width: 8, height: 8, background: 'var(--text-muted)', 
          right: -4, border: '2px solid var(--bg-app)',
          opacity: 0.5, transition: 'opacity 0.2s',
          zIndex: 20
        }}
      />
       <Handle
        type="target"
        position={Position.Left}
        id="l"
        style={{ 
          width: 8, height: 8, background: 'var(--text-muted)', 
          left: -4, border: '2px solid var(--bg-app)',
          opacity: 0.5, transition: 'opacity 0.2s',
          zIndex: 20
        }}
      />
      
      {/* CSS for hover effect on handles */}
      <style>{`
        .device-node-container:hover .react-flow__handle {
          opacity: 1;
          background: var(--accent-primary);
        }
      `}</style>
    </div>
  );
};

export default memo(DeviceNode);

