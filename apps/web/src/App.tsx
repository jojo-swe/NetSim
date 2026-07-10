import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
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
import { PortsPanel } from "./components/PortsPanel";
import { LinkWizard } from "./components/LinkWizard";
import { CableLegend } from "./components/CableLegend";
import {
  devicePorts,
  deviceIsMdix,
  ipv4ToInt,
  maskToPrefixLen,
  type DeviceType,
  type CableType,
  type DevicePort,
  type PortKind
} from "@netsim/shared";
import {
  type DeviceNodeData,
  type LabDefinition,
  type LabValidationResult,
  type LinkWizardState,
  type IpEditorState,
  type PortsPanelUi,
  getApiOrigin,
  nextCounterFromIds
} from "./types";
import {
  maskOrPrefixToMask,
  cableTypeLabel,
  cableTypeSuffix,
  edgeStyleForCableType
} from "./utils/cableUtils";

const initialNodes: Node<DeviceNodeData>[] = [];
const initialEdges: Edge[] = [];

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
  const [interfaceAdminBusy, setInterfaceAdminBusy] = useState<Record<string, boolean>>({});
  const [interfaceAdminError, setInterfaceAdminError] = useState<Record<string, string>>({});
  const [linkDeleteBusy, setLinkDeleteBusy] = useState<Record<string, boolean>>({});
  const [linkDeleteError, setLinkDeleteError] = useState<Record<string, string>>({});
  const [interfaceIpBusy, setInterfaceIpBusy] = useState<Record<string, boolean>>({});
  const [interfaceIpError, setInterfaceIpError] = useState<Record<string, string>>({});
  const [ipEditor, setIpEditor] = useState<null | {
    deviceId: string;
    interfaceName: string;
    ipv4Address: string;
    ipv4MaskOrPrefix: string;
  }>(null);

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

  const [confirmDisconnectAll, setConfirmDisconnectAll] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem("netsim.confirmDisconnectAll");
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

  useEffect(() => {
    setIpEditor(null);
  }, [selectedDeviceId]);

  const defaultAdminUpFor = useCallback((type: DeviceType): boolean => {
    if (type === "router") return false;
    if (type === "firewall") return false;
    return true;
  }, []);

  const setInterfaceAdminUp = useCallback(
    async (deviceId: string, interfaceName: string, adminUp: boolean) => {
      const resp = await fetch(`${apiOrigin}/api/devices/${encodeURIComponent(deviceId)}/interface`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interfaceName, adminUp })
      });
      if (!resp.ok) {
        let msg = `HTTP ${resp.status}`;
        try {
          const text = await resp.text();
          if (text) msg = text;
        } catch {}
        throw new Error(msg);
      }
    },
    [apiOrigin]
  );

  const setInterfaceIpv4 = useCallback(
    async (deviceId: string, interfaceName: string, ipv4Address: string | null, ipv4Mask: string | null) => {
      const resp = await fetch(`${apiOrigin}/api/devices/${encodeURIComponent(deviceId)}/interface`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interfaceName, ipv4Address, ipv4Mask })
      });
      if (!resp.ok) {
        let msg = `HTTP ${resp.status}`;
        try {
          const text = await resp.text();
          if (text) msg = text;
        } catch {}
        throw new Error(msg);
      }
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

  useEffect(() => {
    try {
      localStorage.setItem("netsim.confirmDisconnectAll", String(confirmDisconnectAll));
    } catch {}
  }, [confirmDisconnectAll]);

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
      const resp = await fetch(`${apiOrigin}/api/links/${encodeURIComponent(linkId)}`, {
        method: "DELETE"
      });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      try {
        const json = (await resp.json()) as { ok?: boolean };
        if (json.ok === false) throw new Error("Failed");
      } catch {}
    },
    [apiOrigin]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      for (const change of changes) {
        if (change.type === "remove") {
          void deleteLink(change.id).catch(() => {});
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
    ): { linkId: string; peerDeviceId: string; peerInterfaceName: string; cableType?: string } | null => {
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
          return { linkId: String(e.id), peerDeviceId: d.b.deviceId, peerInterfaceName: d.b.interfaceName, cableType };
        }

        if (
          d?.b?.deviceId === deviceId &&
          d?.b?.interfaceName === interfaceName &&
          typeof d?.a?.deviceId === "string" &&
          typeof d?.a?.interfaceName === "string"
        ) {
          return { linkId: String(e.id), peerDeviceId: d.a.deviceId, peerInterfaceName: d.a.interfaceName, cableType };
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
      const ipv4Address = typeof selectedIface?.ipv4Address === "string" ? selectedIface.ipv4Address : undefined;
      const ipv4Mask = typeof selectedIface?.ipv4Mask === "string" ? selectedIface.ipv4Mask : undefined;

      let peerAdminUp: boolean | null = null;
      if (link) {
        const peerDevice = devicesById[link.peerDeviceId];
        const peerIface = peerDevice?.config?.interfaces?.[link.peerInterfaceName];
        peerAdminUp = typeof peerIface?.adminUp === "boolean" ? peerIface.adminUp : null;
      }

      const connected = Boolean(link);
      const operUp = connected && adminUp && (peerAdminUp === null ? true : peerAdminUp);

      let operReason: string | null = null;
      if (!connected) operReason = "not connected";
      else if (!adminUp) operReason = "admin down";
      else if (peerAdminUp === false) operReason = "peer admin down";

      const isArmed = Boolean(armedPort && armedPort.deviceId === selectedDeviceId && armedPort.interfaceName === p.name);

      return {
        name: p.name,
        kind: p.kind,
        connected,
        linkId: link?.linkId,
        adminUp,
        operUp,
        operReason,
        ipv4Address,
        ipv4Mask,
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

    if (selectedLabId === "pc-001") {
      routerCounterRef.current = 2;
      pcCounterRef.current = 3;

      void createDevice("R1", "router");
      void createDevice("PC1", "pc");
      void createDevice("PC2", "pc");

      const starterNodes: Node<DeviceNodeData>[] = [
        {
          id: "R1",
          type: "device",
          position: { x: 360, y: 220 },
          data: { label: "Router R1", deviceId: "R1" }
        },
        {
          id: "PC1",
          type: "device",
          position: { x: 120, y: 130 },
          data: { label: "PC PC1", deviceId: "PC1" }
        },
        {
          id: "PC2",
          type: "device",
          position: { x: 120, y: 320 },
          data: { label: "PC PC2", deviceId: "PC2" }
        }
      ];

      setNodes(starterNodes);
      setEdges([]);
    }
  }, [apiOrigin, createDevice, selectedLabId, setEdges, setNodes]);

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
          <PortsPanel
            selectedDeviceId={selectedDeviceId!}
            portsPanelUi={portsPanelUi}
            portsPanelSide={portsPanelSide}
            setPortsPanelSide={setPortsPanelSide}
            showPortsPanel={showPortsPanel}
            setShowPortsPanel={setShowPortsPanel}
            refreshDevices={refreshDevices}
            armedPort={armedPort}
            setArmedPort={setArmedPort}
            edges={edges}
            setEdges={setEdges}
            deleteLink={deleteLink}
            linkDeleteBusy={linkDeleteBusy}
            setLinkDeleteBusy={setLinkDeleteBusy}
            linkDeleteError={linkDeleteError}
            setLinkDeleteError={setLinkDeleteError}
            confirmDisconnectAll={confirmDisconnectAll}
            setConfirmDisconnectAll={setConfirmDisconnectAll}
            ipEditor={ipEditor}
            setIpEditor={setIpEditor}
            interfaceAdminBusy={interfaceAdminBusy}
            setInterfaceAdminBusy={setInterfaceAdminBusy}
            interfaceAdminError={interfaceAdminError}
            setInterfaceAdminError={setInterfaceAdminError}
            interfaceIpBusy={interfaceIpBusy}
            setInterfaceIpBusy={setInterfaceIpBusy}
            interfaceIpError={interfaceIpError}
            setInterfaceIpError={setInterfaceIpError}
            devicesById={devicesById}
            setDevicesById={setDevicesById}
            setInterfaceAdminUp={setInterfaceAdminUp}
            setInterfaceIpv4={setInterfaceIpv4}
          />
        ) : null}

        {linkWizard ? (
          <LinkWizard
            linkWizard={linkWizard}
            linkWizardUi={linkWizardUi}
            inferDeviceType={inferDeviceType}
            suggestCableType={suggestCableType}
            createLink={createLink}
            setEdges={setEdges}
            setLinkWizard={setLinkWizard}
          />
        ) : null}

        <CableLegend />
      </div>
    </ReactFlowProvider>
  );
}
