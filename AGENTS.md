# AGENTS.md

Short operational notes for working in this repo. The full rules (architecture, simulation fidelity, commits, definition of done) live in [CONTRIBUTING.md](CONTRIBUTING.md).

## Build and test, in this order

```bash
npm ci
npm run build -w @netsim/shared      # required before tests, dev, tsc and lab:check
npm test
npx tsc -p apps/api/tsconfig.json --noEmit && npx tsc -p apps/web/tsconfig.json --noEmit
npm run lab:check -- examples/basic-connectivity.lab.json
npm run lab:check -- examples/ospf-three-routers.lab.json
```

Rebuild `@netsim/shared` after any change under `packages/shared/src`; the apps import its compiled `dist/`.

## Layout (`apps/api/src`)

- `sim/` — the single source of truth: `world.ts` facade over ARP, L2, routing, OSPF.
- `cli/` — IOS-like parser (`CliSession`) for routers and switches; `LinuxSession` for `pc` devices.
- `rpc/` — local NDJSON RPC server.
- `labs/` — two separate systems that both export a type named `LabDefinition`:
  - built-in labs: `{ id, title, description }` + `validateX(world)`, registered in `labs/index.ts`;
  - JSON-file labs: `{ name, topology, assertions }`, graded by `labs/runner.ts` (`lab:check`).
- `regression/` — scenario tests.

## Tests

- Vitest everywhere. `apps/api/vitest.config.ts` runs `src/**/*.test.ts` **and** `src/regression/*.ts`, so regression files need no `.test` suffix.
- New simulation behaviour gets a scenario test: `new World()` → `createDevice` / `createLink` → assert `canPing`, `traceRoute`, or CLI output. Model it on `regression/nextHopReachability.ts` or `regression/ospf.test.ts`.

## CLI conventions (`cli/cliSession.ts`)

- Commands are matched per mode in `executeLine` against the lowercased, whitespace-normalised line.
- Errors use the exact strings `% Invalid input detected at '^' marker.` and `% Incomplete command.`
- Add tab-completion tokens for new commands in `completionCandidates`.
- `show` commands are sorted, deterministic, and never mutate state.
- Interface names go through `canonicalInterfaceName` (`g0/1` → `GigabitEthernet0/1`).
- OSPF config changes go through `world.configureOspf`, which normalises input and rejects devices that cannot route.

## Gotchas

- On WebSocket `attach`, the device type is inferred from the ID prefix (`L3SW`, `SW`, `FW`, `SRV`, `CLOUD`, `PC`, `H`, otherwise router) in `apps/api/src/index.ts`.
- Never commit `*.tsbuildinfo`. A stale one makes `tsc` skip emitting `@netsim/shared` declarations and breaks type-checks on fresh clones.
- `npm run lab:check` runs with cwd `apps/api`; lab paths are resolved against the directory `npm` was invoked from (`INIT_CWD`).
- `@rollup/rollup-win32-x64-msvc` is an optional dependency on purpose; making it a regular dependency breaks `npm ci` on Linux.

## Privacy / Integritet

Inga privata uppgifter får committas, och de får inte stå i PR-text (titel, beskrivning eller kommentar). Det gäller:

- personlig e-post — använd GitHubs noreply-adress i stället
- telefonnummer
- postadresser och hemadresser
- namn på privatpersoner
- interna IP-adresser
- Tailscale-värdnamn
- användarnamn i sökvägar
- nycklar och tokens
- innehåll i `.env`

Kör `pre-commit install` lokalt så att gitleaks granskar staged ändringar mot `.gitleaks.toml` före varje commit.

Agenter som hittar privata uppgifter maskerar dem med platshållare och skriver aldrig ut själva värdet i en commit, en pull request eller en logg. Använd till exempel `<email>`, `<user>`, `192.168.x.y`, `10.x.y.z`, `100.64.0.x` och `<host>.ts.net`.

---

<!-- agents-handover:rules -->
## Gemensamma agentregler (multi-agent)
Gemensamma regler för alla AI-agenter (Claude Code, Codex, molnagenter m.fl.) som arbetar i det här repot.
Flera agenter kan jobba här parallellt – utgå alltid från att någon annan kan ha pågående arbete.

### Innan du börjar

1. **Läs `HANDOVER.md`** – aktuellt läge, pågående arbete, nästa steg och kända problem.
2. **Kolla läget i git:**
   ```sh
   git status
   git fetch --all --prune
   git branch -a
   gh pr list --state open
   ```
3. **Gör inte om något som redan pågår.** Finns det en öppen PR, en aktiv branch eller en rad under
   "Pågående arbete" i `HANDOVER.md` som rör samma sak – bygg vidare på den eller fråga användaren.
4. Har arbetskatalogen ocommittade ändringar som inte är dina: rör dem inte. Använd en egen
   `git worktree` eller fråga användaren.

### Under arbetet

- **En branch per uppgift**, namnformat: `agent/<verktyg>/<kort-beskrivning>`
  (t.ex. `agent/claude/fix-login-timeout`, `agent/codex/add-csv-export`).
- Registrera ditt arbete under "Pågående arbete" i `HANDOVER.md` tidigt (agent, branch, status).
- **Committa ofta** med tydliga meddelanden.
- **Fråga alltid användaren innan destruktiva git-kommandon:** `push --force`, `reset --hard`,
  `clean -fd`, radera brancher (lokalt eller remote), `rebase` av delade brancher, `checkout -- .`.

### Innan sessionen avslutas

- **Inget arbete får lämnas ocommittat.** Committa (vid behov som WIP) och **pusha alltid** din branch.
- **Uppdatera `HANDOVER.md`:** aktuellt läge, pågående arbete, nästa steg, kända problem och en ny rad
  i loggen (datum, agent, vad som gjordes).
- Om repot saknar `AGENTS.md` eller `HANDOVER.md`: skapa dem från mallen
  (https://github.com/jojo-swe/repo-template) innan du börjar.

### Repo-specifikt (autodetekterat 2026-11-04)

#### Bygga och testa

- Installera: `npm install`
- dev: `npm run dev`  (`concurrently -n api,web -c blue,green "npm run dev -w apps/api" "npm run dev -w apps/web"`)
- start: `npm run start`  (`npm run start -w apps/api`)
- build: `npm run build`  (`npm run build -w @netsim/shared && npm run build -w apps/api && npm run build -w apps/web`)
- test: `npm run test`  (`npm run test -w @netsim/shared && npm run test -w apps/api && npm run test -w apps/web`)
- Docker: `docker compose up`
- CI: GitHub Actions (`ci.yml`, `privacy-guard.yml`)

#### Struktur

- `.github/` (2 filer)
- `.windsurf/` (1 filer)
- `apps/` (55 filer)
- `docs/` (4 filer)
- `examples/` (2 filer)
- `labs/` (1 filer)
- `packages/` (8 filer)
- Filer i roten: `.dockerignore`, `.gitignore`, `.gitleaks.toml`, `.pre-commit-config.yaml`, `AGENTS.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `docker-compose.yml`, `LICENSE`, `package-lock.json`, `package.json`, `README.md`

#### Övrigt

<!-- Konventioner, miljövariabler, deploy, saker agenter ska undvika. -->
