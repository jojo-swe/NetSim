import { useEffect, useMemo, useRef, useState } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { motion, AnimatePresence } from "framer-motion";
import { X, Minus, Terminal as TerminalIcon } from "lucide-react";
import "xterm/css/xterm.css";

function getWsOrigin(): string {
  return (import.meta as any).env?.VITE_WS_ORIGIN ?? "ws://localhost:3001";
}

type Props = {
  deviceId: string | null;
  onClose: () => void;
};

export function FloatingTerminal({ deviceId, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [minimized, setMinimized] = useState(false);

  const [status, setStatus] = useState<string>("Select a device");

  const title = useMemo(() => {
    if (!deviceId) return "Terminal";
    return `CLI - ${deviceId}`;
  }, [deviceId]);

  // Terminal Init
  useEffect(() => {
    if (!deviceId) return;
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'JetBrains Mono', monospace",
      theme: {
        background: "#0f1117",
        foreground: "#f3f4f6",
        cursor: "#38bdf8",
        selectionBackground: "rgba(56, 189, 248, 0.3)"
      },
      allowProposedApi: true
    });
    
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    termRef.current = term;
    fitRef.current = fit;

    // Initial greeting
    term.writeln("\x1b[1;34mNetSim CLI\x1b[0m Ready.");

    const onResize = () => fit.fit();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      term.dispose();
      if (termRef.current === term) {
        termRef.current = null;
      }
      if (fitRef.current === fit) {
        fitRef.current = null;
      }
    };
  }, [deviceId]);

  // Resize when minimizing/restoring
  useEffect(() => {
    if (!minimized && fitRef.current) {
      setTimeout(() => fitRef.current?.fit(), 300);
    }
  }, [minimized]);

  // WebSocket Logic
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    if (!deviceId) {
      setStatus("Idle");
      return;
    }

    setStatus("Connecting...");
    const ws = new WebSocket(`${getWsOrigin()}/ws/cli`);
    wsRef.current = ws;
    let lineBuf = "";

    const write = (s: string) => term.write(s);

    ws.onopen = () => {
      setStatus("Connected");
      term.writeln(`\r\n\x1b[32m[Connected to ${deviceId}]\x1b[0m`);
      ws.send(JSON.stringify({ type: "attach", deviceId }));
      term.focus();
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(String(evt.data));
        if (msg.type === "output" && msg.data) {
          write(msg.data.replace(/\n/g, "\r\n"));
          return;
        }

        if (msg.type === "complete") {
          const insert = typeof msg.insert === "string" ? msg.insert : "";
          const prompt = typeof msg.prompt === "string" ? msg.prompt : "";
          const candidates = Array.isArray(msg.candidates)
            ? msg.candidates.filter((c: unknown) => typeof c === "string")
            : [];

          if (insert) {
            lineBuf += insert;
            term.write(insert);
            return;
          }

          if (candidates.length > 0) {
            term.write("\r\n");
            term.write(candidates.join("\r\n"));
            term.write("\r\n");
            term.write(prompt);
            term.write(lineBuf);
          }
        }
      } catch {}
    };

    ws.onclose = () => {
      setStatus("Disconnected");
      term.writeln(`\r\n\x1b[31m[Disconnected]\x1b[0m`);
    };

    term.attachCustomKeyEventHandler((e) => {
      if (e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "complete", line: lineBuf }));
        }
        return false;
      }
      return true;
    });

    const disposeData = term.onData((data) => {
      if (data === "\r") {
        const toSend = lineBuf;
        lineBuf = "";
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "input", line: toSend }));
      } else if (data === "\u007f") {
        if (lineBuf.length > 0) {
          lineBuf = lineBuf.slice(0, -1);
          term.write("\b \b");
        }
      } else if (data >= " " && data <= "~") {
        lineBuf += data;
        term.write(data);
      }
    });

    return () => {
      disposeData.dispose();
      ws.close();
      wsRef.current = null;
    };
  }, [deviceId]);

  return (
    <AnimatePresence>
      {deviceId && (
        <motion.div
          initial={{ y: 100, opacity: 0, scale: 0.9 }}
          animate={{ y: 0, opacity: 1, scale: 1, height: minimized ? "auto" : 320 }}
          exit={{ y: 100, opacity: 0, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          drag
          dragMomentum={false}
          className="glass-panel"
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            width: 500,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            zIndex: 100
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "10px 14px",
              background: "rgba(255,255,255,0.03)",
              borderBottom: "1px solid var(--border-light)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "grab"
            }}
            onPointerDown={(e) => e.stopPropagation()} 
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <TerminalIcon size={14} color="var(--accent-primary)" />
              <span style={{ fontSize: 13, fontWeight: 500 }}>{title}</span>
              <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>{status}</span>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <button 
                className="btn-icon" 
                style={{ padding: 4 }} 
                onClick={() => setMinimized(!minimized)}
              >
                <Minus size={14} />
              </button>
              <button 
                className="btn-icon" 
                style={{ padding: 4 }} 
                onClick={onClose}
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Terminal Container */}
          <div 
            style={{ 
              flex: 1, 
              background: "#0f1117", 
              padding: 8,
              opacity: minimized ? 0 : 1,
              height: minimized ? 0 : "auto",
              transition: "opacity 0.2s"
            }}
          >
            <div ref={containerRef} style={{ height: "100%" }} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
