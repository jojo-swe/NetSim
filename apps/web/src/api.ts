import { type Edge } from "reactflow";
import {
  type CableType,
  type DeviceType,
} from "@netsim/shared";
import {
  type LabDefinition,
  type LabValidationResult,
} from "./types";
import { cableTypeSuffix, edgeStyleForCableType } from "./utils/cableUtils";

export type CreateLinkResult = {
  id: string;
  a: { deviceId: string; interfaceName: string };
  b: { deviceId: string; interfaceName: string };
  cableType?: string;
};

export function createApiClient(apiOrigin: string) {
  async function refreshDevices(): Promise<Record<string, any>> {
    const resp = await fetch(`${apiOrigin}/api/devices`);
    const json = (await resp.json()) as { devices?: any[] };
    const list = Array.isArray(json.devices) ? json.devices : [];
    const next: Record<string, any> = {};
    for (const d of list) {
      const id = typeof d?.id === "string" ? d.id : "";
      if (!id) continue;
      next[id] = d;
    }
    return next;
  }

  async function createDevice(deviceId: string, type: DeviceType): Promise<void> {
    await fetch(`${apiOrigin}/api/devices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: deviceId, type }),
    });
  }

  async function deleteLink(linkId: string): Promise<void> {
    const resp = await fetch(`${apiOrigin}/api/links/${encodeURIComponent(linkId)}`, {
      method: "DELETE",
    });
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
    try {
      const json = (await resp.json()) as { ok?: boolean };
      if (json.ok === false) throw new Error("Failed");
    } catch {}
  }

  async function createLink(
    sourceId: string,
    targetId: string,
    opts?: { sourceIf?: string; targetIf?: string; cableType?: CableType }
  ): Promise<CreateLinkResult> {
    const body: any = { a: { deviceId: sourceId }, b: { deviceId: targetId } };
    if (opts?.sourceIf) body.a.interfaceName = opts.sourceIf;
    if (opts?.targetIf) body.b.interfaceName = opts.targetIf;
    if (opts?.cableType) body.cableType = opts.cableType;

    const resp = await fetch(`${apiOrigin}/api/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const json = (await resp.json()) as {
      link?: CreateLinkResult;
      error?: string;
    };

    if (!resp.ok || !json.link) {
      throw new Error(json.error ?? "Failed to create link");
    }
    return json.link;
  }

  async function setInterfaceAdminUp(
    deviceId: string,
    interfaceName: string,
    adminUp: boolean
  ): Promise<void> {
    const resp = await fetch(`${apiOrigin}/api/devices/${encodeURIComponent(deviceId)}/interface`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interfaceName, adminUp }),
    });
    if (!resp.ok) {
      let msg = `HTTP ${resp.status}`;
      try {
        const text = await resp.text();
        if (text) msg = text;
      } catch {}
      throw new Error(msg);
    }
  }

  async function setInterfaceIpv4(
    deviceId: string,
    interfaceName: string,
    ipv4Address: string | null,
    ipv4Mask: string | null
  ): Promise<void> {
    const resp = await fetch(`${apiOrigin}/api/devices/${encodeURIComponent(deviceId)}/interface`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interfaceName, ipv4Address, ipv4Mask }),
    });
    if (!resp.ok) {
      let msg = `HTTP ${resp.status}`;
      try {
        const text = await resp.text();
        if (text) msg = text;
      } catch {}
      throw new Error(msg);
    }
  }

  async function loadLabs(): Promise<LabDefinition[]> {
    const resp = await fetch(`${apiOrigin}/api/labs`);
    const json = (await resp.json()) as { labs?: LabDefinition[] };
    return Array.isArray(json.labs) ? json.labs : [];
  }

  async function validateLab(labId: string): Promise<LabValidationResult | null> {
    const resp = await fetch(`${apiOrigin}/api/labs/${encodeURIComponent(labId)}/validate`, {
      method: "POST",
    });
    const json = (await resp.json()) as { result?: LabValidationResult };
    if (resp.ok && json.result) return json.result;
    return null;
  }

  async function resetWorld(): Promise<void> {
    await fetch(`${apiOrigin}/api/world/reset`, { method: "POST" });
  }

  async function fetchSnapshot(): Promise<unknown> {
    const resp = await fetch(`${apiOrigin}/api/world/snapshot`);
    const json = (await resp.json()) as { snapshot: unknown };
    return json.snapshot;
  }

  async function restoreSnapshot(snapshot: unknown): Promise<void> {
    await fetch(`${apiOrigin}/api/world/snapshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshot }),
    });
  }

  async function fetchLinks(): Promise<Edge[]> {
    const resp = await fetch(`${apiOrigin}/api/links`);
    const json = (await resp.json()) as any;
    return (json.links ?? []).map((l: any) => ({
      id: l.id,
      source: l.a.deviceId,
      target: l.b.deviceId,
      label: `${l.a.deviceId} ${l.a.interfaceName} ↔ ${l.b.deviceId} ${l.b.interfaceName}${cableTypeSuffix(l.cableType)}`,
      data: { a: l.a, b: l.b, cableType: l.cableType },
      style: edgeStyleForCableType(l.cableType),
    }));
  }

  return {
    refreshDevices,
    createDevice,
    deleteLink,
    createLink,
    setInterfaceAdminUp,
    setInterfaceIpv4,
    loadLabs,
    validateLab,
    resetWorld,
    fetchSnapshot,
    restoreSnapshot,
    fetchLinks,
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

export { getApiOrigin } from "./types";
