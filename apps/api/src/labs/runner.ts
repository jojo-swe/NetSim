import type { Device, Link } from "@netsim/shared";

import { World } from "../sim/world.js";

export type LabAssertion =
  | { type: "deviceExists"; deviceId: string }
  | { type: "hostname"; deviceId: string; expected: string }
  | { type: "interfaceUp"; deviceId: string; interfaceName: string; expected?: boolean }
  | { type: "ping"; from: string; targetIp: string; expected?: boolean };

export interface LabDefinition {
  name: string;
  description?: string;
  topology: {
    devices: Device[];
    links?: Link[];
  };
  assertions: LabAssertion[];
}

export interface AssertionResult {
  assertion: LabAssertion;
  passed: boolean;
  message: string;
}

export interface LabResult {
  name: string;
  passed: boolean;
  passedCount: number;
  failedCount: number;
  results: AssertionResult[];
}

function evaluateAssertion(world: World, assertion: LabAssertion): AssertionResult {
  switch (assertion.type) {
    case "deviceExists": {
      const passed = Boolean(world.getDevice(assertion.deviceId));
      return {
        assertion,
        passed,
        message: passed
          ? `Device ${assertion.deviceId} exists`
          : `Device ${assertion.deviceId} does not exist`
      };
    }

    case "hostname": {
      const actual = world.getDevice(assertion.deviceId)?.config.hostname;
      const passed = actual === assertion.expected;
      return {
        assertion,
        passed,
        message: passed
          ? `${assertion.deviceId} hostname is ${assertion.expected}`
          : `${assertion.deviceId} hostname expected ${assertion.expected}, got ${actual ?? "<missing>"}`
      };
    }

    case "interfaceUp": {
      const expected = assertion.expected ?? true;
      const actual = world.isInterfaceOperUp(assertion.deviceId, assertion.interfaceName);
      const passed = actual === expected;
      return {
        assertion,
        passed,
        message: `${assertion.deviceId} ${assertion.interfaceName} operational state expected ${expected ? "up" : "down"}, got ${actual ? "up" : "down"}`
      };
    }

    case "ping": {
      const expected = assertion.expected ?? true;
      const actual = world.canPing(assertion.from, assertion.targetIp);
      const passed = actual === expected;
      return {
        assertion,
        passed,
        message: `${assertion.from} -> ${assertion.targetIp} expected ${expected ? "reachable" : "unreachable"}, got ${actual ? "reachable" : "unreachable"}`
      };
    }
  }
}

export function runLab(definition: LabDefinition): LabResult {
  if (!definition.name?.trim()) throw new Error("Lab name is required");
  if (!Array.isArray(definition.topology?.devices)) throw new Error("Lab topology.devices must be an array");
  if (!Array.isArray(definition.assertions)) throw new Error("Lab assertions must be an array");

  const world = new World();
  world.importSnapshot(definition.topology);

  const results = definition.assertions.map((assertion) => evaluateAssertion(world, assertion));
  const passedCount = results.filter((result) => result.passed).length;
  const failedCount = results.length - passedCount;

  return {
    name: definition.name,
    passed: failedCount === 0,
    passedCount,
    failedCount,
    results
  };
}
