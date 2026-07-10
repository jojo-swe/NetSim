import type { DeviceType, StaticRouteConfig } from "@netsim/shared";

export type SimEvent =
  | { type: "device:created"; deviceId: string; deviceType: DeviceType }
  | { type: "device:deleted"; deviceId: string }
  | { type: "link:created"; linkId: string }
  | { type: "link:deleted"; linkId: string }
  | { type: "interface:changed"; deviceId: string; interfaceName: string }
  | { type: "route:added"; deviceId: string; route: StaticRouteConfig }
  | { type: "route:removed"; deviceId: string; route: StaticRouteConfig }
  | { type: "arp:learned"; deviceId: string; ip: string; mac: string };

type EventHandler = (e: SimEvent) => void;

export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();

  on(type: string, handler: EventHandler): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler);
    return () => {
      set?.delete(handler);
    };
  }

  emit(event: SimEvent): void {
    const set = this.handlers.get(event.type);
    if (set) {
      for (const handler of set) {
        handler(event);
      }
    }
  }
}
