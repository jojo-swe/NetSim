import { World } from "../sim/world.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function assertThrows(fn: () => unknown, expectedMessage: string, context: string): void {
  try {
    fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    assert(msg.includes(expectedMessage), `${context}: expected error including "${expectedMessage}", got "${msg}"`);
    return;
  }
  throw new Error(`${context}: expected function to throw`);
}

function testFiberRequiresSfpOnBothEnds(): void {
  const world = new World();
  world.createDevice({ id: "R1", type: "router" });
  world.createDevice({ id: "SW1", type: "switch" });

  assertThrows(
    () =>
      world.createLink({
        a: { deviceId: "R1", interfaceName: "GigabitEthernet0/4" },
        b: { deviceId: "SW1", interfaceName: "GigabitEthernet0/0" },
        cableType: "fiber"
      }),
    "Fiber cable requires SFP ports on both ends",
    "fiber should fail on SFP<->RJ45"
  );
}

function testCopperRequiresRj45OnBothEnds(): void {
  const world = new World();
  world.createDevice({ id: "R1", type: "router" });
  world.createDevice({ id: "SW1", type: "switch" });

  assertThrows(
    () =>
      world.createLink({
        a: { deviceId: "R1", interfaceName: "GigabitEthernet0/4" },
        b: { deviceId: "SW1", interfaceName: "GigabitEthernet0/48" },
        cableType: "copper_straight"
      }),
    "Copper cable requires RJ45 ports on both ends",
    "copper should fail on SFP<->SFP"
  );
}

function testStraightVsCrossoverValidation(): void {
  const world = new World();
  world.createDevice({ id: "SW1", type: "switch" });
  world.createDevice({ id: "SW2", type: "switch" });
  world.createDevice({ id: "R1", type: "router" });

  assertThrows(
    () =>
      world.createLink({
        a: { deviceId: "SW1", interfaceName: "GigabitEthernet0/0" },
        b: { deviceId: "SW2", interfaceName: "GigabitEthernet0/0" },
        cableType: "copper_straight"
      }),
    "Straight-through cable requires one MDI and one MDI-X port",
    "straight should fail for switch<->switch"
  );

  // Router (MDI) <-> Switch (MDI-X) requires straight-through.
  assertThrows(
    () =>
      world.createLink({
        a: { deviceId: "R1", interfaceName: "GigabitEthernet0/0" },
        b: { deviceId: "SW1", interfaceName: "GigabitEthernet0/1" },
        cableType: "copper_crossover"
      }),
    "Crossover cable requires both ends to be MDI or both ends to be MDI-X",
    "crossover should fail for router<->switch"
  );
}

function testAutoResolvesAsExpected(): void {
  const world = new World();
  world.createDevice({ id: "R1", type: "router" });
  world.createDevice({ id: "SW1", type: "switch" });
  world.createDevice({ id: "SW2", type: "switch" });

  const r1sw1 = world.createLink({
    a: { deviceId: "R1", interfaceName: "GigabitEthernet0/0" },
    b: { deviceId: "SW1", interfaceName: "GigabitEthernet0/0" },
    cableType: "auto"
  });
  assert(r1sw1.cableType === "copper_straight", `auto should resolve to copper_straight for router<->switch, got ${r1sw1.cableType}`);

  const sw1sw2 = world.createLink({
    a: { deviceId: "SW1", interfaceName: "GigabitEthernet0/1" },
    b: { deviceId: "SW2", interfaceName: "GigabitEthernet0/0" },
    cableType: "auto"
  });
  assert(sw1sw2.cableType === "copper_crossover", `auto should resolve to copper_crossover for switch<->switch, got ${sw1sw2.cableType}`);
}

function testAutoFailsWhenAnyEndIsSfpButOtherIsNot(): void {
  const world = new World();
  world.createDevice({ id: "R1", type: "router" });
  world.createDevice({ id: "SW1", type: "switch" });

  assertThrows(
    () =>
      world.createLink({
        a: { deviceId: "R1", interfaceName: "GigabitEthernet0/4" },
        b: { deviceId: "SW1", interfaceName: "GigabitEthernet0/0" },
        cableType: "auto"
      }),
    "Fiber cable requires SFP ports on both ends",
    "auto should fail on SFP<->RJ45 because it resolves to fiber"
  );
}

function testFiberSucceedsOnSfpBothEnds(): void {
  const world = new World();
  world.createDevice({ id: "R1", type: "router" });
  world.createDevice({ id: "SW1", type: "switch" });

  const link = world.createLink({
    a: { deviceId: "R1", interfaceName: "GigabitEthernet0/4" },
    b: { deviceId: "SW1", interfaceName: "GigabitEthernet0/48" },
    cableType: "fiber"
  });
  assert(link.cableType === "fiber", `fiber link should store cableType fiber, got ${link.cableType}`);
}

type Test = { name: string; fn: () => void };

const tests: Test[] = [
  { name: "fiber requires SFP ports on both ends", fn: testFiberRequiresSfpOnBothEnds },
  { name: "copper requires RJ45 ports on both ends", fn: testCopperRequiresRj45OnBothEnds },
  { name: "straight vs crossover validation", fn: testStraightVsCrossoverValidation },
  { name: "auto resolves as expected", fn: testAutoResolvesAsExpected },
  { name: "auto fails when any end is SFP but other is not", fn: testAutoFailsWhenAnyEndIsSfpButOtherIsNot },
  { name: "fiber succeeds on SFP both ends", fn: testFiberSucceedsOnSfpBothEnds }
];

let passed = 0;
for (const t of tests) {
  try {
    t.fn();
    // eslint-disable-next-line no-console
    console.log(`ok - ${t.name}`);
    passed++;
  } catch (err) {
    const msg = err instanceof Error ? err.stack ?? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error(`FAIL - ${t.name}: ${msg}`);
    process.exitCode = 1;
    break;
  }
}

if (process.exitCode !== 1) {
  // eslint-disable-next-line no-console
  console.log(`\n${passed} test(s) passed`);
}
