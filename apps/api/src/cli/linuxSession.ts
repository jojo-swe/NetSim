import type { Device, InterfaceConfig } from "../sim/types.js";

type WorldLike = {
  isInterfaceOperUp(deviceId: string, interfaceName: string): boolean;
  canPing(fromDeviceId: string, targetIp: string): boolean;
  traceRoute(fromDeviceId: string, targetIp: string): { ok: boolean; hops: string[] };
  getArpTable(
    deviceId: string
  ): Array<{ ip: string; mac: string; interfaceName: string; ageMinutes: number }>;
};

type ShellResult = {
  output: string;
  prompt: string;
};

type ShellCompletionResult = {
  insert: string;
  candidates: string[];
  prompt: string;
};

function normalizeWhitespace(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    const v = Number(part);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = (n << 8) | v;
  }
  return n >>> 0;
}

function prefixLenToMask(prefixLen: number): string | null {
  if (!Number.isInteger(prefixLen) || prefixLen < 0 || prefixLen > 32) return null;
  const m = prefixLen === 0 ? 0 : ((0xffffffff << (32 - prefixLen)) >>> 0);
  const parts = [(m >>> 24) & 255, (m >>> 16) & 255, (m >>> 8) & 255, m & 255];
  return parts.join(".");
}

function maskToPrefixLen(mask: string): number | null {
  const m = ipv4ToInt(mask);
  if (m === null) return null;

  let seenZero = false;
  let len = 0;
  for (let i = 31; i >= 0; i--) {
    const bit = (m >>> i) & 1;
    if (bit === 1) {
      if (seenZero) return null;
      len++;
    } else {
      seenZero = true;
    }
  }

  return len;
}

function linuxIfName(iosIf: string): string {
  const m = iosIf.match(/^GigabitEthernet0\/(\d+)$/i);
  if (m) return `eth${m[1]}`;
  return iosIf;
}

function iosIfName(input: string): string {
  const s = input.trim();
  const m = s.match(/^eth(\d+)$/i);
  if (m) return `GigabitEthernet0/${m[1]}`;
  return s;
}

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

export class LinuxSession {
  constructor(
    private device: Device,
    private world?: WorldLike
  ) {}

  getPrompt(): string {
    return `${this.device.config.hostname}$ `;
  }

  complete(rawLine: string): ShellCompletionResult {
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

    if (matches.length === 0) return { insert: "", candidates: [], prompt };

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

  executeLine(rawLine: string): ShellResult {
    const line = normalizeWhitespace(rawLine);
    if (!line) return { output: "", prompt: this.getPrompt() };

    const parts = line.split(" ");
    const cmd = (parts[0] ?? "").toLowerCase();
    const args = parts.slice(1);

    if (cmd === "exit" || cmd === "logout" || cmd === "quit") {
      return { output: "logout\n", prompt: "" };
    }

    if (cmd === "help") {
      return {
        output:
          [
            "Available commands:",
            "  help",
            "  hostname [name]",
            "  ip addr|a [add <ip>/<prefix> dev <iface>]",
            "  ip link [set dev <iface> up|down]",
            "  ip route|r [add default via <gw> | del default]",
            "  arp [-n]",
            "  ping <ip>",
            "  traceroute <ip>",
            "  exit"
          ].join("\n") + "\n",
        prompt: this.getPrompt()
      };
    }

    if (cmd === "hostname") {
      if (args.length === 0) {
        return { output: `${this.device.config.hostname}\n`, prompt: this.getPrompt() };
      }
      const next = args.join(" ").trim();
      if (!next) return { output: "\n", prompt: this.getPrompt() };
      this.device.config.hostname = next;
      return { output: "", prompt: this.getPrompt() };
    }

    if (cmd === "ifconfig") {
      return { output: this.showIpAddr(), prompt: this.getPrompt() };
    }

    if (cmd === "arp") {
      return { output: this.showArp(), prompt: this.getPrompt() };
    }

    if (cmd === "ping") {
      const target = args.join(" ").trim();
      if (!target) return { output: "ping: missing operand\n", prompt: this.getPrompt() };
      return { output: this.ping(target), prompt: this.getPrompt() };
    }

    if (cmd === "traceroute" || cmd === "trace") {
      const target = args.join(" ").trim();
      if (!target) return { output: "traceroute: missing operand\n", prompt: this.getPrompt() };
      return { output: this.traceroute(target), prompt: this.getPrompt() };
    }

    if (cmd === "ip") {
      const sub = (args[0] ?? "").toLowerCase();
      const rest = args.slice(1);

      if (sub === "a" || sub === "addr" || sub === "address" || sub === "") {
        if (sub === "" && (rest[0] ?? "").toLowerCase() === "a") {
          return { output: this.showIpAddr(), prompt: this.getPrompt() };
        }
        if ((rest[0] ?? "").toLowerCase() === "add") {
          const ok = this.ipAddrAdd(rest.slice(1));
          return { output: ok ? "" : "ip: invalid addr add syntax\n", prompt: this.getPrompt() };
        }
        return { output: this.showIpAddr(), prompt: this.getPrompt() };
      }

      if (sub === "link") {
        if ((rest[0] ?? "").toLowerCase() === "set") {
          const ok = this.ipLinkSet(rest.slice(1));
          return { output: ok ? "" : "ip: invalid link set syntax\n", prompt: this.getPrompt() };
        }
        return { output: this.showIpLink(), prompt: this.getPrompt() };
      }

      if (sub === "r" || sub === "route") {
        const op = (rest[0] ?? "").toLowerCase();
        if (op === "add") {
          const ok = this.ipRouteAdd(rest.slice(1));
          return { output: ok ? "" : "ip: invalid route add syntax\n", prompt: this.getPrompt() };
        }
        if (op === "del" || op === "delete") {
          const ok = this.ipRouteDel(rest.slice(1));
          return { output: ok ? "" : "ip: invalid route del syntax\n", prompt: this.getPrompt() };
        }
        return { output: this.showIpRoute(), prompt: this.getPrompt() };
      }

      return { output: "ip: unknown object\n", prompt: this.getPrompt() };
    }

    return { output: `${cmd}: command not found\n`, prompt: this.getPrompt() };
  }

  private completionCandidates(tokens: string[]): string[] {
    const t = tokens.map((x) => x.toLowerCase());
    if (t.length === 0) {
      return ["help", "hostname", "ip", "ifconfig", "arp", "ping", "traceroute", "exit"];
    }

    if (t.length === 1 && t[0] === "ip") {
      return ["addr", "a", "link", "route", "r"];
    }

    if (t.length === 2 && t[0] === "ip" && (t[1] === "addr" || t[1] === "a")) {
      return ["add", "show"];
    }

    if (t.length >= 3 && t[0] === "ip" && (t[1] === "addr" || t[1] === "a") && t[2] === "add") {
      return [];
    }

    if (t.length === 2 && t[0] === "ip" && t[1] === "link") {
      return ["set", "show"];
    }

    if (t.length === 3 && t[0] === "ip" && t[1] === "link" && t[2] === "set") {
      return ["dev"];
    }

    if (t.length === 2 && t[0] === "ip" && (t[1] === "route" || t[1] === "r")) {
      return ["add", "del", "show"];
    }

    return [];
  }

  private ensureIface(interfaceName: string): InterfaceConfig {
    if (!this.device.config.interfaces[interfaceName]) {
      this.device.config.interfaces[interfaceName] = { name: interfaceName, adminUp: true };
    }
    return this.device.config.interfaces[interfaceName];
  }

  private showIpAddr(): string {
    const lines: string[] = [];
    const ifaces = Object.values(this.device.config.interfaces);
    for (let i = 0; i < ifaces.length; i++) {
      const iface = ifaces[i]!;
      const operUp = this.world?.isInterfaceOperUp(this.device.id, iface.name) ?? iface.adminUp;
      const flags = `${iface.adminUp ? "UP" : "DOWN"}${operUp ? ",LOWER_UP" : ""}`;
      lines.push(`${i + 1}: ${linuxIfName(iface.name)}: <${flags}>`);
      if (iface.ipv4Address && iface.ipv4Mask) {
        const prefix = maskToPrefixLen(iface.ipv4Mask);
        const p = prefix === null ? "" : `/${prefix}`;
        lines.push(`    inet ${iface.ipv4Address}${p}`);
      }
    }
    return lines.join("\n") + "\n";
  }

  private showIpLink(): string {
    const lines: string[] = [];
    const ifaces = Object.values(this.device.config.interfaces);
    for (let i = 0; i < ifaces.length; i++) {
      const iface = ifaces[i]!;
      const operUp = this.world?.isInterfaceOperUp(this.device.id, iface.name) ?? iface.adminUp;
      const state = iface.adminUp ? (operUp ? "UP" : "DOWN") : "DOWN";
      lines.push(`${i + 1}: ${linuxIfName(iface.name)}: state ${state}`);
    }
    return lines.join("\n") + "\n";
  }

  private ipLinkSet(args: string[]): boolean {
    // ip link set dev eth0 up|down
    const devIdx = args.findIndex((x) => x.toLowerCase() === "dev");
    if (devIdx === -1) return false;
    const dev = args[devIdx + 1];
    const state = args[devIdx + 2];
    if (!dev || !state) return false;

    const ifaceName = iosIfName(dev);
    const iface = this.ensureIface(ifaceName);

    if (state.toLowerCase() === "up") iface.adminUp = true;
    else if (state.toLowerCase() === "down") iface.adminUp = false;
    else return false;

    return true;
  }

  private ipAddrAdd(args: string[]): boolean {
    // ip addr add 10.0.0.2/24 dev eth0
    const addr = args[0];
    if (!addr) return false;

    const [ip, prefixRaw] = addr.split("/");
    if (!ip || ipv4ToInt(ip) === null) return false;
    const prefixLen = prefixRaw ? Number(prefixRaw) : NaN;
    if (!Number.isInteger(prefixLen)) return false;

    const mask = prefixLenToMask(prefixLen);
    if (!mask) return false;

    const devIdx = args.findIndex((x) => x.toLowerCase() === "dev");
    if (devIdx === -1) return false;
    const dev = args[devIdx + 1];
    if (!dev) return false;

    const ifaceName = iosIfName(dev);
    const iface = this.ensureIface(ifaceName);
    iface.ipv4Address = ip;
    iface.ipv4Mask = mask;
    return true;
  }

  private showIpRoute(): string {
    const lines: string[] = [];

    if (this.device.config.defaultGateway) {
      lines.push(`default via ${this.device.config.defaultGateway}`);
    }

    const staticRoutes = Array.isArray((this.device.config as any).staticRoutes) ? this.device.config.staticRoutes : [];
    for (const r of staticRoutes) {
      const prefixLen = maskToPrefixLen(r.mask);
      if (prefixLen === null) continue;
      lines.push(`${r.destination}/${prefixLen} via ${r.nextHop}`);
    }

    return (lines.length ? lines.join("\n") : "") + "\n";
  }

  private ipRouteAdd(args: string[]): boolean {
    // ip route add default via 10.0.0.1
    const dest = (args[0] ?? "").toLowerCase();
    if (dest !== "default") return false;
    if ((args[1] ?? "").toLowerCase() !== "via") return false;
    const gw = args[2];
    if (!gw || ipv4ToInt(gw) === null) return false;
    this.device.config.defaultGateway = gw;
    return true;
  }

  private ipRouteDel(args: string[]): boolean {
    // ip route del default
    const dest = (args[0] ?? "").toLowerCase();
    if (dest !== "default") return false;
    this.device.config.defaultGateway = undefined;
    return true;
  }

  private showArp(): string {
    const header = "Address          HWtype  HWaddress           Iface\n";
    const entries = this.world?.getArpTable(this.device.id) ?? [];
    if (entries.length === 0) return header;

    const rows = entries
      .map((e) => {
        const addr = e.ip.padEnd(16, " ");
        const mac = e.mac.padEnd(19, " ");
        const iface = linuxIfName(e.interfaceName);
        return `${addr}ether   ${mac}${iface}`;
      })
      .join("\n");

    return header + rows + "\n";
  }

  private ping(target: string): string {
    const ok = this.world?.canPing(this.device.id, target) ?? false;
    const transmitted = 4;
    const received = ok ? 4 : 0;
    const loss = ok ? 0 : 100;

    const lines: string[] = [];
    lines.push(`PING ${target} (${target}) 56(84) bytes of data.`);
    if (ok) {
      for (let i = 1; i <= transmitted; i++) {
        lines.push(`64 bytes from ${target}: icmp_seq=${i} ttl=64 time=1.0 ms`);
      }
    }
    lines.push("");
    lines.push(`--- ${target} ping statistics ---`);
    lines.push(`${transmitted} packets transmitted, ${received} received, ${loss}% packet loss`);
    return lines.join("\n") + "\n";
  }

  private traceroute(target: string): string {
    const result = this.world?.traceRoute(this.device.id, target) ?? { ok: false, hops: [] };
    const lines: string[] = [];
    lines.push(`traceroute to ${target}, 8 hops max`);

    const hops = Array.isArray(result.hops) ? result.hops : [];
    for (let i = 0; i < hops.length; i++) {
      const hopIp = hops[i] ?? "";
      if (!hopIp) continue;
      lines.push(`${i + 1}  ${hopIp}  1.0 ms  1.0 ms  1.0 ms`);
    }

    if (!result.ok) {
      const n = hops.length + 1;
      lines.push(`${n}  *  *  *`);
    }

    return lines.join("\n") + "\n";
  }
}
