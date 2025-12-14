import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type DeviceType = "router" | "switch" | "host" | "pc" | "l3switch" | "firewall" | "server" | "cloud";

type PortKind = "rj45" | "sfp";

type CableType = "auto" | "copper_straight" | "copper_crossover" | "fiber";

type DevicePort = {
  name: string;
  kind: PortKind;
};

function rangePorts(prefix: string, start: number, count: number, kind: PortKind): DevicePort[] {
  const ports: DevicePort[] = [];
  for (let i = start; i < start + count; i++) {
    ports.push({ name: `${prefix}${i}`, kind });
  }
  return ports;
}

function devicePorts(type: DeviceType): DevicePort[] {
  switch (type) {
    case "switch":
      return [...rangePorts("GigabitEthernet0/", 0, 48, "rj45"), ...rangePorts("GigabitEthernet0/", 48, 4, "sfp")];
    case "l3switch":
      return [...rangePorts("GigabitEthernet0/", 0, 48, "rj45"), ...rangePorts("GigabitEthernet0/", 48, 4, "sfp")];
    case "router":
      return [...rangePorts("GigabitEthernet0/", 0, 4, "rj45"), ...rangePorts("GigabitEthernet0/", 4, 2, "sfp")];
    case "firewall":
      return [...rangePorts("GigabitEthernet0/", 0, 4, "rj45"), ...rangePorts("GigabitEthernet0/", 4, 2, "sfp")];
    case "server":
      return [...rangePorts("GigabitEthernet0/", 0, 2, "rj45")];
    case "host":
      return [...rangePorts("GigabitEthernet0/", 0, 1, "rj45")];
    case "pc":
      return [...rangePorts("GigabitEthernet0/", 0, 1, "rj45")];
    case "cloud":
      return [...rangePorts("GigabitEthernet0/", 0, 8, "rj45"), ...rangePorts("GigabitEthernet0/", 8, 2, "sfp")];
  }
}

function deviceIsMdix(type: DeviceType): boolean {
  return type === "switch" || type === "l3switch";
}

function cableTypeLabel(cableType: string | undefined): string {
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

function cableTypeSuffix(cableType: string | undefined): string {
  if (!cableType) return "";
  return ` [${cableTypeLabel(cableType)}]`;
}

function edgeStyleForCableType(cableType: string | undefined): CSSProperties {
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
  const l3switchCounterRef = useRef<number>(1);
  const firewallCounterRef = useRef<number>(1);
  const serverCounterRef = useRef<number>(1);
  const cloudCounterRef = useRef<number>(1);
  const pcCounterRef = useRef<number>(1);
  const hostCounterRef = useRef<number>(1);

  const [nodes, setNodes, onNodesChange] = useNodesState<DeviceNodeData>(initialNodes);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState(initialEdges);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [showPortsPanel, setShowPortsPanel] = useState<boolean>(true);
  const [portsPanelSide, setPortsPanelSide] = useState<"front" | "back">("back");
  const [armedPort, setArmedPort] = useState<null | { deviceId: string; interfaceName: string }>(null);
  const [devicesById, setDevicesById] = useState<Record<string, any>>({});

  const [linkWizard, setLinkWizard] = useState<null | {
    sourceId: string;
    targetId: string;
    sourceIf: string;
    targetIf: string;
    cableType: CableType;
    cableTypeLocked?: boolean;
    error?: string;
  }>(null);

  const [showDeviceLabels, setShowDeviceLabels] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem("netsim.showDeviceLabels");
      if (v === null) return true;
      return v === "true";
    } catch {
      return true;
    }
  });

  const [showLinkLabels, setShowLinkLabels] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem("netsim.showLinkLabels");
      if (v === null) return true;
      return v === "true";
    } catch {
      return true;
    }
  });

  const [labs, setLabs] = useState<LabDefinition[]>([]);
  const [selectedLabId, setSelectedLabId] = useState<string>("ccna-001");
  const [validation, setValidation] = useState<LabValidationResult | null>(null);
  const [validating, setValidating] = useState<boolean>(false);

  useEffect(() => {
    if (selectedDeviceId) setShowPortsPanel(true);
  }, [selectedDeviceId]);

  useEffect(() => {
    // If the selection changes, any "armed" port should be cleared to avoid accidental links.
    if (armedPort && selectedDeviceId !== armedPort.deviceId) {
      setArmedPort(null);
    }
  }, [armedPort, selectedDeviceId]);

  const refreshDevices = useCallback(async () => {
    try {
      const resp = await fetch(`${apiOrigin}/api/devices`);
      const json = (await resp.json()) as { devices?: any[] };
      const list = Array.isArray(json.devices) ? json.devices : [];
      const next: Record<string, any> = {};
      for (const d of list) {
        const id = typeof d?.id === "string" ? d.id : "";
        if (!id) continue;
        next[id] = d;
      }
      setDevicesById(next);
    } catch {}
  }, [apiOrigin]);

  useEffect(() => {
    if (!selectedDeviceId) return;
    void refreshDevices();
  }, [refreshDevices, selectedDeviceId]);

  const defaultAdminUpFor = useCallback((type: DeviceType): boolean => {
    if (type === "router") return false;
    if (type === "firewall") return false;
    return true;
  }, []);

  const setInterfaceAdminUp = useCallback(
    async (deviceId: string, interfaceName: string, adminUp: boolean) => {
      await fetch(`${apiOrigin}/api/devices/${encodeURIComponent(deviceId)}/interface`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interfaceName, adminUp })
      });
    },
    [apiOrigin]
  );

  useEffect(() => {
    try {
      localStorage.setItem("netsim.showDeviceLabels", String(showDeviceLabels));
    } catch {}
  }, [showDeviceLabels]);

  useEffect(() => {
    try {
      localStorage.setItem("netsim.showLinkLabels", String(showLinkLabels));
    } catch {}
  }, [showLinkLabels]);

  const toggleDeviceLabels = useCallback(() => {
    setShowDeviceLabels((v) => !v);
  }, []);

  const toggleLinkLabels = useCallback(() => {
    setShowLinkLabels((v) => !v);
  }, []);

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

  const inferDeviceType = useCallback(
    (deviceId: string): DeviceType => {
      const n = nodes.find((x) => x.id === deviceId) as any;
      const label = (n?.data?.label as string | undefined) ?? "";
      const upperId = deviceId.toUpperCase();
      const lowerLabel = label.toLowerCase();

      if (upperId.startsWith("L3SW") || (lowerLabel.includes("l3") && lowerLabel.includes("switch"))) return "l3switch";
      if (upperId.startsWith("SW") || lowerLabel.includes("switch")) return "switch";
      if (upperId.startsWith("FW") || lowerLabel.includes("firewall")) return "firewall";
      if (upperId.startsWith("SRV") || lowerLabel.includes("server")) return "server";
      if (upperId.startsWith("CLOUD") || lowerLabel.includes("cloud") || lowerLabel.includes("internet")) return "cloud";
      if (upperId.startsWith("PC") || lowerLabel.includes("pc") || lowerLabel.includes("linux")) return "pc";
      if (upperId.startsWith("H") || lowerLabel.includes("host")) return "host";
      return "router";
    },
    [nodes]
  );

  const usedPorts = useCallback(
    (deviceId: string): Set<string> => {
      const used = new Set<string>();
      for (const e of edges as any[]) {
        const d = e?.data;
        if (d?.a?.deviceId === deviceId && typeof d?.a?.interfaceName === "string") used.add(d.a.interfaceName);
        if (d?.b?.deviceId === deviceId && typeof d?.b?.interfaceName === "string") used.add(d.b.interfaceName);
      }
      return used;
    },
    [edges]
  );

  const findPortPeer = useCallback(
    (deviceId: string, interfaceName: string): { peerDeviceId: string; peerInterfaceName: string } | null => {
      if (!interfaceName) return null;
      for (const e of edges as any[]) {
        const d = e?.data;
        if (
          d?.a?.deviceId === deviceId &&
          d?.a?.interfaceName === interfaceName &&
          typeof d?.b?.deviceId === "string" &&
          typeof d?.b?.interfaceName === "string"
        ) {
          return { peerDeviceId: d.b.deviceId, peerInterfaceName: d.b.interfaceName };
        }
        if (
          d?.b?.deviceId === deviceId &&
          d?.b?.interfaceName === interfaceName &&
          typeof d?.a?.deviceId === "string" &&
          typeof d?.a?.interfaceName === "string"
        ) {
          return { peerDeviceId: d.a.deviceId, peerInterfaceName: d.a.interfaceName };
        }
      }
      return null;
    },
    [edges]
  );

  const findPortLinkInfo = useCallback(
    (
      deviceId: string,
      interfaceName: string
    ): { peerDeviceId: string; peerInterfaceName: string; cableType?: string } | null => {
      if (!interfaceName) return null;
      for (const e of edges as any[]) {
        const d = e?.data;
        const cableType = typeof d?.cableType === "string" ? d.cableType : undefined;

        if (
          d?.a?.deviceId === deviceId &&
          d?.a?.interfaceName === interfaceName &&
          typeof d?.b?.deviceId === "string" &&
          typeof d?.b?.interfaceName === "string"
        ) {
          return { peerDeviceId: d.b.deviceId, peerInterfaceName: d.b.interfaceName, cableType };
        }

        if (
          d?.b?.deviceId === deviceId &&
          d?.b?.interfaceName === interfaceName &&
          typeof d?.a?.deviceId === "string" &&
          typeof d?.a?.interfaceName === "string"
        ) {
          return { peerDeviceId: d.a.deviceId, peerInterfaceName: d.a.interfaceName, cableType };
        }
      }
      return null;
    },
    [edges]
  );

  const portsPanelUi = useMemo(() => {
    if (!selectedDeviceId) return null;
    if (!showPortsPanel) return null;

    const selectedType = inferDeviceType(selectedDeviceId);
    const ports = devicePorts(selectedType);

    const selectedDevice = devicesById[selectedDeviceId];
    const selectedIfaces = selectedDevice?.config?.interfaces;

    const items = ports.map((p) => {
      const link = findPortLinkInfo(selectedDeviceId, p.name);
      const selectedIface = selectedIfaces?.[p.name];
      const adminUp = typeof selectedIface?.adminUp === "boolean" ? selectedIface.adminUp : defaultAdminUpFor(selectedType);

      let peerAdminUp: boolean | null = null;
      if (link) {
        const peerDevice = devicesById[link.peerDeviceId];
        const peerIface = peerDevice?.config?.interfaces?.[link.peerInterfaceName];
        peerAdminUp = typeof peerIface?.adminUp === "boolean" ? peerIface.adminUp : null;
      }

      const connected = Boolean(link);
      const operUp = connected && adminUp && (peerAdminUp === null ? true : peerAdminUp);

      const isArmed = Boolean(armedPort && armedPort.deviceId === selectedDeviceId && armedPort.interfaceName === p.name);

      return {
        name: p.name,
        kind: p.kind,
        connected,
        adminUp,
        operUp,
        isArmed,
        peer: link ? `${link.peerDeviceId} ${link.peerInterfaceName}` : "",
        cableType: link?.cableType
      };
    });

    return { selectedType, items };
  }, [armedPort, defaultAdminUpFor, devicesById, findPortLinkInfo, inferDeviceType, selectedDeviceId, showPortsPanel]);

  const availablePorts = useCallback(
    (deviceId: string): DevicePort[] => {
      const t = inferDeviceType(deviceId);
      const ports = devicePorts(t);
      const used = usedPorts(deviceId);
      return ports.filter((p) => !used.has(p.name));
    },
    [inferDeviceType, usedPorts]
  );

  const firstFreePort = useCallback(
    (deviceId: string): string | null => {
      return availablePorts(deviceId)[0]?.name ?? null;
    },
    [availablePorts]
  );

  const portKindForInterface = useCallback(
    (deviceId: string, interfaceName: string): PortKind | null => {
      if (!interfaceName) return null;
      const t = inferDeviceType(deviceId);
      return devicePorts(t).find((p) => p.name === interfaceName)?.kind ?? null;
    },
    [inferDeviceType]
  );

  const suggestCableType = useCallback(
    (sourceId: string, sourceIf: string, targetId: string, targetIf: string): CableType => {
      const srcKind = portKindForInterface(sourceId, sourceIf);
      const dstKind = portKindForInterface(targetId, targetIf);
      if (!srcKind || !dstKind) return "auto";

      if (srcKind === "sfp" && dstKind === "sfp") return "fiber";

      if (srcKind === "rj45" && dstKind === "rj45") {
        const srcType = inferDeviceType(sourceId);
        const dstType = inferDeviceType(targetId);
        const sameRole = deviceIsMdix(srcType) === deviceIsMdix(dstType);
        return sameRole ? "copper_crossover" : "copper_straight";
      }

      return "auto";
    },
    [inferDeviceType, portKindForInterface]
  );

  const createLink = useCallback(
    async (
      sourceId: string,
      targetId: string,
      opts?: { sourceIf?: string; targetIf?: string; cableType?: CableType }
    ) => {
      const body: any = { a: { deviceId: sourceId }, b: { deviceId: targetId } };
      if (opts?.sourceIf) body.a.interfaceName = opts.sourceIf;
      if (opts?.targetIf) body.b.interfaceName = opts.targetIf;
      if (opts?.cableType) body.cableType = opts.cableType;

      const resp = await fetch(`${apiOrigin}/api/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const json = (await resp.json()) as {
        link?: {
          id: string;
          a: { deviceId: string; interfaceName: string };
          b: { deviceId: string; interfaceName: string };
          cableType?: string;
        };
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

      const sourceIf = firstFreePort(sourceId) ?? "";
      const targetIf = firstFreePort(targetId) ?? "";
      const errors: string[] = [];
      if (!sourceIf) errors.push(`${sourceId} has no free ports`);
      if (!targetIf) errors.push(`${targetId} has no free ports`);

      const cableType = sourceIf && targetIf ? suggestCableType(sourceId, sourceIf, targetId, targetIf) : "auto";

      setLinkWizard({
        sourceId,
        targetId,
        sourceIf,
        targetIf,
        cableType,
        cableTypeLocked: false,
        ...(errors.length > 0 ? { error: errors.join(". ") } : {})
      });
    },
    [firstFreePort, setLinkWizard, suggestCableType]
  );

  const linkWizardUi = useMemo(() => {
    if (!linkWizard) return null;

    const srcAvail = availablePorts(linkWizard.sourceId);
    const dstAvail = availablePorts(linkWizard.targetId);
    const srcSelectedFree = linkWizard.sourceIf !== "" && srcAvail.some((p) => p.name === linkWizard.sourceIf);
    const dstSelectedFree = linkWizard.targetIf !== "" && dstAvail.some((p) => p.name === linkWizard.targetIf);

    const derivedErrors: string[] = [];
    if (srcAvail.length === 0) derivedErrors.push(`${linkWizard.sourceId} has no free ports`);
    if (dstAvail.length === 0) derivedErrors.push(`${linkWizard.targetId} has no free ports`);
    if (srcAvail.length > 0 && linkWizard.sourceIf !== "" && !srcSelectedFree) {
      const peer = findPortPeer(linkWizard.sourceId, linkWizard.sourceIf);
      derivedErrors.push(
        peer
          ? `${linkWizard.sourceId} ${linkWizard.sourceIf} is already connected to ${peer.peerDeviceId} ${peer.peerInterfaceName}`
          : `${linkWizard.sourceId} port ${linkWizard.sourceIf} is already in use`
      );
    }
    if (dstAvail.length > 0 && linkWizard.targetIf !== "" && !dstSelectedFree) {
      const peer = findPortPeer(linkWizard.targetId, linkWizard.targetIf);
      derivedErrors.push(
        peer
          ? `${linkWizard.targetId} ${linkWizard.targetIf} is already connected to ${peer.peerDeviceId} ${peer.peerInterfaceName}`
          : `${linkWizard.targetId} port ${linkWizard.targetIf} is already in use`
      );
    }
    if (srcAvail.length > 0 && linkWizard.sourceIf === "") derivedErrors.push(`Select a port on ${linkWizard.sourceId}`);
    if (dstAvail.length > 0 && linkWizard.targetIf === "") derivedErrors.push(`Select a port on ${linkWizard.targetId}`);

    const derivedError = derivedErrors.length > 0 ? derivedErrors.join(". ") : undefined;
    const error = linkWizard.error ?? derivedError;

    const canCreate = !error && srcSelectedFree && dstSelectedFree;

    return {
      srcAvail,
      dstAvail,
      error,
      canCreate
    };
  }, [availablePorts, findPortPeer, linkWizard]);

  // Device Creation
  const createDevice = useCallback(
    async (deviceId: string, type: DeviceType) => {
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

  const addL3Switch = useCallback(() => {
    const deviceId = `L3SW${l3switchCounterRef.current++}`;
    void createDevice(deviceId, "l3switch");
    const node: Node<DeviceNodeData> = {
      id: deviceId,
      type: "device",
      position: { x: 100 + Math.random() * 300, y: 100 + Math.random() * 200 },
      data: { label: `L3 Switch ${deviceId}`, deviceId }
    };
    setNodes((prev) => [...prev, node]);
  }, [createDevice, setNodes]);

  const addFirewall = useCallback(() => {
    const deviceId = `FW${firewallCounterRef.current++}`;
    void createDevice(deviceId, "firewall");
    const node: Node<DeviceNodeData> = {
      id: deviceId,
      type: "device",
      position: { x: 100 + Math.random() * 300, y: 100 + Math.random() * 200 },
      data: { label: `Firewall ${deviceId}`, deviceId }
    };
    setNodes((prev) => [...prev, node]);
  }, [createDevice, setNodes]);

  const addServer = useCallback(() => {
    const deviceId = `SRV${serverCounterRef.current++}`;
    void createDevice(deviceId, "server");
    const node: Node<DeviceNodeData> = {
      id: deviceId,
      type: "device",
      position: { x: 100 + Math.random() * 300, y: 100 + Math.random() * 200 },
      data: { label: `Server ${deviceId}`, deviceId }
    };
    setNodes((prev) => [...prev, node]);
  }, [createDevice, setNodes]);

  const addCloud = useCallback(() => {
    const deviceId = `CLOUD${cloudCounterRef.current++}`;
    void createDevice(deviceId, "cloud");
    const node: Node<DeviceNodeData> = {
      id: deviceId,
      type: "device",
      position: { x: 100 + Math.random() * 300, y: 100 + Math.random() * 200 },
      data: { label: `Cloud ${deviceId}`, deviceId }
    };
    setNodes((prev) => [...prev, node]);
  }, [createDevice, setNodes]);

  const addPc = useCallback(() => {
    const deviceId = `PC${pcCounterRef.current++}`;
    void createDevice(deviceId, "pc");
    const node: Node<DeviceNodeData> = {
      id: deviceId,
      type: "device",
      position: { x: 100 + Math.random() * 300, y: 100 + Math.random() * 200 },
      data: { label: `PC ${deviceId}`, deviceId }
    };
    setNodes((prev) => [...prev, node]);
  }, [createDevice, setNodes]);

  const addHost = useCallback(() => {
    const deviceId = `H${hostCounterRef.current++}`;
    void createDevice(deviceId, "host");
    const node: Node<DeviceNodeData> = {
      id: deviceId,
      type: "device",
      position: { x: 100 + Math.random() * 300, y: 100 + Math.random() * 200 },
      data: { label: `Host ${deviceId}`, deviceId }
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
    l3switchCounterRef.current = 1;
    firewallCounterRef.current = 1;
    serverCounterRef.current = 1;
    cloudCounterRef.current = 1;
    pcCounterRef.current = 1;
    hostCounterRef.current = 1;
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
        l3switchCounterRef.current = nextCounterFromIds(ids, /^L3SW(\d+)$/);
        firewallCounterRef.current = nextCounterFromIds(ids, /^FW(\d+)$/);
        serverCounterRef.current = nextCounterFromIds(ids, /^SRV(\d+)$/);
        cloudCounterRef.current = nextCounterFromIds(ids, /^CLOUD(\d+)$/);
        pcCounterRef.current = nextCounterFromIds(ids, /^PC(\d+)$/);
        hostCounterRef.current = nextCounterFromIds(ids, /^H(\d+)$/);

        // Reset backend first
        await fetch(`${apiOrigin}/api/world/reset`, { method: "POST" }).catch(() => {});

        // Re-create devices in backend
        for (const n of loadedNodes) {
          const label = (n as any)?.data?.label as string | undefined;
          const upperId = n.id.toUpperCase();
          const lowerLabel = label?.toLowerCase() ?? "";

          let type: DeviceType = "router";
          if (upperId.startsWith("L3SW") || (lowerLabel.includes("l3") && lowerLabel.includes("switch"))) {
            type = "l3switch";
          } else if (upperId.startsWith("SW") || lowerLabel.includes("switch")) {
            type = "switch";
          } else if (upperId.startsWith("FW") || lowerLabel.includes("firewall")) {
            type = "firewall";
          } else if (upperId.startsWith("SRV") || lowerLabel.includes("server")) {
            type = "server";
          } else if (upperId.startsWith("CLOUD") || lowerLabel.includes("cloud") || lowerLabel.includes("internet")) {
            type = "cloud";
          } else if (upperId.startsWith("PC") || lowerLabel.includes("pc") || lowerLabel.includes("linux")) {
            type = "pc";
          } else if (upperId.startsWith("H") || lowerLabel.includes("host")) {
            type = "host";
          }

          await createDevice(n.id, type);
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

                const d = (e as any)?.data;
                const sourceIf = typeof d?.a?.interfaceName === "string" ? d.a.interfaceName : undefined;
                const targetIf = typeof d?.b?.interfaceName === "string" ? d.b.interfaceName : undefined;
                const cableType = typeof d?.cableType === "string" ? (d.cableType as CableType) : undefined;

                await createLink(sourceId, targetId, { sourceIf, targetIf, cableType }).catch(() => {});
            }
        }

        // Sync edges from backend to be sure
        const linksResp = await fetch(`${apiOrigin}/api/links`);
        const linksJson = (await linksResp.json()) as any;
        const newEdges: Edge[] = (linksJson.links ?? []).map((l: any) => ({
          id: l.id,
          source: l.a.deviceId,
          target: l.b.deviceId,
          label: `${l.a.deviceId} ${l.a.interfaceName} ↔ ${l.b.deviceId} ${l.b.interfaceName}${cableTypeSuffix(l.cableType)}`,
          data: { a: l.a, b: l.b, cableType: l.cableType },
          style: edgeStyleForCableType(l.cableType)
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
      <div
        className={`${showDeviceLabels ? "" : "hide-device-labels"} ${showLinkLabels ? "" : "hide-link-labels"}`.trim()}
        style={{ width: "100%", height: "100%", position: "relative", background: "var(--bg-app)" }}
      >
        
        {/* Fullscreen Canvas */}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          onNodeClick={(_, node) => {
            const clickedId = node.id;

            if (armedPort) {
              // If a port is armed, clicking another device starts a prefilled link wizard.
              if (clickedId !== armedPort.deviceId) {
                const sourceId = armedPort.deviceId;
                const targetId = clickedId;

                const targetIf = firstFreePort(targetId) ?? "";
                const sourceIf = armedPort.interfaceName;
                const errors: string[] = [];
                if (!sourceIf) errors.push(`${sourceId} has no free ports`);
                if (!targetIf) errors.push(`${targetId} has no free ports`);

                const cableType = sourceIf && targetIf ? suggestCableType(sourceId, sourceIf, targetId, targetIf) : "auto";

                setLinkWizard({
                  sourceId,
                  targetId,
                  sourceIf,
                  targetIf,
                  cableType,
                  cableTypeLocked: false,
                  ...(errors.length > 0 ? { error: errors.join(". ") } : {})
                });
              }

              setArmedPort(null);
              setSelectedDeviceId(clickedId);
              return;
            }

            setSelectedDeviceId(clickedId);
          }}
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
            onAddL3Switch={addL3Switch}
            onAddFirewall={addFirewall}
            onAddServer={addServer}
            onAddCloud={addCloud}
            onAddPc={addPc}
            onAddHost={addHost}
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
                showDeviceLabels={showDeviceLabels}
                showLinkLabels={showLinkLabels}
                onToggleDeviceLabels={toggleDeviceLabels}
                onToggleLinkLabels={toggleLinkLabels}
            />
        </div>

        <FloatingTerminal 
            deviceId={selectedDeviceId} 
            onClose={() => setSelectedDeviceId(null)} 
        />

        {portsPanelUi ? (
          <div
            className="glass-panel"
            style={{
              position: "absolute",
              top: 320,
              right: 20,
              width: 280,
              maxHeight: "calc(100vh - 360px)",
              overflow: "auto",
              padding: 12,
              zIndex: 55,
              display: "flex",
              flexDirection: "column",
              gap: 10
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>Ports</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                  {selectedDeviceId} ({portsPanelUi.selectedType})
                </div>
              </div>

              <div style={{ display: "flex", gap: 6 }}>
                <button
                  className="btn-icon"
                  style={{ padding: 6 }}
                  onClick={() => setPortsPanelSide((s) => (s === "back" ? "front" : "back"))}
                  title={portsPanelSide === "back" ? "Show summary" : "Show ports"}
                >
                  {portsPanelSide === "back" ? "⇄" : "⇄"}
                </button>
                <button
                  className="btn-icon"
                  style={{ padding: 6 }}
                  onClick={() => void refreshDevices()}
                  title="Refresh"
                >
                  ↻
                </button>
                <button
                  className="btn-icon"
                  style={{ padding: 6 }}
                  onClick={() => setShowPortsPanel(false)}
                  title="Close"
                >
                  ✕
                </button>
              </div>
            </div>

            {portsPanelSide === "front" ? (
              <div style={{ display: "grid", gap: 10 }}>
                <div
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid rgba(148, 163, 184, 0.14)",
                    background: "rgba(15, 23, 42, 0.35)",
                    display: "grid",
                    gap: 8
                  }}
                >
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Quick actions</div>
                  <div style={{ display: "grid", gap: 8 }}>
                    <button
                      className="btn-icon"
                      style={{ justifyContent: "flex-start", gap: 8, padding: 10 }}
                      onClick={() => setPortsPanelSide("back")}
                      title="Show ports"
                    >
                      Show ports
                    </button>
                    {armedPort ? (
                      <button
                        className="btn-icon"
                        style={{ justifyContent: "flex-start", gap: 8, padding: 10, borderColor: "rgba(251, 146, 60, 0.35)" }}
                        onClick={() => setArmedPort(null)}
                        title="Cancel link mode"
                      >
                        Cancel link mode ({armedPort.deviceId} {armedPort.interfaceName})
                      </button>
                    ) : null}
                  </div>
                </div>

                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  Tip: click a port on the back side to arm it, then click another device.
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {portsPanelUi.items.map((p) => {
                  const sid = selectedDeviceId;
                  if (!sid) return null;

                  const status = !p.connected ? "unused" : p.operUp ? "up" : "down";
                  const statusColor =
                    status === "up"
                      ? "rgba(34, 197, 94, 0.95)"
                      : status === "down"
                        ? "rgba(251, 146, 60, 0.95)"
                        : "rgba(148, 163, 184, 0.9)";

                  const borderColor = p.isArmed ? "rgba(251, 146, 60, 0.45)" : "rgba(148, 163, 184, 0.14)";
                  const bg = p.isArmed ? "rgba(251, 146, 60, 0.08)" : "rgba(15, 23, 42, 0.35)";

                  return (
                    <div
                      key={p.name}
                      style={{
                        padding: 10,
                        borderRadius: 10,
                        border: `1px solid ${borderColor}`,
                        background: bg,
                        display: "grid",
                        gap: 6,
                        cursor: p.connected ? "default" : "pointer"
                      }}
                      onClick={() => {
                        if (p.connected) return;
                        setArmedPort((prev) => {
                          if (prev && prev.deviceId === sid && prev.interfaceName === p.name) return null;
                          return { deviceId: sid, interfaceName: p.name };
                        });
                      }}
                      title={p.connected ? undefined : "Click to start link from this port"}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{p.name}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{p.kind.toUpperCase()}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ width: 8, height: 8, borderRadius: 99, background: statusColor }} />
                            <div style={{ fontSize: 11, color: statusColor, fontWeight: 700 }}>{status.toUpperCase()}</div>
                          </div>
                        </div>
                      </div>

                      {p.connected ? (
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                          {p.peer}
                          {p.cableType ? ` ${cableTypeSuffix(p.cableType)}` : ""}
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{p.isArmed ? "Link mode: click a target device" : "Not connected"}</div>
                      )}

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ fontSize: 10, color: "var(--text-muted)", opacity: 0.9 }}>Admin: {p.adminUp ? "up" : "down"}</div>

                        <button
                          className="btn-icon"
                          style={{ padding: "4px 8px" }}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void (async () => {
                              await setInterfaceAdminUp(sid, p.name, !p.adminUp).catch(() => {});
                              await refreshDevices();
                            })();
                          }}
                          title={p.adminUp ? "Shutdown" : "No shutdown"}
                        >
                          {p.adminUp ? "down" : "up"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        {linkWizard ? (
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
            onMouseDown={() => setLinkWizard(null)}
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
                  onClick={() => setLinkWizard(null)}
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
                    onClick={() => setLinkWizard(null)}
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
                      const srcType = (() => {
                        return inferDeviceType(linkWizard.sourceId);
                      })() as DeviceType;
                      const dstType = (() => {
                        return inferDeviceType(linkWizard.targetId);
                      })() as DeviceType;

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
                          setLinkWizard(null);
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
        ) : null}
        
        {/* Overlay for small screens or credits if needed */}
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
      </div>
    </ReactFlowProvider>
  );
}
