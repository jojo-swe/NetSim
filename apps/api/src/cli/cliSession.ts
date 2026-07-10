import {
  ipv4ToInt,
  inSameSubnet,
  networkAddress,
  maskToPrefixLen,
  type Device,
  type StaticRouteConfig
} from "@netsim/shared";

type WorldLike = {
  isInterfaceOperUp(deviceId: string, interfaceName: string): boolean;
  canPing(fromDeviceId: string, targetIp: string): boolean;
  traceRoute(fromDeviceId: string, targetIp: string): { ok: boolean; hops: string[] };
  getArpTable(
    deviceId: string
  ): Array<{ ip: string; mac: string; interfaceName: string; ageMinutes: number }>;
};

export type CliMode = "user" | "priv" | "config" | "config-if";

export interface CliContext {
  interfaceName?: string;
}

export interface CliResult {
  output: string;
  prompt: string;
}

type CliCompletionResult = {
  insert: string;
  candidates: string[];
  prompt: string;
};

function commonPrefix(items: string[]): string {
  if (items.length === 0) return "";
  let prefix = items[0] ?? "";
  for (let i = 1; i < items.length; i++) {
    const s = items[i] ?? "";
    const max = Math.min(prefix.length, s.length);
    let j = 0;
    for (; j < max; j++) {
      if (prefix[j]?.toLowerCase() !== s[j]?.toLowerCase()) break;
    }
    prefix = prefix.slice(0, j);
    if (!prefix) break;
  }
  return prefix;
}

function modeSuffix(mode: CliMode, ctx: CliContext): string {
  switch (mode) {
    case "user":
      return ">";
    case "priv":
      return "#";
    case "config":
      return "(config)#";
    case "config-if":
      return `(config-if)#`;
  }
}

function buildPrompt(device: Device, mode: CliMode, ctx: CliContext): string {
  const base = device.config.hostname;
  if (mode === "config-if" && ctx.interfaceName) {
    return `${base}(config-if)#`;
  }
  return `${base}${modeSuffix(mode, ctx)}`;
}

function normalizeWhitespace(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

function canonicalInterfaceName(input: string): string {
  const name = input.trim();
  const m = name.match(/^(?:gi|g|gigabitethernet)0\/(\d+)$/i);
  if (m) {
    return `GigabitEthernet0/${m[1]}`;
  }
  return name;
}

export class CliSession {
  private mode: CliMode = "user";
  private ctx: CliContext = {};

  constructor(
    private device: Device,
    private world?: WorldLike
  ) {}

  getPrompt(): string {
    return buildPrompt(this.device, this.mode, this.ctx);
  }

  complete(rawLine: string): CliCompletionResult {
    const prompt = this.getPrompt();
    const endsWithSpace = /\s$/.test(rawLine);
    const trimmedStart = rawLine.replace(/^\s+/, "");
    const parts = trimmedStart.length > 0 ? trimmedStart.split(/\s+/) : [];

    let tokens = parts;
    let partial = "";

    if (!endsWithSpace && parts.length > 0) {
      partial = parts[parts.length - 1] ?? "";
      tokens = parts.slice(0, -1);
    }

    const candidates = this.completionCandidates(tokens);
    const p = partial.toLowerCase();
    const matches = candidates.filter((c) => c.toLowerCase().startsWith(p));

    if (matches.length === 0) {
      return { insert: "", candidates: [], prompt };
    }

    if (matches.length === 1) {
      const choice = matches[0] ?? "";
      let insert = choice.slice(partial.length);
      insert += " ";
      return { insert, candidates: matches, prompt };
    }

    const shared = commonPrefix(matches);
    if (shared.length > partial.length) {
      const insert = shared.slice(partial.length);
      return { insert, candidates: matches, prompt };
    }

    return { insert: "", candidates: matches, prompt };
  }

  executeLine(rawLine: string): CliResult {
    const line = normalizeWhitespace(rawLine);
    if (!line) {
      return { output: "", prompt: this.getPrompt() };
    }

    const lower = line.toLowerCase();

    if (this.mode === "user") {
      if (lower === "enable") {
        this.mode = "priv";
        return { output: "", prompt: this.getPrompt() };
      }
      if (lower === "exit" || lower === "logout") {
        return { output: "Connection closed by foreign host.\n", prompt: "" };
      }
      return { output: "% Invalid input detected at '^' marker.\n", prompt: this.getPrompt() };
    }

    if (this.mode === "priv") {
      if (lower === "disable") {
        this.mode = "user";
        return { output: "", prompt: this.getPrompt() };
      }
      if (lower === "configure terminal" || lower === "conf t") {
        this.mode = "config";
        return { output: "Enter configuration commands, one per line. End with CNTL/Z.\n", prompt: this.getPrompt() };
      }
      if (lower === "show running-config" || lower === "show run") {
        return { output: this.showRunningConfig(), prompt: this.getPrompt() };
      }
      if (lower === "show ip interface brief") {
        return { output: this.showIpIntBrief(), prompt: this.getPrompt() };
      }
      if (lower === "show ip route") {
        return { output: this.showIpRoute(), prompt: this.getPrompt() };
      }
      if (lower === "show arp" || lower === "show ip arp") {
        return { output: this.showArp(), prompt: this.getPrompt() };
      }
      if (lower.startsWith("ping ")) {
        const target = line.substring(5).trim();
        return { output: this.ping(target), prompt: this.getPrompt() };
      }
      if (lower.startsWith("traceroute ") || lower.startsWith("trace ")) {
        const target = lower.startsWith("trace ") ? line.substring(6).trim() : line.substring(11).trim();
        return { output: this.traceroute(target), prompt: this.getPrompt() };
      }
      if (lower === "exit") {
        return { output: "Connection closed by foreign host.\n", prompt: "" };
      }
      return { output: "% Invalid input detected at '^' marker.\n", prompt: this.getPrompt() };
    }

    if (this.mode === "config") {
      if (lower === "end") {
        this.mode = "priv";
        return { output: "", prompt: this.getPrompt() };
      }
      if (lower === "exit") {
        this.mode = "priv";
        return { output: "", prompt: this.getPrompt() };
      }
      if (lower.startsWith("hostname ")) {
        const hostname = line.substring("hostname ".length).trim();
        if (!hostname) {
          return { output: "% Incomplete command.\n", prompt: this.getPrompt() };
        }
        this.device.config.hostname = hostname;
        return { output: "", prompt: this.getPrompt() };
      }
      if (lower.startsWith("interface ")) {
        const ifName = canonicalInterfaceName(line.substring("interface ".length).trim());
        if (!ifName) {
          return { output: "% Incomplete command.\n", prompt: this.getPrompt() };
        }
        if (!this.device.config.interfaces[ifName]) {
          this.device.config.interfaces[ifName] = { name: ifName, adminUp: false };
        }
        this.mode = "config-if";
        this.ctx.interfaceName = ifName;
        return { output: "", prompt: this.getPrompt() };
      }

      if (lower.startsWith("ip default-gateway ")) {
        const gw = line.substring("ip default-gateway ".length).trim();
        if (!gw) {
          return { output: "% Incomplete command.\n", prompt: this.getPrompt() };
        }
        if (ipv4ToInt(gw) === null) {
          return { output: "% Invalid input detected at '^' marker.\n", prompt: this.getPrompt() };
        }
        this.device.config.defaultGateway = gw;
        return { output: "", prompt: this.getPrompt() };
      }

      if (lower === "no ip default-gateway") {
        this.device.config.defaultGateway = undefined;
        return { output: "", prompt: this.getPrompt() };
      }

      if (lower.startsWith("ip route ")) {
        const rest = line.substring("ip route ".length).trim();
        const [destination, mask, nextHop] = rest.split(" ");
        if (!destination || !mask || !nextHop) {
          return { output: "% Incomplete command.\n", prompt: this.getPrompt() };
        }
        if (!Array.isArray((this.device.config as any).staticRoutes)) {
          (this.device.config as any).staticRoutes = [];
        }
        const route: StaticRouteConfig = { destination, mask, nextHop };
        const exists = this.device.config.staticRoutes.some(
          (r) => r.destination === destination && r.mask === mask && r.nextHop === nextHop
        );
        if (!exists) {
          this.device.config.staticRoutes.push(route);
        }
        return { output: "", prompt: this.getPrompt() };
      }

      if (lower.startsWith("no ip route ")) {
        const rest = line.substring("no ip route ".length).trim();
        const [destination, mask, nextHop] = rest.split(" ");
        if (!destination || !mask || !nextHop) {
          return { output: "% Incomplete command.\n", prompt: this.getPrompt() };
        }
        if (!Array.isArray((this.device.config as any).staticRoutes)) {
          (this.device.config as any).staticRoutes = [];
        }
        this.device.config.staticRoutes = this.device.config.staticRoutes.filter(
          (r) => !(r.destination === destination && r.mask === mask && r.nextHop === nextHop)
        );
        return { output: "", prompt: this.getPrompt() };
      }

      return { output: "% Invalid input detected at '^' marker.\n", prompt: this.getPrompt() };
    }

    if (this.mode === "config-if") {
      const ifName = this.ctx.interfaceName;
      if (!ifName) {
        this.mode = "config";
        return { output: "% Internal error: interface context lost.\n", prompt: this.getPrompt() };
      }

      const iface = this.device.config.interfaces[ifName];

      if (lower === "exit") {
        this.mode = "config";
        this.ctx.interfaceName = undefined;
        return { output: "", prompt: this.getPrompt() };
      }
      if (lower === "end") {
        this.mode = "priv";
        this.ctx.interfaceName = undefined;
        return { output: "", prompt: this.getPrompt() };
      }
      if (lower === "shutdown") {
        iface.adminUp = false;
        return { output: "", prompt: this.getPrompt() };
      }
      if (lower === "no shutdown") {
        iface.adminUp = true;
        return { output: "", prompt: this.getPrompt() };
      }
      if (lower.startsWith("ip address ")) {
        const rest = line.substring("ip address ".length).trim();
        const [addr, mask] = rest.split(" ");
        if (!addr || !mask) {
          return { output: "% Incomplete command.\n", prompt: this.getPrompt() };
        }
        iface.ipv4Address = addr;
        iface.ipv4Mask = mask;
        return { output: "", prompt: this.getPrompt() };
      }

      return { output: "% Invalid input detected at '^' marker.\n", prompt: this.getPrompt() };
    }

    return { output: "% Invalid input detected at '^' marker.\n", prompt: this.getPrompt() };
  }

  private completionCandidates(tokens: string[]): string[] {
    const t = tokens.map((x) => x.toLowerCase());

    if (this.mode === "user") {
      if (t.length === 0) return ["enable", "exit", "logout"];
      return [];
    }

    if (this.mode === "priv") {
      if (t.length === 0) return ["disable", "configure", "show", "ping", "traceroute", "trace", "exit"];
      if (t.length === 1 && t[0] === "configure") return ["terminal"];
      if (t.length === 1 && t[0] === "show") return ["running-config", "ip", "arp"];
      if (t.length === 2 && t[0] === "show" && t[1] === "ip") return ["interface", "route", "arp"];
      if (t.length === 3 && t[0] === "show" && t[1] === "ip" && t[2] === "interface") return ["brief"];
      return [];
    }

    if (this.mode === "config") {
      if (t.length === 0) return ["end", "exit", "hostname", "interface", "ip", "no"];
      if (t.length === 1 && t[0] === "ip") return ["route", "default-gateway"];
      if (t.length === 1 && t[0] === "no") return ["ip"];
      if (t.length === 2 && t[0] === "no" && t[1] === "ip") return ["route", "default-gateway"];
      if (t.length === 1 && t[0] === "interface") {
        return Object.keys(this.device.config.interfaces);
      }
      return [];
    }

    if (this.mode === "config-if") {
      if (t.length === 0) return ["exit", "end", "shutdown", "no", "ip"];
      if (t.length === 1 && t[0] === "no") return ["shutdown"];
      if (t.length === 1 && t[0] === "ip") return ["address"];
      return [];
    }

    return [];
  }

  private showRunningConfig(): string {
    const lines: string[] = [];
    lines.push("Building configuration...\n");
    lines.push("Current configuration : 0 bytes");
    lines.push("!");
    lines.push(`hostname ${this.device.config.hostname}`);
    lines.push("!");

    for (const iface of Object.values(this.device.config.interfaces)) {
      lines.push(`interface ${iface.name}`);
      if (iface.description) lines.push(` description ${iface.description}`);
      if (iface.ipv4Address && iface.ipv4Mask) {
        lines.push(` ip address ${iface.ipv4Address} ${iface.ipv4Mask}`);
      }
      if (!iface.adminUp) {
        lines.push(" shutdown");
      }
      lines.push("!");
    }

    if (this.device.config.staticRoutes.length > 0) {
      for (const route of this.device.config.staticRoutes) {
        lines.push(`ip route ${route.destination} ${route.mask} ${route.nextHop}`);
      }
      lines.push("!");
    }

    if (this.device.config.defaultGateway) {
      lines.push(`ip default-gateway ${this.device.config.defaultGateway}`);
      lines.push("!");
    }

    lines.push("end\n");
    return lines.join("\n") + "\n";
  }

  private showArp(): string {
    const header = "Protocol  Address          Age (min)  Hardware Addr   Type   Interface\n";
    const entries = this.world?.getArpTable(this.device.id) ?? [];
    if (entries.length === 0) return header;

    const rows = entries
      .map((e) => {
        const proto = "Internet".padEnd(10, " ");
        const addr = e.ip.padEnd(16, " ");
        const age = String(e.ageMinutes).padEnd(10, " ");
        const mac = e.mac.padEnd(15, " ");
        const type = "ARPA".padEnd(7, " ");
        return `${proto}${addr}${age}${mac}${type}${e.interfaceName}`;
      })
      .join("\n");

    return header + rows + "\n";
  }

  private showIpIntBrief(): string {
    const header = "Interface              IP-Address      OK? Method Status                Protocol\n";
    const rows = Object.values(this.device.config.interfaces)
      .map((iface) => {
        const ip = iface.ipv4Address ?? "unassigned";
        const operUp = this.world?.isInterfaceOperUp(this.device.id, iface.name) ?? iface.adminUp;
        const status = iface.adminUp ? (operUp ? "up" : "down") : "administratively down";
        const proto = iface.adminUp && operUp ? "up" : "down";
        const ifName = iface.name.padEnd(22, " ");
        const ipCol = ip.padEnd(15, " ");
        return `${ifName}${ipCol}YES unset  ${status.padEnd(21, " ")}${proto}`;
      })
      .join("\n");

    return header + rows + "\n";
  }

  private showIpRoute(): string {
    const lines: string[] = [];
    lines.push("Codes: C - connected, S - static");
    lines.push("");

    const defaultGateway = this.device.config.defaultGateway;
    const dgIsValid = defaultGateway ? ipv4ToInt(defaultGateway) !== null : false;
    const dgReachable =
      dgIsValid &&
      Object.values(this.device.config.interfaces).some((iface) => {
        if (!iface.adminUp) return false;
        const operUp = this.world?.isInterfaceOperUp(this.device.id, iface.name) ?? true;
        if (!operUp) return false;
        if (!iface.ipv4Address || !iface.ipv4Mask) return false;
        return inSameSubnet(iface.ipv4Address, iface.ipv4Mask, defaultGateway as string);
      });

    if (dgReachable) {
      lines.push(`Gateway of last resort is ${defaultGateway} to network 0.0.0.0`);
    } else {
      lines.push("Gateway of last resort is not set");
    }
    lines.push("");

    const connected: Array<{ network: string; prefixLen: number; ifaceName: string }> = [];

    for (const iface of Object.values(this.device.config.interfaces)) {
      if (!iface.adminUp) continue;
      const operUp = this.world?.isInterfaceOperUp(this.device.id, iface.name) ?? true;
      if (!operUp) continue;
      if (!iface.ipv4Address || !iface.ipv4Mask) continue;

      const net = networkAddress(iface.ipv4Address, iface.ipv4Mask);
      const prefixLen = maskToPrefixLen(iface.ipv4Mask);
      if (!net || prefixLen === null) continue;
      connected.push({ network: net, prefixLen, ifaceName: iface.name });
    }

    for (const c of connected) {
      lines.push(`C    ${c.network}/${c.prefixLen} is directly connected, ${c.ifaceName}`);
    }

    const staticRoutes = Array.isArray((this.device.config as any).staticRoutes) ? this.device.config.staticRoutes : [];
    for (const route of staticRoutes) {
      if (ipv4ToInt(route.destination) === null) continue;
      if (ipv4ToInt(route.mask) === null) continue;
      if (ipv4ToInt(route.nextHop) === null) continue;
      const prefixLen = maskToPrefixLen(route.mask);
      if (prefixLen === null) continue;

      const nextHopReachable = Object.values(this.device.config.interfaces).some((iface) => {
        if (!iface.adminUp) return false;
        const operUp = this.world?.isInterfaceOperUp(this.device.id, iface.name) ?? true;
        if (!operUp) return false;
        if (!iface.ipv4Address || !iface.ipv4Mask) return false;
        return inSameSubnet(iface.ipv4Address, iface.ipv4Mask, route.nextHop);
      });

      if (!nextHopReachable) continue;
      lines.push(`S    ${route.destination}/${prefixLen} [1/0] via ${route.nextHop}`);
    }

    if (dgReachable) {
      lines.push(`S*   0.0.0.0/0 [1/0] via ${defaultGateway}`);
    }

    return lines.join("\n") + "\n";
  }

  private ping(target: string): string {
    const ok = this.world?.canPing(this.device.id, target) ?? false;
    const marks = ok ? "!!!!!" : ".....";
    const success = ok ? "Success rate is 100 percent (5/5)" : "Success rate is 0 percent (0/5)";
    return [
      "Type escape sequence to abort.",
      `Sending 5, 100-byte ICMP Echos to ${target}, timeout is 2 seconds:`,
      marks,
      success
    ].join("\n") + "\n";
  }

  private traceroute(target: string): string {
    const result = this.world?.traceRoute(this.device.id, target) ?? { ok: false, hops: [] };
    const lines: string[] = [];
    lines.push("Type escape sequence to abort.");
    lines.push(`Tracing the route to ${target}`);
    lines.push("");

    const hops = Array.isArray(result.hops) ? result.hops : [];
    for (let i = 0; i < hops.length; i++) {
      const hopIp = hops[i] ?? "";
      if (!hopIp) continue;
      lines.push(`  ${i + 1}  ${hopIp}  1 msec  1 msec  1 msec`);
    }

    if (!result.ok) {
      const n = hops.length + 1;
      lines.push(`  ${n}  *  *  *`);
    }

    return lines.join("\n") + "\n";
  }
}
