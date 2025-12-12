import { useEffect, useMemo, useRef, useState } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";

function getWsOrigin(): string {
  return (import.meta as any).env?.VITE_WS_ORIGIN ?? "ws://localhost:3001";
}

type Props = {
  deviceId: string | null;
};

export function TerminalPanel({ deviceId }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const [status, setStatus] = useState<string>("Select a device");

  const title = useMemo(() => {
    if (!deviceId) return "CLI";
    return `CLI - ${deviceId}`;
  }, [deviceId]);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      theme: {
        background: "#0b1220",
        foreground: "#e5e7eb"
      }
    });
    const fit = new FitAddon();
    term.loadAddon(fit);

    term.open(containerRef.current);
    fit.fit();

    termRef.current = term;
    fitRef.current = fit;

    const onResize = () => {
      fit.fit();
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    term.reset();

    if (!deviceId) {
      setStatus("Select a device");
      term.writeln("Select a node in the topology to start a CLI session.");
      return;
    }

    setStatus("Connecting...");

    const ws = new WebSocket(`${getWsOrigin()}/ws/cli`);
    wsRef.current = ws;

    let lineBuf = "";

    const write = (s: string) => {
      term.write(s);
    };

    ws.onopen = () => {
      setStatus("Connected");
      ws.send(JSON.stringify({ type: "attach", deviceId }));
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(String(evt.data)) as { type: string; data?: string; message?: string };
        if (msg.type === "output" && msg.data) {
          write(msg.data.replace(/\n/g, "\r\n"));
        }
      } catch {
      }
    };

    ws.onclose = () => {
      setStatus("Disconnected");
    };

    const onDataDispose = term.onData((data) => {
      if (data === "\r") {
        const toSend = lineBuf;
        lineBuf = "";
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ type: "input", line: toSend }));
          } catch {
          }
        }
        return;
      }

      if (data === "\u007f") {
        if (lineBuf.length > 0) {
          lineBuf = lineBuf.slice(0, -1);
          term.write("\b \b");
        }
        return;
      }

      if (data >= " " && data <= "~") {
        lineBuf += data;
        term.write(data);
      }
    });

    return () => {
      onDataDispose.dispose();
      ws.close();
      wsRef.current = null;
    };
  }, [deviceId]);

  return (
    <div className="netsim-panel" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          padding: "12px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        <div style={{ fontSize: 14, opacity: 0.9 }}>{title}</div>
        <div style={{ fontSize: 12, opacity: 0.65 }}>{status}</div>
      </div>
      <div style={{ flex: 1, padding: 10 }}>
        <div ref={containerRef} style={{ height: "100%" }} />
      </div>
    </div>
  );
}
