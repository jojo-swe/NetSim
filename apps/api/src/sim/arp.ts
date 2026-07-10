import { ipv4ToInt } from "@netsim/shared";

type ArpEntry = {
  mac: string;
  interfaceName: string;
  learnedAt: number;
};

export type ArpTableEntry = {
  ip: string;
  mac: string;
  interfaceName: string;
  ageMinutes: number;
};

export class ArpStore {
  private tables = new Map<string, Map<string, ArpEntry>>();

  ensureDevice(deviceId: string): void {
    if (!this.tables.has(deviceId)) {
      this.tables.set(deviceId, new Map());
    }
  }

  clearDevice(deviceId: string): void {
    this.tables.delete(deviceId);
  }

  learn(deviceId: string, ip: string, mac: string, interfaceName: string): void {
    if (ipv4ToInt(ip) === null) return;
    let table = this.tables.get(deviceId);
    if (!table) {
      table = new Map();
      this.tables.set(deviceId, table);
    }
    table.set(ip, { mac, interfaceName, learnedAt: Date.now() });
  }

  getTable(deviceId: string): ArpTableEntry[] {
    const table = this.tables.get(deviceId);
    if (!table) return [];

    const now = Date.now();
    return [...table.entries()]
      .map(([ip, e]) => ({
        ip,
        mac: e.mac,
        interfaceName: e.interfaceName,
        ageMinutes: Math.floor((now - e.learnedAt) / 60000)
      }))
      .sort((a, b) => {
        const ai = ipv4ToInt(a.ip) ?? 0;
        const bi = ipv4ToInt(b.ip) ?? 0;
        return ai - bi;
      });
  }

  deleteEntry(deviceId: string, ip: string): boolean {
    if (ipv4ToInt(ip) === null) return false;
    const table = this.tables.get(deviceId);
    if (!table) return false;
    return table.delete(ip);
  }

  flush(deviceId: string, interfaceName?: string): number {
    const table = this.tables.get(deviceId);
    if (!table) return 0;

    if (!interfaceName) {
      const count = table.size;
      table.clear();
      return count;
    }

    let removed = 0;
    for (const [ip, entry] of table.entries()) {
      if (entry.interfaceName === interfaceName) {
        table.delete(ip);
        removed++;
      }
    }
    return removed;
  }

  clear(): void {
    this.tables.clear();
  }
}
