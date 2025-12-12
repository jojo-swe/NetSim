import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  addEdge,
  Background,
  Connection,
  Controls,
  Edge,
  EdgeChange,
  MiniMap,
  Node,
  OnConnect,
  ReactFlowProvider,
  useEdgesState,
  useNodesState
} from "reactflow";
import "reactflow/dist/style.css";

import { TerminalPanel } from "./TerminalPanel";

type DeviceNodeData = {
  label: string;
  deviceId: string;
};

type LabDefinition = {
  id: string;
  title: string;
  description: string;
};

type ObjectiveResult = {
  id: string;
  title: string;
  passed: boolean;
  hint?: string;
  details?: string;
};

type LabValidationResult = {
  labId: string;
  passed: boolean;
  score: number;
  objectives: ObjectiveResult[];
};

const initialNodes: Node<DeviceNodeData>[] = [];
const initialEdges: Edge[] = [];

function getApiOrigin(): string {
  return (import.meta as any).env?.VITE_API_ORIGIN ?? "http://localhost:3001";
}

function nextCounterFromIds(ids: string[], re: RegExp): number {
  let max = 0;
  for (const id of ids) {
    const m = id.match(re);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return max + 1;
}

export default function App() {
  const apiOrigin = useMemo(() => getApiOrigin(), []);
  const routerCounterRef = useRef<number>(1);
  const switchCounterRef = useRef<number>(1);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<DeviceNodeData>(initialNodes);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState(initialEdges);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const [labs, setLabs] = useState<LabDefinition[]>([]);
  const [selectedLabId, setSelectedLabId] = useState<string>("ccna-001");
  const [validation, setValidation] = useState<LabValidationResult | null>(null);
  const [validating, setValidating] = useState<boolean>(false);

  useEffect(() => {
    void (async () => {
      try {
        const resp = await fetch(`${apiOrigin}/api/labs`);
        const json = (await resp.json()) as { labs?: LabDefinition[] };
        const loaded = Array.isArray(json.labs) ? json.labs : [];
        setLabs(loaded);
        if (loaded.length > 0) {
          setSelectedLabId((prev) => (loaded.some((l) => l.id === prev) ? prev : loaded[0].id));
        }
      } catch {
      }
    })();
  }, [apiOrigin]);

  const deleteLink = useCallback(
    async (linkId: string) => {
      try {
        await fetch(`${apiOrigin}/api/links/${encodeURIComponent(linkId)}`, {
          method: "DELETE"
        });
      } catch {
      }
    },
    [apiOrigin]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      for (const change of changes) {
        if (change.type === "remove") {
          void deleteLink(change.id);
        }
      }
      onEdgesChangeBase(changes);
    },
    [deleteLink, onEdgesChangeBase]
  );

  const createLink = useCallback(
    async (sourceId: string, targetId: string) => {
      const resp = await fetch(`${apiOrigin}/api/links`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ a: { deviceId: sourceId }, b: { deviceId: targetId } })
      });

      const json = (await resp.json()) as {
        link?: { id: string; a: { interfaceName: string }; b: { interfaceName: string } };
        error?: string;
      };

      if (!resp.ok || !json.link) {
        throw new Error(json.error ?? "Failed to create link");
      }

      return json.link;
    },
    [apiOrigin]
  );

  const onConnect: OnConnect = useCallback(
    (params: Edge | Connection) => {
      const sourceId = (params as Connection).source;
      const targetId = (params as Connection).target;
      if (!sourceId || !targetId) return;

      void (async () => {
        try {
          const link = await createLink(sourceId, targetId);
          const edge: Edge = {
            id: link.id,
            source: sourceId,
            target: targetId,
            label: `${sourceId} ${link.a.interfaceName} ↔ ${targetId} ${link.b.interfaceName}`
          };
          setEdges((eds: Edge[]) => [...eds, edge]);
        } catch {
          setEdges((eds: Edge[]) => addEdge(params, eds));
        }
      })();
    },
    [createLink, setEdges]
  );

  const createDevice = useCallback(
    async (deviceId: string, type: "router" | "switch") => {
      try {
        await fetch(`${apiOrigin}/api/devices`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ id: deviceId, type })
        });
      } catch {
      }
    },
    [apiOrigin]
  );

  const validateSelectedLab = useCallback(async () => {
    setValidating(true);
    try {
      const resp = await fetch(`${apiOrigin}/api/labs/${encodeURIComponent(selectedLabId)}/validate`, {
        method: "POST"
      });
      const json = (await resp.json()) as { result?: LabValidationResult };
      if (resp.ok && json.result) {
        setValidation(json.result);
      } else {
        setValidation(null);
      }
    } catch {
      setValidation(null);
    } finally {
      setValidating(false);
    }
  }, [apiOrigin, selectedLabId]);

  const addRouter = useCallback(() => {
    const deviceId = `R${routerCounterRef.current++}`;
    void createDevice(deviceId, "router");
    const node: Node<DeviceNodeData> = {
      id: deviceId,
      type: "default",
      position: { x: 100 + Math.random() * 300, y: 100 + Math.random() * 200 },
      data: { label: `Router ${deviceId}`, deviceId }
    };
    setNodes((prev: Node<DeviceNodeData>[]) => [...prev, node]);
  }, [createDevice, setNodes]);

  const addSwitch = useCallback(() => {
    const deviceId = `SW${switchCounterRef.current++}`;
    void createDevice(deviceId, "switch");
    const node: Node<DeviceNodeData> = {
      id: deviceId,
      type: "default",
      position: { x: 100 + Math.random() * 300, y: 100 + Math.random() * 200 },
      data: { label: `Switch ${deviceId}`, deviceId }
    };
    setNodes((prev: Node<DeviceNodeData>[]) => [...prev, node]);
  }, [createDevice, setNodes]);

  const resetLab = useCallback(async () => {
    routerCounterRef.current = 1;
    switchCounterRef.current = 1;
    setSelectedDeviceId(null);
    setValidation(null);
    setNodes([]);
    setEdges([]);
    try {
      await fetch(`${apiOrigin}/api/world/reset`, { method: "POST" });
    } catch {
    }
  }, [apiOrigin, setEdges, setNodes]);

  const saveLabToFile = useCallback(async () => {
    try {
      const resp = await fetch(`${apiOrigin}/api/world/snapshot`);
      const json = (await resp.json()) as { snapshot: unknown };

      const labFile = {
        version: 1,
        createdAt: new Date().toISOString(),
        topology: {
          nodes,
          edges
        },
        snapshot: json.snapshot
      };

      const blob = new Blob([JSON.stringify(labFile, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `netsim-lab-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
    }
  }, [apiOrigin, edges, nodes]);

  const loadLabFromFile = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as {
          version?: number;
          topology?: { nodes?: Node<DeviceNodeData>[]; edges?: Edge[] };
          snapshot?: unknown;
        };

        const loadedNodes = parsed.topology?.nodes ?? [];
        const loadedEdges = parsed.topology?.edges ?? [];

        setSelectedDeviceId(null);
        setValidation(null);
        setNodes(loadedNodes);

        const ids = loadedNodes.map((n) => n.id);
        routerCounterRef.current = nextCounterFromIds(ids, /^R(\d+)$/);
        switchCounterRef.current = nextCounterFromIds(ids, /^SW(\d+)$/);

        if (parsed.snapshot) {
          await fetch(`${apiOrigin}/api/world/snapshot`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ snapshot: parsed.snapshot })
          });

          const linksResp = await fetch(`${apiOrigin}/api/links`);
          const linksJson = (await linksResp.json()) as {
            links?: Array<{ id: string; a: { deviceId: string; interfaceName: string }; b: { deviceId: string; interfaceName: string } }>;
          };

          const newEdges: Edge[] = (linksJson.links ?? []).map((l) => ({
            id: l.id,
            source: l.a.deviceId,
            target: l.b.deviceId,
            label: `${l.a.deviceId} ${l.a.interfaceName} ↔ ${l.b.deviceId} ${l.b.interfaceName}`
          }));

          setEdges(newEdges);
          return;
        }

        const rebuilt: Edge[] = [];
        for (const e of loadedEdges) {
          const sourceId = (e as any).source as string | undefined;
          const targetId = (e as any).target as string | undefined;
          if (!sourceId || !targetId) continue;
          try {
            const link = await createLink(sourceId, targetId);
            rebuilt.push({
              id: link.id,
              source: sourceId,
              target: targetId,
              label: `${sourceId} ${link.a.interfaceName} ↔ ${targetId} ${link.b.interfaceName}`
            });
          } catch {
          }
        }

        setEdges(rebuilt.length > 0 ? rebuilt : loadedEdges);
      } catch {
      }
    },
    [apiOrigin, createLink, setEdges, setNodes]
  );

  const nodeTypes = useMemo(() => ({}), []);

  return (
    <ReactFlowProvider>
      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr 520px", height: "100%" }}>
        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="netsim-panel" style={{ padding: 14 }}>
            <div style={{ fontSize: 14, opacity: 0.9, marginBottom: 10 }}>Device palette</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="netsim-btn" onClick={addRouter}>
                Add router
              </button>
              <button className="netsim-btn" onClick={addSwitch}>
                Add switch
              </button>
            </div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 10 }}>
              Tip: click a node to open its CLI.
            </div>
          </div>

          <div className="netsim-panel" style={{ padding: 14 }}>
            <div style={{ fontSize: 14, opacity: 0.9, marginBottom: 8 }}>Lab</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="netsim-btn" onClick={saveLabToFile}>
                Save lab
              </button>
              <button
                className="netsim-btn"
                onClick={() => {
                  fileInputRef.current?.click();
                }}
              >
                Load lab
              </button>
              <button className="netsim-btn" onClick={resetLab}>
                Reset
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  void loadLabFromFile(f);
                  e.target.value = "";
                }}
              />
            </div>
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <select
                  value={selectedLabId}
                  onChange={(e) => {
                    setSelectedLabId(e.target.value);
                    setValidation(null);
                  }}
                  style={{
                    flex: 1,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#e5e7eb",
                    borderRadius: 10,
                    padding: "10px 10px"
                  }}
                >
                  {(labs.length ? labs : [{ id: "ccna-001", title: "CCNA 001", description: "" }]).map((lab) => (
                    <option key={lab.id} value={lab.id}>
                      {lab.title}
                    </option>
                  ))}
                </select>
                <button className="netsim-btn" onClick={validateSelectedLab} disabled={validating}>
                  {validating ? "Validating..." : "Validate"}
                </button>
              </div>

              {validation && (
                <div style={{ fontSize: 12, opacity: 0.85 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <div>
                      Score: <span style={{ fontWeight: 600 }}>{validation.score}%</span>
                    </div>
                    <div style={{ color: validation.passed ? "#34d399" : "#f87171" }}>
                      {validation.passed ? "PASS" : "FAIL"}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {validation.objectives.map((obj) => (
                      <div
                        key={obj.id}
                        style={{
                          padding: 10,
                          borderRadius: 10,
                          border: "1px solid rgba(255,255,255,0.08)",
                          background: obj.passed ? "rgba(16,185,129,0.08)" : "rgba(248,113,113,0.08)"
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <div style={{ fontWeight: 600 }}>{obj.title}</div>
                          <div style={{ opacity: 0.9 }}>{obj.passed ? "OK" : "NO"}</div>
                        </div>
                        {!obj.passed && (obj.hint || obj.details) && (
                          <div style={{ marginTop: 6, opacity: 0.9 }}>
                            {obj.details ? <div>Reason: {obj.details}</div> : null}
                            {obj.hint ? <div>Hint: {obj.hint}</div> : null}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ height: "100%" }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            onNodeClick={(_, node) => setSelectedDeviceId(node.id)}
            fitView
          >
            <Background />
            <MiniMap />
            <Controls />
          </ReactFlow>
        </div>

        <div style={{ padding: 14 }}>
          <TerminalPanel deviceId={selectedDeviceId} />
        </div>
      </div>
    </ReactFlowProvider>
  );
}
