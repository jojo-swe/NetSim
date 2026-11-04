# HANDOVER.md

Överlämning mellan agenter och sessioner. Läs innan du börjar, uppdatera innan du slutar.

## Aktuellt läge

*Senast inventerat 2026-11-04 av Claude (Cowork).*

Projekt: NetSim is a CCNA-first, lab-driven **network simulator** with an IOS-like CLI and a modern drag-and-drop topology UI.

- Huvudbranch: `main`
- Senaste commit på `main`: 2026-11-01 `1935c18` Add privacy guard checks for the checked-out tree (#10)
- Öppna PR:er: 7
- Andra brancher på remote: 10

## Pågående arbete

| Agent/vem | Branch | Status | Beskrivning |
|-----------|--------|--------|-------------|
| app/dependabot | `dependabot/npm_and_yarn/multi-bbf9670a95` | PR #11 öppen, uppdaterad 2026-11-01 | build(deps): bump qs and express |
| app/dependabot | `dependabot/npm_and_yarn/vite-6.4.5` | PR #9 öppen, uppdaterad 2026-10-26 | build(deps-dev): bump vite from 6.4.1 to 6.4.5 |
| app/dependabot | `dependabot/npm_and_yarn/undici-7.30.1` | PR #8 öppen, uppdaterad 2026-10-26 | build(deps-dev): bump undici from 7.28.0 to 7.30.1 |
| app/dependabot | `dependabot/npm_and_yarn/body-parser-1.20.9` | PR #7 öppen, uppdaterad 2026-10-26 | build(deps): bump body-parser from 1.20.4 to 1.20.9 |
| app/dependabot | `dependabot/npm_and_yarn/vitest-4.1.11` | PR #5 öppen, uppdaterad 2026-10-26 | build(deps-dev): bump vitest from 4.1.10 to 4.1.11 |
| app/dependabot | `dependabot/npm_and_yarn/proxy-addr-2.0.8` | PR #4 öppen, uppdaterad 2026-10-15 | chore(deps): bump proxy-addr from 2.0.7 to 2.0.8 |
| app/dependabot | `dependabot/npm_and_yarn/source-map-js-1.2.2` | PR #3 öppen, uppdaterad 2026-10-15 | chore(deps-dev): bump source-map-js from 1.2.1 to 1.2.2 |
| Cursor | `cursor/privacy-guard-f04f` | branch utan PR, senaste commit 2026-11-01 | Add privacy guard checks for the checked-out tree |
| okänd (människa/agent) | `agent/ospf-control-plane` | branch utan PR, senaste commit 2026-07-18 | Correct OSPF route expectations |
| okänd (människa/agent) | `agent/lab-verifier` | branch utan PR, senaste commit 2026-07-18 | Document executable lab assertions |

## Nästa steg

- Granska och besluta om de öppna PR:erna ovan (merga eller stäng).
- Gå igenom brancher utan PR: öppna PR, merga eller radera (fråga användaren innan radering).
- Fyll på "Bygga och testa" i AGENTS.md om något saknas eller är fel.

## Kända problem

- Inga dokumenterade ännu.

## Senaste commits

- 2026-11-01 `1935c18` Add privacy guard checks for the checked-out tree (#10)
- 2026-10-26 `8e141c5` docs(changelog): add OSPF CLI and build fixes
- 2026-10-26 `bf03db3` docs: record OSPF CLI in changelog and spec
- 2026-10-26 `3fd20aa` docs: refresh README and document OSPF lab verification
- 2026-10-26 `04cae80` docs: add AGENTS.md with build order and conventions
- 2026-10-26 `afd4dab` build(docker): install and build @netsim/shared in images
- 2026-10-26 `811061c` ci: verify the OSPF example lab
- 2026-10-26 `a442215` feat(labs): add ospfNeighbor assertion and OSPF example lab
- 2026-10-26 `0958af4` feat(cli): configure and inspect OSPF from the IOS CLI
- 2026-10-26 `d69210d` test(api): include labs in coverage and drop stale test counts

## Logg

| Datum | Agent | Vad som gjordes |
|-------|-------|-----------------|
| 2026-11-04 | Claude (Cowork) | Lade till AGENTS.md, HANDOVER.md och CLAUDE.md; inventerade PR:er, brancher och commits. |
