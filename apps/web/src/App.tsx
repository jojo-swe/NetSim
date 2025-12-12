import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  addEdge,
  Connection,
  Controls,
  Edge,
  EdgeChange,
  MiniMap,
  Node,
  OnConnect,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  Background
} from "reactflow";
import "reactflow/dist/style.css";
import "./styles.css";

import DeviceNode from "./DeviceNode";
import { FloatingTerminal } from "./FloatingTerminal";
import { DevicePalette } from "./DevicePalette";
import { LabControls } from "./LabControls";

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

  const [nodes, setNodes, onNodesChange] = useNodesState<DeviceNodeData>(initialNodes);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState(initialEdges);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const [labs, setLabs] = useState<LabDefinition[]>([]);
  const [selectedLabId, setSelectedLabId] = useState<string>("ccna-001");
  const [validation, setValidation] = useState<LabValidationResult | null>(null);
  const [validating, setValidating] = useState<boolean>(false);

  // Load Labs
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
      } catch {}
    })();
  }, [apiOrigin]);

  // Link Management
  const deleteLink = useCallback(
    async (linkId: string) => {
      try {
        await fetch(`${apiOrigin}/api/links/${encodeURIComponent(linkId)}`, {
          method: "DELETE"
        });
      } catch {}
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
        headers: { "Content-Type": "application/json" },
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
            label: `${sourceId} ${link.a.interfaceName} ↔ ${targetId} ${link.b.interfaceName}`,
            style: { strokeWidth: 2 }
          };
          setEdges((eds: Edge[]) => [...eds, edge]);
        } catch {
          setEdges((eds: Edge[]) => addEdge(params, eds));
        }
      })();
    },
    [createLink, setEdges]
  );

  // Device Creation
  const createDevice = useCallback(
    async (deviceId: string, type: "router" | "switch") => {
      try {
        await fetch(`${apiOrigin}/api/devices`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: deviceId, type })
        });
      } catch {}
    },
    [apiOrigin]
  );

  const addRouter = useCallback(() => {
    const deviceId = `R${routerCounterRef.current++}`;
    void createDevice(deviceId, "router");
    const node: Node<DeviceNodeData> = {
      id: deviceId,
      type: "device", // Custom Node Type
      position: { x: 100 + Math.random() * 300, y: 100 + Math.random() * 200 },
      data: { label: `Router ${deviceId}`, deviceId }
    };
    setNodes((prev) => [...prev, node]);
  }, [createDevice, setNodes]);

  const addSwitch = useCallback(() => {
    const deviceId = `SW${switchCounterRef.current++}`;
    void createDevice(deviceId, "switch");
    const node: Node<DeviceNodeData> = {
      id: deviceId,
      type: "device",
      position: { x: 100 + Math.random() * 300, y: 100 + Math.random() * 200 },
      data: { label: `Switch ${deviceId}`, deviceId }
    };
    setNodes((prev) => [...prev, node]);
  }, [createDevice, setNodes]);

  // Lab Actions
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

  const resetLab = useCallback(async () => {
    routerCounterRef.current = 1;
    switchCounterRef.current = 1;
    setSelectedDeviceId(null);
    setValidation(null);
    setNodes([]);
    setEdges([]);
    try {
      await fetch(`${apiOrigin}/api/world/reset`, { method: "POST" });
    } catch {}
  }, [apiOrigin, setEdges, setNodes]);

  const saveLabToFile = useCallback(async () => {
    try {
      const resp = await fetch(`${apiOrigin}/api/world/snapshot`);
      const json = (await resp.json()) as { snapshot: unknown };

      const labFile = {
        version: 1,
        createdAt: new Date().toISOString(),
        topology: { nodes, edges },
        snapshot: json.snapshot
      };

      const blob = new Blob([JSON.stringify(labFile, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `netsim-lab-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
  }, [apiOrigin, edges, nodes]);

  const loadLabFromFile = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as any;

        const loadedNodes: Node[] = parsed.topology?.nodes ?? [];
        const loadedEdges: Edge[] = parsed.topology?.edges ?? [];

        setSelectedDeviceId(null);
        setValidation(null);
        setNodes(loadedNodes);
        setEdges([]);

        const ids = loadedNodes.map((n) => n.id);
        routerCounterRef.current = nextCounterFromIds(ids, /^R(\d+)$/);
        switchCounterRef.current = nextCounterFromIds(ids, /^SW(\d+)$/);

        // Reset backend first
        await fetch(`${apiOrigin}/api/world/reset`, { method: "POST" }).catch(() => {});

        // Re-create devices in backend
        for (const n of loadedNodes) {
          const label = (n as any)?.data?.label as string | undefined;
          const isSwitch = n.id.toUpperCase().startsWith("SW") || Boolean(label?.toLowerCase().includes("switch"));
          // Also check type if previously saved with 'device' type
          await createDevice(n.id, isSwitch ? "switch" : "router");
        }

        // Snapshot restore if available
        if (parsed.snapshot) {
          await fetch(`${apiOrigin}/api/world/snapshot`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ snapshot: parsed.snapshot })
          });
        }

        // Re-create links
        // If snapshot was restored, backend has the links, we just fetch them.
        // If not, we might need to manually create them (original code did createLink loop if no snapshot)
        // Original code logic: if snapshot, fetch links. Else reset, loop devices, loop edges, createLink.
        // Simplified here to match original flow more or less.
        
        if (!parsed.snapshot) {
            for (const e of loadedEdges) {
                const sourceId = (e as any).source;
                const targetId = (e as any).target;
                if (!sourceId || !targetId) continue;
                await createLink(sourceId, targetId).catch(() => {});
            }
        }

        // Sync edges from backend to be sure
        const linksResp = await fetch(`${apiOrigin}/api/links`);
        const linksJson = (await linksResp.json()) as any;
        const newEdges: Edge[] = (linksJson.links ?? []).map((l: any) => ({
            id: l.id,
            source: l.a.deviceId,
            target: l.b.deviceId,
            label: `${l.a.deviceId} ${l.a.interfaceName} ↔ ${l.b.deviceId} ${l.b.interfaceName}`,
            style: { strokeWidth: 2 }
        }));
        setEdges(newEdges);

      } catch {}
    },
    [apiOrigin, createDevice, createLink, setEdges, setNodes]
  );

  // Define Node Types
  const nodeTypes = useMemo(() => ({
    device: DeviceNode,
    // fallback for old saves if they used 'default'
    default: DeviceNode 
  }), []);

  return (
    <ReactFlowProvider>
      <div style={{ width: "100%", height: "100%", position: "relative", background: "var(--bg-app)" }}>
        
        {/* Fullscreen Canvas */}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          onNodeClick={(_, node) => setSelectedDeviceId(node.id)}
          fitView
          className="react-flow-dark"
        >
          <Background gap={24} size={1} />
          <Controls showInteractive={false} />
          <MiniMap 
            nodeStrokeColor={(n) => {
              if (n.type === 'input') return '#0041d0';
              if (n.type === 'output') return '#ff0072';
              if (n.type === 'default') return '#1a192b';
              return '#eee';
            }}
            nodeColor={(n) => {
              if (n.style?.background) return n.style.background as string;
              return '#1a192b';
            }}
            maskColor="rgba(0, 0, 0, 0.4)"
          />
        </ReactFlow>

        {/* Floating Components */}
        <DevicePalette 
            onAddRouter={addRouter} 
            onAddSwitch={addSwitch} 
        />
        
        <div style={{ position: "absolute", top: 20, right: 20, zIndex: 50 }}>
            <LabControls 
                labs={labs}
                selectedLabId={selectedLabId}
                onSelectLab={setSelectedLabId}
                onValidate={validateSelectedLab}
                validating={validating}
                onSave={saveLabToFile}
                onLoad={loadLabFromFile}
                onReset={resetLab}
                validationResult={validation}
            />
        </div>

        <FloatingTerminal 
            deviceId={selectedDeviceId} 
            onClose={() => setSelectedDeviceId(null)} 
        />
        
        {/* Overlay for small screens or credits if needed */}
        <div style={{ 
            position: "absolute", 
            bottom: 10, 
            left: 20, 
            color: "var(--text-muted)", 
            fontSize: 10, 
            opacity: 0.5 
        }}>
            NetSim v0.1.0-alpha
        </div>
      </div>
    </ReactFlowProvider>
  );
}
