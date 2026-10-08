# PRD: Warcraft Clone — Phase 1 (Single Skirmish Mission)

**Status:** Draft for architecture handoff
**Author:** Systems Analyst
**Date:** 2026-10-08
**Repo:** `dalali/warcraft-clone` (local: `/workspace/git/warcraft-clone`)

---

## 1. Overview / Vision

Long-term vision: a browser-based, 3D clone of Warcraft 1 — base building, a tech tree, a resource economy, a campaign, and eventually multiplayer.

**Phase 1 is not a slice of that vision's features — it is a vertical slice of the core RTS feel.** The only question Phase 1 answers is: *does moving a group of 3D units around a terrain and fighting another group of units feel like an RTS, in a browser, at acceptable performance?* Everything else is deferred.

Phase 1 ships one thing: a single, fixed skirmish mission on one map, where the player selects and moves units, fights an enemy force, and wins or loses. No meta-game around it (no menu progression, no save/load, no mission select — one mission is the whole game for now).

### 1.1 Phase 1 Scope Boundary

**IN:**
- One hand-authored map (fixed terrain, fixed unit placements)
- Two unit types: one melee infantry, one ranged infantry (see §4.2)
- A small, fixed roster of player units (4–6) and enemy units (4–6)
- Click-to-select / drag-box-select / move-order / attack-order interactions
- Basic pathfinding with obstacle/terrain avoidance (not formation movement)
- Melee and ranged combat, HP, damage, death
- One explicit win condition (destroy all enemy units) and one explicit lose condition (all player units destroyed)
- Camera pan/zoom/rotate (or fixed-angle pan/zoom — see §4.6)
- Runs entirely client-side in the browser; no gameplay logic on the server

**OUT (explicitly, for later phases):**
- Campaign / multiple missions / mission select screen
- Tech tree, unit upgrades, buildings, construction
- Resource gathering/economy (gold, lumber, food/supply cap)
- Multiplayer (local or networked)
- Any AI opponent behavior beyond reactive combat (see §2 — this is the crux decision)
- Fog of war / vision mechanics
- Save/load, replays, match history
- Sound design, music, cinematics, voice lines
- Mobile/touch support
- Accounts, persistence, backend game state

---

## 2. The AI-Opponent Scoping Decision

**Decision: Phase 1 has NO AI opponent. The enemy force is a static, non-seeking, reactive garrison.**

Concretely:
- Enemy units spawn at fixed positions on the map and **do not move, patrol, path, path toward the player, or make decisions** until a condition below is met.
- An enemy unit becomes **reactive-only** when either (a) it takes damage, or (b) a player unit enters its fixed aggro radius. On trigger, it does exactly one thing: attack the triggering/nearest player unit within its weapon range, using the same move-and-attack logic player units use (it is not pathing toward a goal, it is responding in place or chasing the single unit that aggroed it, within a bounded leash range of its spawn point, using the same movement/combat primitives already built for player units — no separate AI system).
- There is no strategic AI: no build orders (no buildings to build anyway), no target prioritization logic, no retreat/regroup behavior, no squad coordination. Each enemy unit's "AI" is a 2-state machine: **idle-at-post** → **engage-and-leash**. That's the entire ruleset.

**Rationale:**
1. **It is still a recognizable skirmish, not a sandbox.** A fixed enemy camp that fights back when provoked gives the player an actual objective (clear the camp), actual stakes (lose units, maybe lose the mission), and actual tactical decisions (focus fire, pull one unit at a time, use ranged units to kite) — the core RTS loop — without writing any pathfinding-for-AI, decision trees, or difficulty tuning.
2. **It reuses, not duplicates, engine work.** The leash/engage behavior is implemented with the exact same movement and combat code written for player-controlled units (§4.4, §4.5). There is no separate "AI module" to design, test, or balance in Phase 1 — this is the single biggest scope and risk reducer in this PRD.
3. **Two player-controllable sides was considered and rejected.** It would validate movement/combat parity but produces a tech demo, not a game — there is no win/lose stakes, no single-player loop to test fun, and it doesn't match "skirmish mission" framing the user asked for. A real player needs something to beat.
4. **Fully "dumb" static dummies that never fight back was also considered and rejected.** Target-practice with no retaliation doesn't exercise combat symmetry (HP/damage/death on both sides) and feels trivial, not like Warcraft.
5. **A roaming/patrolling or strategic AI was rejected as out of scope for Phase 1** per the user's explicit instruction ("no AI opponent complexity beyond what a minimal skirmish needs") — patrol routes, target selection heuristics, and difficulty curves are real design and engineering surface area that adds no signal to the "does this feel like an RTS" question Phase 1 exists to answer.

This decision is the load-bearing scope cut of this PRD. Architecture and coding phases should treat "enemy AI" as literally the same movement/combat/leash-radius system already needed for player units, parameterized with a different trigger (reactive vs. player-commanded), not a new subsystem.

---

## 3. Target Users / Context of Use

- **Primary user: the project owner/developer**, playtesting locally in a desktop browser to answer one question — does core unit movement and combat feel good? This is a technical/design validation build, not a public release.
- **Secondary (future) user**: a casual RTS player trying a single bite-sized skirmish, familiar with Warcraft/StarCraft-style click-to-select/click-to-move/right-click-to-attack conventions. Phase 1 should honor those conventions since that's the mental model being validated, but no onboarding/tutorial is in scope — the user testing it already knows RTS controls.
- **Context of use**: desktop/laptop browser, mouse + keyboard, single sitting of a few minutes (the mission should be completable in roughly 1–5 minutes given the small unit counts).

---

## 4. Functional Requirements

### 4.1 The Map
- One fixed, hand-authored 3D terrain, bounded and finite (not infinite/proc-gen).
- Flat-to-gently-varied terrain is sufficient; no requirement for cliffs/elevation gameplay in Phase 1 (assumption, §7).
- Static obstacles (e.g., trees, rocks) that block movement and pathing, to give pathfinding something real to solve. At least a handful of obstacles — enough that straight-line movement would visibly fail without avoidance.
- No fog of war — the whole map is visible at all times (assumption, §7, carried over from the "no AI complexity" simplification: no vision system needed since there's no scouting mechanic).

### 4.2 Units
Two unit types only:

| Type | Role | Example stats (tunable) |
|---|---|---|
| Melee infantry | Short-range, higher HP/damage | HP 50, Dmg 8, Range 1 (adjacent), Speed baseline |
| Ranged infantry | Long-range, lower HP | HP 30, Dmg 5, Range 4 tiles, Speed baseline |

- Player force: 4–6 units, a mix of both types (exact mix is a design/balance decision made during implementation, not blocking this PRD).
- Enemy force: 4–6 units, a mix of both types, placed as a "camp" cluster on the map.
- No unit production, no unit selection/purchase screen — the roster is fixed and spawns at mission start.

### 4.3 Unit Selection
- Left-click a single unit to select it (deselects others).
- Left-click-drag to box-select multiple units.
- Shift-click to add/remove a unit from the current selection (nice-to-have, not launch-blocking — see §7 assumptions).
- Selected units show a visible selection indicator (highlight ring/outline).
- Clicking empty ground deselects all.

### 4.4 Movement
- Right-click (or designated move command) on walkable terrain issues a move order to all currently selected units.
- Units pathfind around static obstacles and other units — no walking through trees/rocks, no permanently getting stuck on them.
- Multiple selected units moving to the same point do not need flocking/formation logic — arriving and loosely clustering near the target point is sufficient (no requirement to avoid unit-on-unit overlap precisely, see §7).
- A unit already in combat that receives a move order breaks off combat and moves (standard RTS behavior).

### 4.5 Combat
- Right-click (or designated attack command) on an enemy unit issues an attack order to selected units.
- Melee units must be adjacent to deal damage; ranged units deal damage from within their range without needing to close distance, and will path to get in range if not already.
- Combat resolves in discrete damage ticks (exact timing/formula is an implementation detail, not blocking this PRD) — the requirement is that damage-over-time, not instant-kill, is visible to the player.
- Units have HP; HP depletes from incoming damage; a unit at 0 HP dies and is removed from play (model, selection, and collision).
- Enemy units engage per the reactive/leash rule in §2: idle until provoked (attacked or a player unit enters aggro radius), then fight back and chase within a bounded leash distance of their spawn point, using the same move+attack logic as player units.
- No friendly fire, no splash damage, no unit abilities/spells — direct single-target damage only.

### 4.6 Camera
- Pan (keyboard arrows or edge-scroll) and zoom (scroll wheel) at minimum.
- Rotation is a nice-to-have, not required for Phase 1 (assumption, §7) — a fixed isometric-style viewing angle with pan/zoom is sufficient to validate the core loop.
- Camera must stay within map bounds (no panning into the void).

### 4.7 Win / Lose Conditions
- **Win:** all enemy units destroyed → display a clear "Victory" state, gameplay stops (input to units disabled or units simply have no remaining targets — implementation detail).
- **Lose:** all player units destroyed → display a clear "Defeat" state, gameplay stops.
- No scoring, no timer, no retry/restart UI required for Phase 1 beyond a page refresh (assumption, §7).

### 4.8 Core Interaction Loop (summary)
1. Mission loads with player units and enemy camp placed on the map.
2. Player selects unit(s).
3. Player issues move or attack orders via right-click.
4. Units path, move, and fight; enemy camp units react when provoked.
5. Loop continues until all enemies are dead (win) or all player units are dead (lose).
6. End state is displayed; mission ends (no further meta-game).

---

## 5. User Stories & Acceptance Criteria

**US-1: Select a single unit**
- As a player, I click on one of my units so I can give it orders.
- AC: Clicking directly on a player unit selects only that unit and shows a visible selection indicator. Clicking elsewhere deselects it.

**US-2: Select multiple units via box-select**
- As a player, I drag a selection box over several of my units so I can command them together.
- AC: Dragging a box that overlaps N player units selects exactly those N units (enemy units are never included in a player box-select). All selected units show the selection indicator.

**US-3: Move selected units**
- As a player, I right-click an empty point on the map so my selected units walk there.
- AC: All selected units begin moving toward the clicked point, routing around any obstacle directly in their path, and stop within a reasonable distance of the target point (they do not require pixel-exact overlap). A unit that would otherwise walk through a static obstacle instead visibly routes around it.

**US-4: Attack an enemy unit**
- As a player, I right-click an enemy unit so my selected units attack it.
- AC: Selected units move into range of the target (melee: adjacent; ranged: within ranged distance) and begin dealing damage on a recurring tick. The target's HP visibly decreases. If the target dies before being reached, the attacking units stop or retarget to nothing (no crash/freeze).

**US-5: Enemy camp reacts when provoked**
- As a player, I attack one enemy unit in the camp so I can test that the camp fights back.
- AC: The attacked enemy unit (and only units within its aggro radius, if applicable) stops idling and attacks back using the same movement/combat rules as player units. Enemy units that were never provoked and are out of aggro range remain idle at their spawn point.

**US-6: Unit dies and is removed**
- As a player, I reduce a unit's HP to 0 so it is removed from the fight.
- AC: When any unit's HP reaches 0, it is removed from the map, can no longer be selected or targeted, and no longer blocks movement/collision at its former position.

**US-7: Win the mission**
- As a player, I destroy every enemy unit so I complete the mission.
- AC: The moment the last enemy unit's HP reaches 0, a Victory state is shown and no further combat/orders are needed to progress (the mission is over).

**US-8: Lose the mission**
- As a player, I let all my units die so I see a clear failure state.
- AC: The moment the last player unit's HP reaches 0, a Defeat state is shown.

**US-9: Camera control**
- As a player, I pan and zoom the camera so I can see different parts of the map.
- AC: Keyboard (or edge-scroll) pans the camera within map bounds; scroll wheel zooms in/out within a defined min/max range; the camera never shows area beyond the map edge.

---

## 6. Non-Functional Requirements

- **Performance:** target a minimum of 30 FPS, with 60 FPS as the goal, on a mid-range laptop/desktop GPU, with the full Phase 1 unit count on screen (≤12 units total) plus terrain and obstacles.
- **Browser support:** latest stable Chrome, Firefox, and Edge (desktop). Safari is a nice-to-have, not a hard requirement for Phase 1 (assumption, §7). No mobile/touch requirement.
- **Load time:** mission should be interactive (units selectable/controllable) within ~5 seconds on a typical broadband connection, on first load.
- **Client/server split:** all gameplay simulation (movement, pathfinding, combat, win/lose logic) runs **client-side in the browser**. The server's role in Phase 1 is limited to serving static assets (HTML/JS/3D assets) — it does not run game logic, does not need to track game state, and does not need a database. This constraint is a requirement for the architecture phase, not a suggestion.
- **No persistence requirement:** refreshing the page restarts the mission from scratch; no save state is required.
- **Determinism/replayability:** not required — Phase 1 does not need deterministic simulation, replays, or seeded randomness guarantees.

---

## 7. Assumptions

Made explicitly so the architecture/coding phases aren't blocked:

1. Terrain is flat or gently varied — no elevation-based gameplay (line-of-sight blocking by height, ramps, cliffs) in Phase 1.
2. No fog of war; full map visibility at all times.
3. Shift-click add-to-selection is nice-to-have; box-select and single-click are the required minimum.
4. Loose clustering on multi-unit move orders is acceptable; no formation/flocking algorithm required.
5. Camera rotation is not required; pan + zoom at a fixed viewing angle is sufficient.
6. No restart/retry UI is required; a browser refresh is an acceptable way to replay the mission.
7. Exact unit stats (HP/damage/range/speed numbers) and the exact player/enemy unit mix are tunable during implementation and are not a blocking decision for this PRD — the type distinction (melee vs. ranged) and rough roster size (4–6 per side) are the binding requirements.
8. Safari support is best-effort, not required, for Phase 1.
9. "3D characters" means 3D-rendered models/units on a 3D terrain viewed from an RTS camera angle — it does not imply any specific animation fidelity (idle/walk/attack/death animations are desirable but their quality bar is an implementation/art decision, not specified here).
10. Combat damage ticks, pathfinding algorithm choice, and aggro-radius/leash-distance values are implementation details for the architecture/coding phases, not requirements fixed by this PRD.

---

## 8. Dependencies

- **3D rendering/engine library**: not chosen here by design — this is an Architecture-phase decision. This PRD constrains that choice only via the non-functional requirements in §6 (must render 3D units on 3D terrain in-browser, 30+ FPS target, runs client-side).
- **Existing repo scaffold**: Node.js + Express + Docker Compose is already in place (`server.js`, `docker-compose.yml`, `run.sh`) and is expected to continue serving as the static asset host; no backend framework change is implied by this PRD.
- No external/third-party service dependencies (no auth provider, no database, no multiplayer backend) in Phase 1.

---

## 9. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Pathfinding around obstacles is harder than it looks and eats the whole phase | Keep the obstacle count and map size small; a grid-based or navmesh approach with a well-known algorithm (A*) is sufficient — no custom/novel pathfinding research needed. |
| "Reactive AI" scope creeps into real AI (patrol, targeting heuristics) during coding | This PRD's §2 is explicit and binding: 2-state machine only (idle → engage-and-leash), reusing player movement/combat code. Any addition beyond that is a Phase 2 request, not a Phase 1 bug. |
| 3D asset creation (models/animations) becomes a bottleneck | Phase 1 can use simple primitive/placeholder geometry (capsules, boxes) or free/stock low-poly assets — visual fidelity is explicitly not a Phase 1 success criterion. |
| Performance target missed with "real" 3D models | Keep unit count capped at 12 total and terrain simple; defer any optimization work (LOD, instancing) unless the target is actually missed in testing. |

---

## 10. Out of Scope (Future Phases)

- Multiple missions, mission select, campaign narrative
- Resource economy (gold/lumber/food), buildings, construction, tech tree, unit upgrades
- Strategic/adaptive AI opponent (patrol routes, target prioritization, build orders, difficulty levels)
- Multiplayer (local split-screen or networked)
- Fog of war / vision / scouting
- Save/load, replays
- Sound, music, voice, cinematics
- Mobile/touch input
- Accounts, user persistence, leaderboards, matchmaking

---

## 11. Open Questions

None blocking — all decisions needed to start Architecture/Design have been made above (see §7 for the explicit assumptions covering the lower-priority ambiguities). The one item worth flagging for the Architecture phase to confirm rather than re-litigate:

- Whether pathfinding should be grid-based or navmesh-based is an architecture decision, not a product one — either satisfies the requirements in §4.4 and §9.
