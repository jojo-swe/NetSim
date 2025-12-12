import type { Device, StaticRouteConfig } from "../sim/types.js";

type WorldLike = {
  isInterfaceOperUp(deviceId: string, interfaceName: string): boolean;
  canPing(fromDeviceId: string, targetIp: string): boolean;
};

export type CliMode = "user" | "priv" | "config" | "config-if";

export interface CliContext {
  interfaceName?: string;
}

export interface CliResult {
  output: string;
  prompt: string;
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
      if (lower.startsWith("ping ")) {
        const target = line.substring(5).trim();
        return { output: this.ping(target), prompt: this.getPrompt() };
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
        const ifName = line.substring("interface ".length).trim();
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

    lines.push("end\n");
    return lines.join("\n") + "\n";
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
}
