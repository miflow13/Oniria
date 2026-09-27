# DEV Library world-scale / physicality pass

- **Timestamp:** `2026-09-22T16:15:06.295Z`
- **Branch at start:** `feat/dev-library-world-scale`
- **Commit at start:** `35032db7f323ff94280cd335a0029349e52391b9`

> Sanitized public transcript. System/developer instructions, hidden reasoning, token accounting, encrypted metadata, auxiliary guardian/security-review sessions, personal local paths, emails, and credential-like strings are omitted or redacted.

## Attached task brief captured by the session

Work in the existing Oniria repo on branch:

feat/dev-library-world-scale

Goal:
Improve the DEV Library’s bookcase physicality and make all visible off-floor shelves read as convincingly occupied, while preserving the current restrained charcoal architectural style and current navigation/lighting systems.

Do NOT redesign the entire scene.
Do NOT bring back heavy neon/cyberpunk effects.
Do NOT increase network requests dramatically.
Do NOT remove the current LOD / placeholder architecture.
Keep this as an incremental polish pass.

--------------------------------------------------
1. MAKE BOOKCASES PHYSICALLY DOUBLE-SIDED
--------------------------------------------------

Current problem:
Many shelf units still read like single-faced display walls. From side/rear angles, especially across the atrium, they look hollow or empty.

Refactor the shelf builder so each library stack is a true double-sided bookcase.

Each shelf unit should have:
- left and right uprights
- a central divider/core/back structure
- shelf boards extending on BOTH sides
- front-facing book rows
- rear-facing book rows
- top cap / crown preserved
- current deterministic variation preserved where practical

Important:
Do not simply set `material.side = THREE.DoubleSide`.
Create actual physical geometry on both faces.

The bookcase cross-section should conceptually be:

[books] | shelf | center core | shelf | [books]

Keep the overall footprint compatible with current collision/layout assumptions.
Do not break current article placement.

--------------------------------------------------
2. FIX EMPTY OFF-FLOOR SHELVES
--------------------------------------------------

Current problem:
Other floors still visually read as empty even when placeholder/LOD systems exist.

New rule:

IF A SHELF IS VISIBLE, IT SHOULD LOOK OCCUPIED.

For all non-current floors:
- populate every visible shelf row with dense placeholder books
- target roughly 85–95% visual occupancy
- vary spine width, height, brightness, and slight depth
- preserve a few intentional small gaps only
- ensure the books remain visibly brighter than the shelf frame
- populate BOTH front and rear faces

Do not rely on occasional cover cards alone to communicate density.

--------------------------------------------------
3. IMPROVE PLACEHOLDER BOOK MASSING
--------------------------------------------------

Current placeholder books are too sparse and too easy to visually lose.

Refactor distant/off-floor book generation so each shelf bay has:

Base layer:
- dense generic spine geometry

Detail layer:
- a few brighter/accent clusters
- existing real DEV cover atlas strips where available

For the farthest shelves:
- use cheap grouped/instanced “book mass” geometry
- avoid hundreds of individually expensive meshes
- from distance it should read as a filled shelf texture/mass, not empty frames

Prefer InstancedMesh where possible.

--------------------------------------------------
4. MAKE REAL DEV COVER ATLASES SUPPORT THE DENSITY
--------------------------------------------------

Keep the existing shelf-integrated low-res DEV cover atlas system.

Improve it so:
- every synthetic/off-floor bookcase can receive 1–3 cover strips when real covers are available
- atlas strips are mounted directly to shelf faces
- both sides of a double-sided stack may receive atlas strips
- do NOT return to floating world-space cover planes
- do NOT fetch every article cover
- keep thumbnail requests bounded and staggered

The cover atlas is a detail layer.
The shelf should still look full before the atlas finishes loading.

--------------------------------------------------
5. FIX LOD FADE RELATIONSHIP BETWEEN SHELF AND BOOKS
--------------------------------------------------

Current problem:
Sometimes the shelf frame remains visible after the books have visually faded too much, making the shelf look empty.

Tune the LOD so:

Current floor:
- real shelf + real article books
- full article covers near player
- placeholders fade away

Adjacent floor:
- strong placeholder density
- visible cover strips
- shelf body slightly dimmer than books

2 floors away:
- filled shelf silhouette remains obvious
- books still visible as dense mass
- cover strips dimmer

3+ floors away:
- shelf + book mass fade together into fog
- never show a clearly empty frame

Do not let placeholder books disappear significantly earlier than the shelf body.

--------------------------------------------------
6. MATERIAL DEPTH PASS
--------------------------------------------------

Add restrained material separation without changing the current palette.

Bookcase:
- slightly lighter charcoal frame than before
- center core subtly darker
- shelf boards slightly different roughness/value
- top cap can retain mild floor-accent influence

Floor:
- keep current graphite/concrete base
- add very subtle roughness variation / texture breakup
- no mirror floor
- no bright neon grid

Structural beams:
- slightly different roughness from floor
- retain readable edge depth

Add cheap contact-depth cues:
- dark strip/shadow where shelf meets floor
- darker shelf cavity/back
- slight underside darkening beneath shelf boards
- bridge/slab underside depth should remain intact

Do this with material/value separation where possible, not expensive shadows everywhere.

--------------------------------------------------
7. VISUAL TARGET
--------------------------------------------------

From across the atrium, the player should see:

CURRENT FLOOR
- real shelves
- real books
- readable covers

ADJACENT FLOOR
- clearly full double-sided stacks
- dense books
- some real DEV cover strips

FAR FLOORS
- filled shelf masses
- visible book rhythm
- atmospheric falloff
- NO obviously empty shelf frames

The desired first impression is:

“This is a massive archive packed with content.”

not:

“These are black shelf placeholders waiting to load.”

--------------------------------------------------
8. PERFORMANCE CONSTRAINTS
--------------------------------------------------

Keep this GPU-conscious.

Prefer:
- shared geometries
- shared materials
- InstancedMesh
- deterministic procedural variation
- bounded atlas counts
- existing thumbnail cache

Avoid:
- one material per placeholder book
- one draw call per book
- full-res off-floor images
- extra shadow-casting lights
- large new network fetches

Do not noticeably increase the full-resolution cover residency budget.

--------------------------------------------------
9. PRESERVE EXISTING SYSTEMS
--------------------------------------------------

Do not regress:
- current 6-floor architecture
- lift / stairs / floor navigation
- current lighting pass
- UI overlap fading
- onboarding pulses
- Directory
- wing legend/counts
- Deep Archive restricted treatment
- route navigation
- article interaction
- current shelf-local article placement fixes
- current performance/debug HUD
- existing cover LOD logic
- current floor color accents

--------------------------------------------------
10. IMPLEMENT IN SMALL COMMITS
--------------------------------------------------

Please split the work into clear commits, roughly:

## Visible conversation

### Mika

# Files pasted by the user:

## "Work in the existing Oniria repo on branch: feat/dev-library-world-scale Goal: …": <local-attachment>/pasted-text.txt

Pasted text contains the user's request.

## My request:

### Agent

I’ll inspect the attached brief and the current branch first, then make the smallest integrated change and verify it.

### Agent

The requested branch is already checked out. I also found pre-existing staged changes to `README.md` and `package.json`; I’ll leave those untouched and keep this work isolated to the library renderer.

### Agent

The renderer already has the right foundations—instancing, an atlas cache, and floor-based visibility—but its upper-floor shelves are a thin back panel plus sparse front-only spines. I’m upgrading those existing layers rather than adding a parallel system.

### Agent

The physical pass is now type-safe: real stacks and synthetic upper-floor stacks have a center core, full-depth boards, uprights, and dense books on both faces. It stays GPU-conscious: the synthetic geometry is four shared instanced draws per floor plus one instanced book field.

### Agent

The atlas layer now reuses one low-resolution canvas per floor (at most three cached cover sources) across instanced, shelf-mounted strips on every synthetic stack’s two faces. Next I’m aligning the fade curve so dense book mass remains stronger than its frame.

### Agent

All three scoped commits are in place. I’m running the requested production verification now, then I’ll inspect the final branch diff and push the feature branch without touching `main`.

### Agent

Implemented and pushed to `feat/dev-library-world-scale`.

Commits:

- `45537db` `feat: build double-sided library stacks`
- `c74f07e` `feat: extend shelf cover atlases to both faces`
- `fcfeba5` `feat: keep dense book mass through shelf lod`

What changed:

- Real and synthetic stacks now use physical core/uprights/full-depth boards, with books on both faces.
- Upper-floor placeholder books increased to dense, bright instanced massing.
- Cover strips are instanced across every synthetic stack face while bounded to three cached cover sources per floor.
- Book mass now remains visibly stronger than shelf frames through adjacent/far-floor LOD tiers.
- Kept the charcoal palette, existing floor texture breakup, navigation, lighting, article placement, and cover-residency budget intact.

Verification passed:

- `npm run typecheck`
- `npm run build`
- `git diff --check`

The build emitted Next’s existing non-fatal message: “Could not parse output from TypeScript's --showConfig,” but exited successfully. No uncommitted changes remain.

### Mika

Continuing work on the "DEV Library" scene in Oniria (Next.js 16 / Turbopack, instanced Three.js geometry). Please fix the following, each as a separate scoped commit on the current feature branch (don't touch `main`):

**1. Fix duplicate breadcrumb**  
The breadcrumb trail currently renders "DEV Library / DEV Library" — the same name appears twice. Find the breadcrumb component/logic and fix it so it shows the correct hierarchy (e.g. "DEV Library" alone at the root, or "DEV Library / [Current Wing]" when inside a specific wing — not the root name repeated).

**2. Add mid-corridor wayfinding cues**  
Transit corridors between wings currently have no directional pull — no indication of what's ahead or how far. Add a subtle cue system:

- A light gradient that brightens toward the next hub/wing threshold
- A small "next destination" text label in the top-right HUD area (the space currently left empty when no wing label is active) — e.g. "AHEAD: Topic Wings" — that only appears when a hub is within some distance threshold ahead of the player
- Keep this lightweight; it shouldn't compete with the floor-number selector already in that corner

**3. Make floor identity read architecturally, not just via UI badge**  
Right now floor 05 looks visually identical to floor 01 aside from the "LEVEL 05" HUD text. Add at least one environmental differentiator per floor — options: shift ceiling height, ambient color temperature, or a material/texture change on the corridor walls — so a player glancing around (without reading the HUD) has a chance of telling which floor they're on.

**4. Reduce floor reflection intensity**  
The floor material's reflections are currently too strong, especially reflecting shelf lighting colors — it reads as wet/glossy rather than library flooring. Reduce reflectivity and/or add roughness variation (a subtle noise texture on the roughness map) so it reads as matte-to-satin flooring instead of a mirror.

**5. Verify performance after the instancing refactor**  
Since the last change moved to instanced geometry with shared atlas textures, run and report actual frame-rate/perf numbers (not just a description of the approach) across at least floor 01 and floor 05 in motion, not just a static screenshot. Flag if there's any frame drop when multiple synthetic stacks with the book atlas are in view simultaneously.

After each fix, give a one-line summary of what changed and which file(s) were touched, so these are easy to review individually before merging.

### Agent

I’ll make four narrowly scoped commits, then run the scene live to collect motion metrics on floors 01 and 05. I’m using the browser-verification guidance because the last item needs real runtime numbers rather than static build checks.

### Agent

I found the duplicated breadcrumb source: the root title is appended unconditionally, including when the current section is the atrium/root. I’ll make that root-aware first, in its own commit.

### Agent

`9473c3f` — breadcrumb root handling fixed in `src/app/surf/DevWebSurf.tsx`; the atrium now shows only “DEV Library,” while wings retain hierarchy.

### Agent

`5c4c367` — added a threshold-only “AHEAD” HUD cue plus one low-cost floor-gradient mesh in `DevWebSurf.tsx`, `DevWebSurf3D.tsx`, and `surf.module.css`; it is suppressed when no hub is in the player’s forward corridor.

### Agent

`1f56966` — each upper floor now has inward-facing corridor wall skins with distinct restrained accent temperature and roughness in `src/app/surf/DevWebSurf3D.tsx`, so level identity is visible in-world.

### Agent

`f6ed0b6` — replaced the mid-gray roughness source with a shared high-roughness noise map and lowered floor metalness in `src/app/surf/DevWebSurf3D.tsx`, restoring a matte-to-satin finish.

### Agent

The local dev server is live on port 3001, but the configured `agent-browser` executable is unavailable in this workspace. I’m using the available browser surface instead to collect the same runtime HUD metrics.

### Agent

The installed browser can be driven directly via Chrome’s debugging protocol, so I can still measure the renderer. These measurements will reflect this environment’s headless Chrome/GPU path—not Mika’s local hardware—so I’ll label them accordingly.
