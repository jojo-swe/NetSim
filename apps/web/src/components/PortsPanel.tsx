import { type Edge } from "reactflow";
import { maskToPrefixLen, ipv4ToInt, prefixLenToMask } from "@netsim/shared";
import { type PortsPanelUi, type IpEditorState } from "../types";
import { cableTypeSuffix } from "../utils/cableUtils";

type PortsPanelProps = {
  selectedDeviceId: string;
  portsPanelUi: PortsPanelUi;
  portsPanelSide: "front" | "back";
  setPortsPanelSide: (updater: (s: "front" | "back") => "front" | "back") => void;
  showPortsPanel: boolean;
  setShowPortsPanel: (v: boolean) => void;
  refreshDevices: () => void;
  armedPort: { deviceId: string; interfaceName: string } | null;
  setArmedPort: (updater: (prev: { deviceId: string; interfaceName: string } | null) => { deviceId: string; interfaceName: string } | null) => void;
  edges: Edge[];
  setEdges: (updater: (prev: Edge[]) => Edge[]) => void;
  deleteLink: (linkId: string) => Promise<void>;
  linkDeleteBusy: Record<string, boolean>;
  setLinkDeleteBusy: (updater: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
  linkDeleteError: Record<string, string>;
  setLinkDeleteError: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  confirmDisconnectAll: boolean;
  setConfirmDisconnectAll: (updater: (prev: boolean) => boolean) => void;
  ipEditor: IpEditorState | null;
  setIpEditor: (updater: (prev: IpEditorState | null) => IpEditorState | null) => void;
  interfaceAdminBusy: Record<string, boolean>;
  setInterfaceAdminBusy: (updater: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
  interfaceAdminError: Record<string, string>;
  setInterfaceAdminError: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  interfaceIpBusy: Record<string, boolean>;
  setInterfaceIpBusy: (updater: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
  interfaceIpError: Record<string, string>;
  setInterfaceIpError: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  devicesById: Record<string, any>;
  setDevicesById: (updater: (prev: Record<string, any>) => Record<string, any>) => void;
  setInterfaceAdminUp: (deviceId: string, interfaceName: string, adminUp: boolean) => Promise<void>;
  setInterfaceIpv4: (deviceId: string, interfaceName: string, ipv4Address: string | null, ipv4Mask: string | null) => Promise<void>;
};

function maskOrPrefixToMaskLocal(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const s = raw.startsWith("/") ? raw.slice(1) : raw;
  if (s.includes(".")) {
    return ipv4ToInt(s) === null ? null : s;
  }
  const n = Number(s);
  if (!Number.isInteger(n)) return null;
  return prefixLenToMask(n);
}

export function PortsPanel(props: PortsPanelProps) {
  const {
    selectedDeviceId,
    portsPanelUi,
    portsPanelSide,
    setPortsPanelSide,
    setShowPortsPanel,
    refreshDevices,
    armedPort,
    setArmedPort,
    edges,
    setEdges,
    deleteLink,
    linkDeleteBusy,
    setLinkDeleteBusy,
    linkDeleteError,
    setLinkDeleteError,
    confirmDisconnectAll,
    setConfirmDisconnectAll,
    ipEditor,
    setIpEditor,
    interfaceAdminBusy,
    setInterfaceAdminBusy,
    interfaceAdminError,
    setInterfaceAdminError,
    interfaceIpBusy,
    setInterfaceIpBusy,
    interfaceIpError,
    setInterfaceIpError,
    devicesById,
    setDevicesById,
    setInterfaceAdminUp,
    setInterfaceIpv4
  } = props;

  return (
    <div
      className="glass-panel"
      style={{
        position: "absolute",
        top: 320,
        right: 20,
        width: 280,
        maxHeight: "calc(100vh - 360px)",
        overflow: "hidden",
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
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
            {portsPanelSide === "front" ? "Device" : "Ports"}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
            {selectedDeviceId} ({portsPanelUi.selectedType})
          </div>
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <button
            className="btn-icon"
            style={{ padding: 6, transition: "transform 0.3s ease", transform: portsPanelSide === "back" ? "rotateY(180deg)" : "rotateY(0deg)" }}
            onClick={() => setPortsPanelSide((s) => (s === "back" ? "front" : "back"))}
            title={portsPanelSide === "back" ? "Show summary" : "Show ports"}
          >
            ⇄
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

      <div className={`flip-card${portsPanelSide === "back" ? " flipped" : ""}`} style={{ minHeight: 180 }}>
        <div className="flip-card-inner">
          <div className="flip-card-front" style={{ overflow: "auto", maxHeight: "calc(100vh - 460px)" }}>
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
                  {(() => {
                    const sid = selectedDeviceId;
                    if (!sid) return null;
                    const linkIds = Array.from(
                      new Set(
                        portsPanelUi.items
                          .map((x) => (typeof x.linkId === "string" ? x.linkId : ""))
                          .filter((x) => Boolean(x)) as string[]
                      )
                    );
                    const busyCount = linkIds.filter((id) => Boolean(linkDeleteBusy[id])).length;
                    const enabled = linkIds.length > 0 && busyCount === 0;

                    return (
                      <>
                        <button
                          className="btn-icon"
                          style={{
                            justifyContent: "flex-start",
                            gap: 8,
                            padding: 10,
                            borderColor: "rgba(248, 113, 113, 0.35)",
                            opacity: enabled ? 1 : 0.6
                          }}
                          disabled={!enabled}
                          onClick={(e) => {
                            const ids = linkIds.filter((id) => !linkDeleteBusy[id]);
                            if (ids.length === 0) return;

                            if (confirmDisconnectAll && !e.shiftKey) {
                              const ok = window.confirm(
                                `Disconnect all cables from ${sid}? (${ids.length} link${ids.length === 1 ? "" : "s"})`
                              );
                              if (!ok) return;
                            }

                            const edgeSnapshots = new Map<string, any>();
                            for (const id of ids) {
                              const snap = (edges as any[]).find((x) => x?.id === id);
                              if (snap) edgeSnapshots.set(id, snap);
                            }

                            setLinkDeleteError((prev) => {
                              let changed = false;
                              const next = { ...prev };
                              for (const id of ids) {
                                if (next[id]) {
                                  delete next[id];
                                  changed = true;
                                }
                              }
                              return changed ? next : prev;
                            });
                            setLinkDeleteBusy((prev) => {
                              const next = { ...prev };
                              for (const id of ids) next[id] = true;
                              return next;
                            });

                            const idSet = new Set(ids);
                            setEdges((prev) => prev.filter((x) => !idSet.has(x.id)));

                            void (async () => {
                              await Promise.all(
                                ids.map(async (id) => {
                                  try {
                                    await deleteLink(id);
                                  } catch (err) {
                                    setEdges((prev) => {
                                      const snap = edgeSnapshots.get(id);
                                      if (!snap) return prev;
                                      if (prev.some((x) => x.id === id)) return prev;
                                      return [...prev, snap];
                                    });
                                    const msg = err instanceof Error ? err.message : "Failed";
                                    setLinkDeleteError((prev) => ({ ...prev, [id]: msg }));
                                  } finally {
                                    setLinkDeleteBusy((prev) => ({ ...prev, [id]: false }));
                                  }
                                })
                              );
                            })();
                          }}
                          title={
                            linkIds.length === 0
                              ? "No connected links"
                              : busyCount > 0
                                ? "Disconnect in progress"
                                : confirmDisconnectAll
                                  ? "Disconnect all cables (shift-click to skip confirm)"
                                  : "Disconnect all cables"
                          }
                        >
                          Disconnect all cables{linkIds.length > 0 ? ` (${linkIds.length})` : ""}
                        </button>

                        <button
                          className="btn-icon"
                          style={{ justifyContent: "flex-start", gap: 8, padding: 10 }}
                          onClick={() => setConfirmDisconnectAll((v) => !v)}
                          title="Toggle confirmation prompt"
                        >
                          Confirm bulk disconnect: {confirmDisconnectAll ? "on" : "off"}
                        </button>
                      </>
                    );
                  })()}
                  <button
                    className="btn-icon"
                    style={{ justifyContent: "flex-start", gap: 8, padding: 10 }}
                    onClick={() => setPortsPanelSide(() => "back")}
                    title="Show ports"
                  >
                    Show ports
                  </button>
                  {armedPort ? (
                    <button
                      className="btn-icon"
                      style={{ justifyContent: "flex-start", gap: 8, padding: 10, borderColor: "rgba(251, 146, 60, 0.35)" }}
                      onClick={() => setArmedPort(() => null)}
                      title="Cancel link mode"
                    >
                      Cancel link mode ({armedPort.deviceId} {armedPort.interfaceName})
                    </button>
                  ) : null}
                </div>
              </div>

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
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Summary</div>

                {(() => {
                  const items = portsPanelUi.items;
                  const connected = items.filter((x) => x.connected).length;
                  const up = items.filter((x) => x.connected && x.operUp).length;
                  const down = items.filter((x) => x.connected && !x.operUp).length;
                  const unused = items.filter((x) => !x.connected).length;

                  const armed = armedPort && selectedDeviceId && armedPort.deviceId === selectedDeviceId ? armedPort.interfaceName : null;

                  return (
                    <div style={{ display: "grid", gap: 8 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, fontSize: 11 }}>
                        <div style={{ color: "var(--text-muted)" }}>Connected</div>
                        <div style={{ color: "var(--text-primary)", fontWeight: 700 }}>{connected}</div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, fontSize: 11 }}>
                        <div style={{ color: "var(--text-muted)" }}>Up</div>
                        <div style={{ color: "rgba(34, 197, 94, 0.95)", fontWeight: 700 }}>{up}</div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, fontSize: 11 }}>
                        <div style={{ color: "var(--text-muted)" }}>Down</div>
                        <div style={{ color: "rgba(251, 146, 60, 0.95)", fontWeight: 700 }}>{down}</div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, fontSize: 11 }}>
                        <div style={{ color: "var(--text-muted)" }}>Unused</div>
                        <div style={{ color: "var(--text-primary)", fontWeight: 700 }}>{unused}</div>
                      </div>

                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        Armed: {armed ? <span style={{ color: "rgba(251, 146, 60, 0.95)", fontWeight: 700 }}>{armed}</span> : "none"}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                Tip: click a port on the back side to arm it, then click another device.
              </div>
            </div>
          </div>

          <div className="flip-card-back" style={{ overflow: "auto", maxHeight: "calc(100vh - 460px)" }}>
            <div style={{ display: "grid", gap: 8 }}>
              {portsPanelUi.items.map((p) => {
                const sid = selectedDeviceId;
                if (!sid) return null;

                const operStatus = !p.connected ? "unused" : p.operUp ? "up" : "down";
                const operStatusColor =
                  operStatus === "up"
                    ? "rgba(34, 197, 94, 0.95)"
                    : operStatus === "down"
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
                          <div style={{ width: 8, height: 8, borderRadius: 99, background: operStatusColor }} />
                          <div style={{ fontSize: 11, color: operStatusColor, fontWeight: 700 }}>{operStatus.toUpperCase()}</div>
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

                    {p.connected && p.linkId ? (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                        <button
                          className="btn-icon"
                          style={{ padding: "4px 8px", opacity: linkDeleteBusy[p.linkId] ? 0.6 : 1 }}
                          disabled={Boolean(linkDeleteBusy[p.linkId])}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();

                            const linkId = p.linkId as string;
                            if (linkDeleteBusy[linkId]) return;
                            const edgeSnapshot = (edges as any[]).find((x) => x?.id === linkId);

                            setLinkDeleteError((prev) => {
                              if (!prev[linkId]) return prev;
                              const next = { ...prev };
                              delete next[linkId];
                              return next;
                            });
                            setLinkDeleteBusy((prev) => ({ ...prev, [linkId]: true }));

                            setEdges((prev) => prev.filter((x) => x.id !== linkId));

                            void (async () => {
                              try {
                                await deleteLink(linkId);
                              } catch (err) {
                                setEdges((prev) => {
                                  if (!edgeSnapshot) return prev;
                                  if (prev.some((x) => x.id === linkId)) return prev;
                                  return [...prev, edgeSnapshot];
                                });
                                const msg = err instanceof Error ? err.message : "Failed";
                                setLinkDeleteError((prev) => ({ ...prev, [linkId]: msg }));
                              } finally {
                                setLinkDeleteBusy((prev) => ({ ...prev, [linkId]: false }));
                              }
                            })();
                          }}
                          title="Disconnect"
                        >
                          {linkDeleteBusy[p.linkId] ? "..." : "disconnect"}
                        </button>
                      </div>
                    ) : null}

                    {p.connected && p.linkId && linkDeleteError[p.linkId] ? (
                      <div style={{ fontSize: 10, color: "rgba(248, 113, 113, 0.95)" }}>{linkDeleteError[p.linkId]}</div>
                    ) : null}

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", opacity: 0.9 }}>
                        IPv4:{" "}
                        {p.ipv4Address && p.ipv4Mask
                          ? `${p.ipv4Address}${(() => {
                              const pl = maskToPrefixLen(p.ipv4Mask);
                              return pl === null ? ` ${p.ipv4Mask}` : `/${pl}`;
                            })()}`
                          : "-"}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className="btn-icon"
                          style={{ padding: "4px 8px" }}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();

                            const maskOrPrefix =
                              p.ipv4Mask && typeof p.ipv4Mask === "string"
                                ? (() => {
                                    const pl = maskToPrefixLen(p.ipv4Mask);
                                    return pl === null ? p.ipv4Mask : String(pl);
                                  })()
                                : "";

                            setIpEditor(() => ({
                              deviceId: sid,
                              interfaceName: p.name,
                              ipv4Address: p.ipv4Address ?? "",
                              ipv4MaskOrPrefix: maskOrPrefix
                            }));
                          }}
                          title="Edit IPv4"
                        >
                          ip
                        </button>
                        {p.ipv4Address || p.ipv4Mask ? (
                          <button
                            className="btn-icon"
                            style={{ padding: "4px 8px", opacity: interfaceIpBusy[`${sid}:${p.name}`] ? 0.6 : 1 }}
                            disabled={Boolean(interfaceIpBusy[`${sid}:${p.name}`])}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();

                              const k = `${sid}:${p.name}`;
                              if (interfaceIpBusy[k]) return;
                              const prevIp = p.ipv4Address;
                              const prevMask = p.ipv4Mask;

                              setInterfaceIpError((prev) => {
                                if (!prev[k]) return prev;
                                const next = { ...prev };
                                delete next[k];
                                return next;
                              });
                              setInterfaceIpBusy((prev) => ({ ...prev, [k]: true }));

                              setDevicesById((prev) => {
                                const device = prev[sid];
                                if (!device) return prev;
                                const ifaces = device.config?.interfaces ?? {};
                                const iface = ifaces[p.name] ?? { name: p.name };
                                const nextIface = { ...iface };
                                delete nextIface.ipv4Address;
                                delete nextIface.ipv4Mask;
                                return {
                                  ...prev,
                                  [sid]: {
                                    ...device,
                                    config: {
                                      ...device.config,
                                      interfaces: {
                                        ...ifaces,
                                        [p.name]: nextIface
                                      }
                                    }
                                  }
                                };
                              });

                              void (async () => {
                                try {
                                  await setInterfaceIpv4(sid, p.name, null, null);
                                } catch (err) {
                                  setDevicesById((prev) => {
                                    const device = prev[sid];
                                    if (!device) return prev;
                                    const ifaces = device.config?.interfaces ?? {};
                                    const iface = ifaces[p.name] ?? { name: p.name };
                                    const nextIface = { ...iface };
                                    if (typeof prevIp === "string" && prevIp) nextIface.ipv4Address = prevIp;
                                    else delete nextIface.ipv4Address;
                                    if (typeof prevMask === "string" && prevMask) nextIface.ipv4Mask = prevMask;
                                    else delete nextIface.ipv4Mask;
                                    return {
                                      ...prev,
                                      [sid]: {
                                        ...device,
                                        config: {
                                          ...device.config,
                                          interfaces: {
                                            ...ifaces,
                                            [p.name]: nextIface
                                          }
                                        }
                                      }
                                    };
                                  });
                                  const msg = err instanceof Error ? err.message : "Failed";
                                  setInterfaceIpError((prev) => ({ ...prev, [k]: msg }));
                                } finally {
                                  setInterfaceIpBusy((prev) => ({ ...prev, [k]: false }));
                                }
                              })();
                            }}
                            title="Clear IPv4"
                          >
                            clear
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {ipEditor && ipEditor.deviceId === sid && ipEditor.interfaceName === p.name ? (
                      <div style={{ display: "grid", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <input
                            value={ipEditor.ipv4Address}
                            onChange={(e) => setIpEditor((prev) => (prev ? { ...prev, ipv4Address: e.target.value } : prev))}
                            placeholder="IPv4 (e.g. 10.0.0.2)"
                            style={{ width: "100%", padding: 8, borderRadius: 8, background: "var(--bg-app)", color: "var(--text-primary)", border: "1px solid rgba(148, 163, 184, 0.18)" }}
                          />
                          <input
                            value={ipEditor.ipv4MaskOrPrefix}
                            onChange={(e) => setIpEditor((prev) => (prev ? { ...prev, ipv4MaskOrPrefix: e.target.value } : prev))}
                            placeholder="Mask or prefix (e.g. 24)"
                            style={{ width: "100%", padding: 8, borderRadius: 8, background: "var(--bg-app)", color: "var(--text-primary)", border: "1px solid rgba(148, 163, 184, 0.18)" }}
                          />
                        </div>

                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          <button
                            className="btn-icon"
                            style={{ padding: "6px 10px" }}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setIpEditor(() => null);
                            }}
                            title="Cancel"
                          >
                            cancel
                          </button>

                          <button
                            className="btn-icon"
                            style={{ padding: "6px 10px", opacity: interfaceIpBusy[`${sid}:${p.name}`] ? 0.6 : 1 }}
                            disabled={Boolean(interfaceIpBusy[`${sid}:${p.name}`])}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();

                              const k = `${sid}:${p.name}`;
                              if (interfaceIpBusy[k]) return;
                              const ipRaw = ipEditor.ipv4Address.trim();
                              const maskInput = ipEditor.ipv4MaskOrPrefix.trim();

                              if (!ipRaw) {
                                setInterfaceIpError((prev) => ({ ...prev, [k]: "IPv4 address required (or use clear)" }));
                                return;
                              }
                              if (ipv4ToInt(ipRaw) === null) {
                                setInterfaceIpError((prev) => ({ ...prev, [k]: "Invalid IPv4 address" }));
                                return;
                              }
                              const mask = maskOrPrefixToMaskLocal(maskInput);
                              if (!mask) {
                                setInterfaceIpError((prev) => ({ ...prev, [k]: "Invalid mask/prefix" }));
                                return;
                              }

                              const prevIp = p.ipv4Address;
                              const prevMask = p.ipv4Mask;

                              setInterfaceIpError((prev) => {
                                if (!prev[k]) return prev;
                                const next = { ...prev };
                                delete next[k];
                                return next;
                              });
                              setInterfaceIpBusy((prev) => ({ ...prev, [k]: true }));

                              setDevicesById((prev) => {
                                const device = prev[sid];
                                if (!device) return prev;
                                const ifaces = device.config?.interfaces ?? {};
                                const iface = ifaces[p.name] ?? { name: p.name };
                                return {
                                  ...prev,
                                  [sid]: {
                                    ...device,
                                    config: {
                                      ...device.config,
                                      interfaces: {
                                        ...ifaces,
                                        [p.name]: { ...iface, ipv4Address: ipRaw, ipv4Mask: mask }
                                      }
                                    }
                                  }
                                };
                              });

                              void (async () => {
                                try {
                                  await setInterfaceIpv4(sid, p.name, ipRaw, mask);
                                  setIpEditor(() => null);
                                } catch (err) {
                                  setDevicesById((prev) => {
                                    const device = prev[sid];
                                    if (!device) return prev;
                                    const ifaces = device.config?.interfaces ?? {};
                                    const iface = ifaces[p.name] ?? { name: p.name };
                                    const nextIface = { ...iface };
                                    if (typeof prevIp === "string" && prevIp) nextIface.ipv4Address = prevIp;
                                    else delete nextIface.ipv4Address;
                                    if (typeof prevMask === "string" && prevMask) nextIface.ipv4Mask = prevMask;
                                    else delete nextIface.ipv4Mask;
                                    return {
                                      ...prev,
                                      [sid]: {
                                        ...device,
                                        config: {
                                          ...device.config,
                                          interfaces: {
                                            ...ifaces,
                                            [p.name]: nextIface
                                          }
                                        }
                                      }
                                    };
                                  });
                                  const msg = err instanceof Error ? err.message : "Failed";
                                  setInterfaceIpError((prev) => ({ ...prev, [k]: msg }));
                                } finally {
                                  setInterfaceIpBusy((prev) => ({ ...prev, [k]: false }));
                                }
                              })();
                            }}
                            title="Apply"
                          >
                            apply
                          </button>
                        </div>

                        {interfaceIpError[`${sid}:${p.name}`] ? (
                          <div style={{ fontSize: 10, color: "rgba(248, 113, 113, 0.95)" }}>{interfaceIpError[`${sid}:${p.name}`]}</div>
                        ) : null}
                      </div>
                    ) : null}

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ display: "grid", gap: 2 }}>
                        <div style={{ fontSize: 10, color: "var(--text-muted)", opacity: 0.9 }}>Admin: {p.adminUp ? "up" : "down"}</div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)", opacity: 0.9 }}>
                          Oper: {!p.connected ? "unused" : p.operUp ? "up" : "down"}
                          {!p.operUp && p.operReason ? ` (${p.operReason})` : ""}
                        </div>
                      </div>

                      <button
                        className="btn-icon"
                        style={{ padding: "4px 8px", opacity: interfaceAdminBusy[`${sid}:${p.name}`] ? 0.6 : 1 }}
                        disabled={Boolean(interfaceAdminBusy[`${sid}:${p.name}`])}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const k = `${sid}:${p.name}`;
                          if (interfaceAdminBusy[k]) return;
                          const newAdminUp = !p.adminUp;
                          const prevAdminUp = p.adminUp;

                          setInterfaceAdminError((prev) => {
                            if (!prev[k]) return prev;
                            const next = { ...prev };
                            delete next[k];
                            return next;
                          });
                          setInterfaceAdminBusy((prev) => ({ ...prev, [k]: true }));

                          setDevicesById((prev) => {
                            const device = prev[sid];
                            if (!device) return prev;
                            const ifaces = device.config?.interfaces ?? {};
                            const iface = ifaces[p.name] ?? { name: p.name };
                            return {
                              ...prev,
                              [sid]: {
                                ...device,
                                config: {
                                  ...device.config,
                                  interfaces: {
                                    ...ifaces,
                                    [p.name]: { ...iface, adminUp: newAdminUp }
                                  }
                                }
                              }
                            };
                          });

                          void (async () => {
                            try {
                              await setInterfaceAdminUp(sid, p.name, newAdminUp);
                            } catch (err) {
                              setDevicesById((prev) => {
                                const device = prev[sid];
                                if (!device) return prev;
                                const ifaces = device.config?.interfaces ?? {};
                                const iface = ifaces[p.name] ?? { name: p.name };
                                return {
                                  ...prev,
                                  [sid]: {
                                    ...device,
                                    config: {
                                      ...device.config,
                                      interfaces: {
                                        ...ifaces,
                                        [p.name]: { ...iface, adminUp: prevAdminUp }
                                      }
                                    }
                                  }
                                };
                              });

                              const msg = err instanceof Error ? err.message : "Failed";
                              setInterfaceAdminError((prev) => ({ ...prev, [k]: msg }));
                            } finally {
                              setInterfaceAdminBusy((prev) => ({ ...prev, [k]: false }));
                            }
                          })();
                        }}
                        title={p.adminUp ? "Shutdown" : "No shutdown"}
                      >
                        {interfaceAdminBusy[`${sid}:${p.name}`] ? "..." : p.adminUp ? "down" : "up"}
                      </button>
                    </div>

                    {interfaceAdminError[`${sid}:${p.name}`] ? (
                      <div style={{ fontSize: 10, color: "rgba(248, 113, 113, 0.95)" }}>
                        {interfaceAdminError[`${sid}:${p.name}`]}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
