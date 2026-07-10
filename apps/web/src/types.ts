export type DeviceNodeData = {
  label: string;
  deviceId: string;
};

export type LabDefinition = {
  id: string;
  title: string;
  description: string;
};

export type ObjectiveResult = {
  id: string;
  title: string;
  passed: boolean;
  hint?: string;
  details?: string;
};

export type LabValidationResult = {
  labId: string;
  passed: boolean;
  score: number;
  objectives: ObjectiveResult[];
};

export type PortPanelItem = {
  name: string;
  kind: string;
  connected: boolean;
  linkId?: string;
  adminUp: boolean;
  operUp: boolean;
  operReason: string | null;
  ipv4Address?: string;
  ipv4Mask?: string;
  isArmed: boolean;
  peer: string;
  cableType?: string;
};

export type PortsPanelUi = {
  selectedType: string;
  items: PortPanelItem[];
};

export type LinkWizardState = {
  sourceId: string;
  targetId: string;
  sourceIf: string;
  targetIf: string;
  cableType: import("@netsim/shared").CableType;
  cableTypeLocked?: boolean;
  error?: string;
};

export type IpEditorState = {
  deviceId: string;
  interfaceName: string;
  ipv4Address: string;
  ipv4MaskOrPrefix: string;
};

export function getApiOrigin(): string {
  return (import.meta as any).env?.VITE_API_ORIGIN ?? "http://localhost:3001";
}

export function nextCounterFromIds(ids: string[], re: RegExp): number {
  let max = 0;
  for (const id of ids) {
    const m = re.exec(id);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return max + 1;
}
