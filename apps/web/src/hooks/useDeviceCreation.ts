import { useCallback, useRef } from "react";
import { type Node } from "reactflow";
import { type DeviceType } from "@netsim/shared";
import { type DeviceNodeData, nextCounterFromIds } from "../types";
import { type ApiClient } from "../api";

type DeviceCounterRefs = {
  router: number;
  switch: number;
  l3switch: number;
  firewall: number;
  server: number;
  cloud: number;
  pc: number;
  host: number;
};

type AddDeviceFn = (deviceId: string, type: DeviceType) => Node<DeviceNodeData>;

function makeNode(deviceId: string, type: DeviceType, label: string): Node<DeviceNodeData> {
  return {
    id: deviceId,
    type: "device",
    position: { x: 100 + Math.random() * 300, y: 100 + Math.random() * 200 },
    data: { label: `${label} ${deviceId}`, deviceId },
  };
}

export function useDeviceCreation(api: ApiClient, setNodes: (updater: (prev: Node<DeviceNodeData>[]) => Node<DeviceNodeData>[]) => void) {
  const refs = useRef<DeviceCounterRefs>({
    router: 1, switch: 1, l3switch: 1, firewall: 1,
    server: 1, cloud: 1, pc: 1, host: 1,
  });

  const createDevice = useCallback(
    async (deviceId: string, type: DeviceType) => {
      try {
        await api.createDevice(deviceId, type);
      } catch {}
    },
    [api]
  );

  const addDevice = useCallback(
    (prefix: string, type: DeviceType, label: string, refKey: keyof DeviceCounterRefs) => {
      const deviceId = `${prefix}${refs.current[refKey]++}`;
      void createDevice(deviceId, type);
      setNodes((prev) => [...prev, makeNode(deviceId, type, label)]);
    },
    [createDevice, setNodes]
  );

  const addRouter = useCallback(() => addDevice("R", "router", "Router", "router"), [addDevice]);
  const addSwitch = useCallback(() => addDevice("SW", "switch", "Switch", "switch"), [addDevice]);
  const addL3Switch = useCallback(() => addDevice("L3SW", "l3switch", "L3 Switch", "l3switch"), [addDevice]);
  const addFirewall = useCallback(() => addDevice("FW", "firewall", "Firewall", "firewall"), [addDevice]);
  const addServer = useCallback(() => addDevice("SRV", "server", "Server", "server"), [addDevice]);
  const addCloud = useCallback(() => addDevice("CLOUD", "cloud", "Cloud", "cloud"), [addDevice]);
  const addPc = useCallback(() => addDevice("PC", "pc", "PC", "pc"), [addDevice]);
  const addHost = useCallback(() => addDevice("H", "host", "Host", "host"), [addDevice]);

  const resetCounters = useCallback(() => {
    refs.current = { router: 1, switch: 1, l3switch: 1, firewall: 1, server: 1, cloud: 1, pc: 1, host: 1 };
  }, []);

  const setCountersFromIds = useCallback((ids: string[]) => {
    refs.current.router = nextCounterFromIds(ids, /^R(\d+)$/);
    refs.current.switch = nextCounterFromIds(ids, /^SW(\d+)$/);
    refs.current.l3switch = nextCounterFromIds(ids, /^L3SW(\d+)$/);
    refs.current.firewall = nextCounterFromIds(ids, /^FW(\d+)$/);
    refs.current.server = nextCounterFromIds(ids, /^SRV(\d+)$/);
    refs.current.cloud = nextCounterFromIds(ids, /^CLOUD(\d+)$/);
    refs.current.pc = nextCounterFromIds(ids, /^PC(\d+)$/);
    refs.current.host = nextCounterFromIds(ids, /^H(\d+)$/);
  }, []);

  return {
    refs,
    createDevice,
    addRouter, addSwitch, addL3Switch, addFirewall,
    addServer, addCloud, addPc, addHost,
    resetCounters, setCountersFromIds,
  };
}
