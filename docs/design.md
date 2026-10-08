# UI/UX Design: Warcraft Clone — Phase 1 (Single Skirmish Mission)

**Status:** Ready for Architecture/Coding handoff
**Author:** UI/UX Designer
**Date:** 2026-10-08
**Companion doc:** `/workspace/git/warcraft-clone/docs/PRD.md`

This document is the single source of truth for layout, visuals, and controls. It makes concrete decisions everywhere the PRD left an "implementation detail" open, so Architecture/Coding don't re-litigate UI choices. Section 8 lists every assumption/decision explicitly.

---

## 1. Overall Screen Layout

Single full-viewport 3D scene (canvas/WebGL) with a thin DOM/HTML HUD overlaid on top. No scene other than this one screen exists in Phase 1 — no menu, no loading screen beyond a bare "Loading…" state, no pause screen.

**Decision: no minimap.** The map is small, fully visible at all times (no fog of war), and camera zoom already lets the player see the whole battlefield at once. A minimap would duplicate information the player can already see for zero UX gain at this scope — it's pure dev cost. Revisit only if a future phase adds a bigger map or fog of war.

### 1.1 Wireframe — main gameplay screen

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Enemies: 4/6   Your Units: 5/6                                            │ ← top-left status readout
│                                                                            │
│                                                                            │
│                          [ 3D VIEWPORT / CANVAS ]                         │
│                     (terrain, obstacles, units, markers)                  │
│                                                                            │
│                                                                            │
│                                                                            │
│                                                                            │
│                                                                            │
│                       ┌──────────────────────────┐                        │
│                       │  [victory/defeat overlay, │                       │
│                       │   hidden until game ends] │                       │
│                       └──────────────────────────┘                        │
│                                                                            │
│                 ┌────────────────────────────────────────┐               │
│                 │  [U1][U2][U3][U4][U5][U6]  ← selected   │ ← bottom-center
│                 │   each slot: portrait + mini HP bar      │   selection panel
│                 └────────────────────────────────────────┘               │
└──────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Region spec (pixel/percentage anchors, 1920×1080 reference; scales proportionally)

| Region | Anchor | Size | Notes |
|---|---|---|---|
| 3D viewport | fills entire window | 100% × 100% | canvas sits behind/below all HUD DOM elements, `z-index: 0` |
| Status readout | top-left, 16px margin from top & left | ~260×40px | single-line text, no background box needed (text has drop-shadow for contrast over any terrain color) |
| Selected-unit panel | bottom-center, 24px margin from bottom | ~560×96px max (shrinks to content, up to 6 slots) | dark translucent panel, hidden entirely when selection is empty |
| Win/Lose overlay | centered, full viewport | 100% × 100% (dark scrim) with centered content block ~480×240px | hidden (`display:none`) until a win/lose event fires |

**Edge-scroll safe zone:** camera edge-scroll triggers in the outermost 20px band of the browser window. All HUD panels sit with ≥16px clearance from the true viewport edge specifically so hovering the HUD doesn't fight with edge-scroll pan. This is a deliberate spacing constraint for Coding, not just cosmetic.

### 1.3 HUD DOM skeleton (for Coding reference)

```html
<div id="hud-layer"><!-- pointer-events: none on container; re-enabled per-child -->
  <div id="status-readout">Enemies: 4/6   Your Units: 5/6</div>

  <div id="selection-panel" class="hidden">
    <!-- repeated per selected unit, max 6 -->
    <div class="unit-slot" data-faction="player" data-type="melee">
      <div class="portrait"></div>
      <div class="hp-bar"><div class="hp-fill" style="width:64%"></div></div>
    </div>
  </div>

  <div id="end-state-overlay" class="hidden">
    <div class="headline">VICTORY</div>
    <div class="subtext">All enemy forces destroyed.</div>
    <div class="replay-hint">Refresh the page to play again.</div>
  </div>
</div>
```

---

## 2. HUD — What's Persistent and Why

Kept deliberately minimal; every element is justified against a specific PRD requirement.

| Element | Content | Justifies |
|---|---|---|
| **Status readout** (top-left) | `Enemies: X/Y` · `Your Units: X/Y` | PRD US-7/US-8 need the player to track progress toward win/lose without manually counting models on screen. |
| **Selected-unit panel** (bottom-center) | Up to 6 slots (max roster size), each: faction-colored portrait silhouette by type + mini HP bar | PRD §4.3 "selected units show a visible selection indicator" — the viewport ring (§3) is the in-world indicator; this panel is the *information* readout (what exactly is selected and its HP), standard RTS convention. |
| **Win/Lose overlay** | Full-screen banner, see §6 | PRD §4.7 win/lose states must be "clear." |

Explicitly **not** included, per PRD scope: minimap, resource bar, build/production UI, minimap alerts, tech/ability bar, timer, score. None of these map to an in-scope requirement.

**Selection panel behavior:**
- 0 units selected → panel is hidden (not just empty — removed from layout so it never blocks the viewport).
- 1 unit selected → single enlarged slot plus a text line: `Melee Infantry — HP 32/50`.
- 2–6 units selected → one slot per unit, compact, each with its own mini HP bar. (Roster cap of 6 per side means this never needs scrolling/pagination.)
- Nice-to-have, non-blocking: clicking a slot in this panel re-selects just that one unit (classic RTS control group convenience). Not required for launch.

---

## 3. Unit Visual Language

Placeholder geometry only (capsules/boxes), per PRD §9/Risks — the following still gives unambiguous faction/type/state readability at RTS camera distance.

### 3.1 Faction (player vs. enemy)
- **Ground disc** under every unit's feet, in the solid faction color (always visible, not just when selected): player = **Azure blue**, enemy = **Ember orange-red**. This is the primary faction read — it's readable even at max zoom-out, when body color/shape detail is too small to parse.
- Secondary cue: the unit body material is tinted toward the same faction color (a blue-grey vs. a red-grey capsule), so faction is still readable in a tight zoomed-in shot where the ground disc may be occluded by the camera angle.
- Blue vs. orange was chosen specifically (not red vs. green) to stay legible for red-green colorblind players.

### 3.2 Unit type (melee vs. ranged)
Silhouette-based, since there's no animation budget:
- **Melee infantry**: shorter, wider capsule body + a stubby box prop ("shield") offset to one side at hip height. Bulkier overall silhouette.
- **Ranged infantry**: taller, narrower capsule body + a thin long box prop ("bow/staff") held forward, extending visibly past the body outline.
- This gives a distinguishable outline at a glance from top-down RTS camera distance without needing textures, icons, or animation.
- The selection panel portraits (§2) use the same silhouette distinction (bulky icon vs. slim icon) so the HUD and viewport agree visually.

### 3.3 Selection indicator
Two concentric rings on the ground at each unit's base, layered on top of the faction disc (§3.1):
- Inner ring = faction color disc (always present, §3.1).
- Outer ring = **bright white/yellow** (`#F5E663`), only rendered while the unit is selected. Chosen because it contrasts against both the blue and orange faction colors and against the green terrain — it will never blend into the background regardless of which side owns the unit.
- No pulsing/animation required (static ring is sufficient and cheaper); a subtle pulse (opacity 80%↔100%, ~1.5s cycle) is a nice-to-have polish pass, not required.

### 3.4 HP representation
- Every unit (both factions) has a small floating HP bar, billboarded to always face the camera, anchored just above the unit's head.
- **Always rendered**, not just on damage or on hover — with only ≤12 units ever on screen, constant HP visibility is core RTS feedback for focus-fire decisions (PRD US-4/US-5), not clutter.
- At full HP the bar renders thin and muted (low-contrast, de-emphasized) so an undamaged battlefield doesn't look busy; once a unit takes any damage the bar becomes brighter/slightly thicker so damaged units visually pop out.
- Fill color by HP percentage: **green** `#4CAF50` above 60%, **yellow** `#E0B23A` 25–60%, **red** `#D9453D` below 25%. Depletion is an animated tween (~150ms) on each damage tick, not an instant snap — this is what makes damage-over-time visible per PRD US-4's acceptance criterion.
- Selected units' HP bars additionally get a thin white outline stroke, so they stay easy to find even in a cluttered multi-unit fight.

### 3.5 Death
- At 0 HP: unit plays a quick scale-to-zero + fade (~300ms), then is removed from the scene entirely along with its HP bar, selection ring, and portrait slot (if it was selected, it silently drops out of the selection panel).
- No corpse/decal persists afterward (keeps the scene simple, matches "visual fidelity is not a Phase 1 criterion").

---

## 4. Interaction Spec / Control Scheme

Exhaustive input → action mapping. Anything not listed below is a no-op in Phase 1.

### 4.1 Mouse

| Input | Context | Action |
|---|---|---|
| Left click (down+up, <5px movement, on a player unit) | always | Select that unit only; clears prior selection |
| Left click (down+up, <5px movement, on empty ground/obstacle/enemy unit) | always | Deselect all (clicking an enemy with plain left-click does **not** select it — only player units are left-click-selectable) |
| Left click + drag (≥5px movement before mouse-up) | always | Box-select: select every **player** unit whose model falls inside the drawn screen-space rectangle at mouse-up. Enemy units are never included, per PRD US-2. Replaces prior selection. |
| Shift + left click on a player unit | *nice-to-have, non-blocking* | Toggle that unit in/out of the current selection, instead of replacing it |
| Shift + left-click-drag | *nice-to-have, non-blocking* | Add the box-selected player units to the current selection instead of replacing it |
| Right click on an enemy unit | ≥1 unit selected | Issue attack order on that enemy to all selected units (§5.2) |
| Right click on anything else (walkable ground, obstacle, friendly unit, out-of-bounds-but-near-edge) | ≥1 unit selected | Issue move order: project the click to the nearest walkable point and move all selected units there (§5.1). This means a stray right-click on an obstacle or ally still does something sensible instead of nothing. |
| Right click (any target) | 0 units selected | No-op |
| Scroll wheel | always | Zoom (dolly camera distance in/out along its fixed viewing vector), clamped to a min distance (tight tactical view) and max distance (whole map + small margin visible) |

### 4.2 Keyboard

| Input | Action |
|---|---|
| Arrow keys **or** WASD (both supported) | Pan camera across the ground plane, clamped to map bounds |
| Mouse cursor within 20px of any viewport edge | Edge-scroll pan in that direction, same clamping as keyboard pan |
| Esc | *Nice-to-have, non-blocking*: deselect all (mirrors "click empty ground," pure convenience) |

**Explicitly not implemented:** no rotation keys (e.g. Q/E), not even stubbed — PRD §4.6 fixes a single isometric viewing angle for Phase 1.

### 4.3 Cursor feedback states

Cursor shape only changes when it's actually informative — i.e., only when there's an active selection that could act on what's under the pointer. Three states, defined as small inline SVG data-URI cursors (no network asset, keeps load time low):

| State | When | Cursor |
|---|---|---|
| Default | 0 units selected (regardless of hover target), or hovering over HUD chrome | System default arrow |
| Move-available | ≥1 unit selected, hovering walkable terrain/obstacle/ally (i.e., anywhere a right-click would issue a move order) | Small white chevron/arrow cursor |
| Attack-available | ≥1 unit selected, hovering an enemy unit | Small red crosshair cursor |

No separate "blocked" cursor state — since right-click always resolves to *some* valid move target (§4.1), there's no invalid-target case to signal.

---

## 5. Command & Combat Feedback

### 5.1 Move order feedback
- On issuing a move order, a single ground marker (expanding ring + small downward chevron, neutral white/cyan) appears at the exact clicked/resolved point — one shared marker regardless of how many units were selected, since they're loosely clustering toward one target point, not individually routed (PRD §4.4, no formation logic).
- Marker animates: scales in over ~0.2s, holds briefly, fades out over ~0.3s. Total lifetime ~0.5s. Purely cosmetic, never persists.
- Each selected unit's own in-world selection ring (§3.3) is unaffected — this marker is separate, drawn at the destination, not on the units.

### 5.2 Attack order feedback
- On issuing an attack order, the targeted enemy unit gets a **pulsing red ring** around its base (distinct from the player's white/yellow selection ring) — this is the "you are being focused" indicator, visible as long as at least one currently-selected unit still has it as an active order target.
- The ring clears when: the target dies, or the player issues a new order elsewhere with those units.
- Selected attacking units path toward the target (ranged units stop once in range; melee units close to adjacent) using the same movement system as move orders — no separate visual treatment needed en route.

### 5.3 Combat feedback
- Each damage tick animates the target's HP bar fill down (~150ms tween, see §3.4) rather than snapping instantly — this is the primary signal that combat is damage-over-time, not instant-kill (PRD US-4 acceptance criterion).
- *Nice-to-have, non-blocking*: a small floating "-8" style damage number rises and fades (~600ms) above the unit on each tick. Cheap to add and reinforces the discrete-tick read, but the HP bar tween alone already satisfies the PRD requirement, so this is optional polish, not a blocker.
- Death: per §3.5, scale-to-zero + fade, then full removal (model, HP bar, ring, selection-panel slot, collision).

---

## 6. Win / Lose Presentation

- Trigger: the instant the last enemy (Victory) or last player unit (Defeat) reaches 0 HP — no delay, no "mission summary" screen (out of scope).
- Full-viewport dark scrim fades in over ~0.5s (rgba(0,0,0,0.75)) above the 3D scene, below nothing (topmost layer).
- Centered content block:
  - Headline, large (64px) bold: **"VICTORY"** in a warm gold/green tone, or **"DEFEAT"** in a desaturated dark red tone.
  - Subtext (18px, muted light grey): `All enemy forces destroyed.` or `Your forces have been wiped out.`
  - Replay hint (14px, more muted): `Refresh the page to play again.` — this is the entire "restart" UX per PRD §4.7/§7 assumption 6; no button, no JS reload action needed.
- Behavior on trigger: all unit orders are disabled (clicks/right-clicks on the viewport become no-ops) — the mission is over, there is nothing left to command. Camera pan/zoom **remains active** so the player can look around the aftermath; this costs nothing to leave on and is a small moment of polish.
- The HUD status readout and selection panel stay visible underneath the scrim (dimmed by the overlay) rather than being torn down — simplest implementation, and it's reasonable for the player to still see the final tally (e.g. "Your Units: 3/6").

---

## 7. Visual Style Direction

Goal: read clearly at a fixed, somewhat zoomed-out RTS camera angle, with zero custom art assets.

### 7.1 Palette

| Role | Color | Hex |
|---|---|---|
| Player faction | Azure blue | `#3B82C4` |
| Enemy faction | Ember orange-red | `#C0472B` |
| Terrain (grass) | Muted olive green | `#5A6B47` |
| Terrain (dirt patches) | Warm brown | `#7A6450` |
| Obstacles — rocks | Cool grey | `#8A8A85` |
| Obstacles — trees | Dark green | `#2F4A33` |
| Selection ring | Bright white-yellow | `#F5E663` |
| Attack-target ring | Alert red (pulsing) | `#E8463B` |
| HP bar — healthy | Green | `#4CAF50` |
| HP bar — wounded | Yellow | `#E0B23A` |
| HP bar — critical | Red | `#D9453D` |
| HUD panel background | Charcoal, 85% opacity | `#1B1F24` |
| HUD text | Off-white | `#E8E8E8` |
| Victory headline | Warm gold | `#D4AF37` |
| Defeat headline | Desaturated dark red | `#8C3A3A` |

Faction colors (blue/orange) were deliberately chosen over the more conventional red/green or red/blue to stay distinguishable for red-green colorblind players, and to contrast cleanly against the olive-green terrain from any zoom level.

### 7.2 Typography
- System font stack only (`-apple-system, Segoe UI, Roboto, sans-serif`) — no webfont loading, keeps the <5s interactive-load NFR trivially satisfied.
- HUD body text: 14px. Selection-panel HP numeric readout: 16px bold. Win/Lose headline: 64px bold. Win/Lose subtext: 18px regular.

### 7.3 Camera & readability
- Fixed pitch (~50° down from horizontal) and fixed yaw (camera always faces one constant compass direction) — classic elevated 3/4 RTS view, matching PRD §4.6 (no rotation).
- Zoom is a dolly (camera distance change along its fixed view vector), not an FOV change, so unit/terrain proportions stay stable while zooming.
- Zoom clamps: minimum distance keeps a unit at roughly 1/6th of viewport height (close tactical read); maximum distance is bounded by the map's own footprint so the player can never zoom out past "whole map plus a small margin" — there's nothing beyond the map to see anyway.
- Pan clamps to map bounds at the current zoom level (PRD §4.6 "camera must stay within map bounds") — the camera's look-at target is restricted so the visible frustum footprint never crosses the terrain edge.
- Lighting: one directional "sun" light fixed at the same angle as the camera's yaw (so shadows read consistently) + flat ambient fill, no dynamic time-of-day — simplest option that still gives units visible grounding shadows for depth perception.

---

## 8. Design Assumptions / Decisions Made

In addition to PRD §7, the following UI-specific decisions were made to keep this doc implementation-ready without blocking on further input:

1. **No minimap** — full visibility + small fixed map makes it redundant (§1).
2. **HP bars are always visible** for all units, not gated behind hover/selection/damage — treated as core RTS feedback at this unit count, not clutter.
3. **Right-click always resolves to a valid order** (attack if on an enemy, otherwise move to the nearest walkable point) — there is no "invalid click, nothing happens" case, which simplifies both the cursor-feedback spec (§4.3) and the player's mental model.
4. **Single shared move marker** per order (not one per unit) — consistent with the PRD's "loose clustering, no formation logic" stance (§4.4/§7-4).
5. **Esc-to-deselect and click-to-reselect-from-panel** are called out explicitly as non-blocking nice-to-haves, matching the PRD's own style of flagging shift-click as nice-to-have (§4.3) — these are trivial, low-risk additions, not scope expansion, and should be dropped first if time is short.
6. **Damage numbers are optional polish** — the HP-bar tween alone already satisfies the "damage over time is visible" acceptance criterion (US-4), so floating damage text is a nice-to-have, not required.
7. **Custom cursors are inline SVG data-URIs**, not image assets — avoids any extra network request, keeping the <5s interactive-load NFR trivial to hit.
8. **Win/Lose freezes orders but leaves camera pan/zoom active** — lets the player look around the finished battlefield at no implementation cost, since camera control has no gameplay side effects to disable.
9. **Selection panel caps at 6 slots** — matches the PRD's hard roster cap per side (4–6), so no scrolling/overflow UI is ever needed.
10. Faction color choice (blue/orange rather than red/green or red/blue) is a deliberate colorblind-accessibility and terrain-contrast decision, not an arbitrary one — flagging it in case a future phase wants to introduce team-customizable colors, which would need to preserve this contrast property.
