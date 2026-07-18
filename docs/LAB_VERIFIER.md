# NetSim Lab Verifier

NetSim labs can be checked non-interactively from JSON. This makes topologies useful in CI, classroom exercises, take-home labs, and regression testing.

## Run the example

```bash
npm install
npm run lab:check -- examples/basic-connectivity.lab.json
```

Machine-readable output:

```bash
npm run lab:check -- examples/basic-connectivity.lab.json --json
```

The command returns:

- `0` when every assertion passes
- `1` when the lab is valid but one or more assertions fail
- `2` when the file or lab definition is invalid

## Lab structure

A lab contains a name, an importable NetSim topology, and assertions.

```json
{
  "name": "Gateway reachability",
  "topology": {
    "devices": [],
    "links": []
  },
  "assertions": [
    { "type": "deviceExists", "deviceId": "R1" },
    { "type": "hostname", "deviceId": "R1", "expected": "edge-r1" },
    {
      "type": "interfaceUp",
      "deviceId": "R1",
      "interfaceName": "GigabitEthernet0/0"
    },
    { "type": "ping", "from": "PC1", "targetIp": "10.0.0.1" }
  ]
}
```

## Supported assertions

### `deviceExists`

Checks that a device ID exists in the imported topology.

### `hostname`

Checks the configured hostname of a device.

### `interfaceUp`

Checks operational interface state. Set `expected` to `false` for negative tests.

### `ping`

Runs the simulator's real reachability engine, including forwarding and return-path logic. Set `expected` to `false` to verify intentional isolation.

## CI example

```yaml
- name: Verify networking lab
  run: npm run lab:check -- examples/basic-connectivity.lab.json
```

A broken route, disabled interface, missing device, or unexpected reachability condition will fail the workflow with an actionable message.
