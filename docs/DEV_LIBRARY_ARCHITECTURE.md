# DEV Library Architecture & Cleanup Map

> Living engineering reference for the Oniria DEV Library.
>
> Branch during creation: `feat/cinematic-dream-rendering`
>
> This document answers one question: **what does what?**
>
> It should be updated whenever a major library system is extracted, moved, or given a new owner.

---

# 1. Why this document exists

The DEV Library grew quickly during the hackathon.

A large amount of behavior accumulated inside `DreamWorld3D.tsx` because that was the fastest place to prototype:

- world rendering
- movement
- shelf rendering
- book interaction
- haze
- route visuals
- reactive effects
- reading animation
- audio
- cleanup

That was useful during experimentation, but it also made the renderer increasingly difficult to reason about.

The cleanup strategy is therefore:

1. keep behavior stable
2. extract one coherent subsystem at a time
3. give that subsystem a narrow public API
4. document who owns what
5. run typecheck/build after each extraction
6. do not mix refactors with feature additions

The target is not “lots of tiny files.”

The target is **clear ownership**.

---

# 2. Current top-level flow

The library has three broad layers.

## React / application layer

`DevLibraryMap.tsx`

Owns the web application state and DEV-facing UI.

It decides **what content exists and what the visitor is doing**.

## Spatial model layer

`libraryLayout.ts`

Owns the deterministic archive coordinate system.

It decides **where things belong**.

## Three.js world layer

`DreamWorld3D.tsx`

Owns the scene and interactive rendering.

It decides **how the world appears and moves**.

During cleanup, parts of the Three.js world layer are being extracted into library-specific controllers/builders.

---

# 3. `DevLibraryMap.tsx`

Path:

`src/app/map/DevLibraryMap.tsx`

## Purpose

This is the main React container for the DEV Library experience.

It should remain responsible for application state, data loading, and HTML UI rather than low-level Three.js behavior.

## Current responsibilities

### DEV bootstrap data

Loads the initial article/creator/feed information used to seed the library.

### Progressive catalogue loading

Fetches more catalogue articles as the visitor approaches later generated shelves.

The important distinction is:

- React owns **which articles are loaded**
- the spatial layer owns **where shelves are positioned**
- Three.js owns **how those shelves are drawn**

### Shelf definitions

Builds logical `LibraryShelf` objects for:

- Featured
- New
- My DEV
- Topics
- Creators
- Search
- streamed catalogue shelves

### Search

Owns the search form and search API request.

Search results become a logical shelf.

### Topic browsing

Loads article lists for a selected DEV tag.

### Creator browsing

Loads article lists for a selected DEV creator.

### Reader state

Owns the actual long-form article reader component.

This is intentionally separate from the Three.js physical book animation.

### Reading handoff

When Three.js reports that a specific physical book was selected:

1. find the article represented by that shelf/book index
2. set the temporary physical reading state
3. fetch the full article
4. open the React reader

The Three.js book animation performs the transition.

The React reader performs the actual reading.

### Audio toggle state

Owns the visible `SOUND` toggle.

Audio starts disabled.

When enabled, the UI sends the user-gesture-safe audio-enable event so the Web Audio context can resume.

### Navigation HUD

Displays:

- nearest / selected shelf
- WALK or FLY mode
- route state
- article catalogue loading state
- basic controls

## What should NOT move into this file

Avoid putting these here:

- Three.js geometry creation
- camera movement math
- fog sprites
- oscillator creation
- shelf mesh materials
- book animation transforms

Those belong to rendering/controllers.

---

# 4. `libraryLayout.ts`

Path:

`src/app/map/libraryLayout.ts`

## Purpose

This is the authoritative spatial model for the archive.

The most important rule in the project is:

> **The path is authoritative. Everything else decorates the path.**

This module should remain stable and low-level.

## Important concepts

### Archive bay

A bay is a continuous position along the archive path.

It acts like a spatial address.

Other systems can ask:

- where is bay 18?
- which direction is the path facing there?
- how wide is the walkway there?
- which district is nearby?
- what bay corresponds to the visitor's current world Z?

### `archivePathPoint(bay)`

Returns the world-space center point of the archive path at a given bay.

Used by:

- movement
- causeway generation
- haze
- signs
- shelf placement
- landmarks
- audio district calculations indirectly

### `archivePathFrame(bay)`

Returns path orientation information.

This includes tangent and normal directions.

Used when something needs to be positioned beside or oriented along the causeway.

### `archiveBayFromWorldZ(z)`

Approximates the archive bay represented by a world-space Z coordinate.

Useful for visitor-relative effects.

### `archiveWalkwayHalfWidthAtBay(bay)`

Returns the local usable walkway half-width.

The path can become wider around welcome/district plaza areas without changing every movement consumer.

### `archiveShelfPlacement(...)`

Creates seeded deterministic shelf positions.

The seed makes placement look organic while staying stable across rerenders/catalogue growth.

It returns information such as:

- world position
- yaw
- path bay
- district identity

## Why this file matters

Without a stable layout model:

- catalogue streaming could rearrange shelves
- movement and visuals could disagree
- shelf collision fixes would become one-off patches
- effects would have no common coordinate system

This module should not know about React state or Three.js scene objects.

---

# 5. `DreamWorld3D.tsx`

Path:

`src/app/map/DreamWorld3D.tsx`

## Purpose

This is currently the main Three.js runtime.

It originated as the renderer for the larger Oniria dream world and now also hosts the DEV Library mode.

## What it currently owns

### Scene lifecycle

Creates:

- `THREE.Scene`
- camera
- renderer
- post-processing composer
- audio listener
- resize behavior
- animation loop

### Library mode detection

Determines whether the supplied nodes represent library shelves and enables library-specific behavior.

### Walk/Fly movement

Currently owns:

- keyboard state
- pointer lock
- yaw/pitch
- velocity
- Walk versus Fly movement
- path clamping
- ground height following
- walk bob
- auto-route behavior

This is a strong future extraction target.

### Causeway rendering

Currently builds the holographic archive boulevard and route language.

Includes:

- ribbon/path mesh
- edge rails
- moving energy
- route arrows
- district markers
- welcome area

This should eventually become its own builder/controller.

### Shelf rendering

Currently builds:

- shelf frame
- backing
- boards
- books
- cover materials
- cover textures
- pick meshes
- bookmark geometry

This should eventually become a library shelf renderer.

### Book interaction

Currently performs:

- book raycasting
- center-screen book selection
- pull-forward behavior
- physical open animation
- reading handoff
- return-to-shelf animation

This should eventually become a dedicated reading ritual controller.

### Reactive library behavior

Currently performs:

- nearest shelf detection
- shelf wake lighting
- shelf sparkles
- cover brightening
- distant-cover dimming
- nearby route-arrow illumination
- district sign response
- fog parting

Some of this may ultimately be divided between atmosphere and shelf controllers.

### Atmosphere

Currently owns:

- scene fog
- fixed archive haze
- camera-relative local haze
- far particles
- near dust
- distant skyline dressing

This is a strong future extraction target.

### Resource cleanup

Currently contains a long cleanup block disposing:

- geometry
- materials
- textures
- post-processing
- shelf resources
- fog resources
- audio controllers
- event listeners

A later cleanup phase should introduce a small resource registry/disposable pattern.

---

# 6. Cleanup Phase 1 — Library audio

Status: **extracted**

New path:

`src/app/map/libraryAudio.ts`

## Why audio was extracted first

The audio system had a strong natural boundary.

It already behaved like a controller even though its implementation lived inline inside `DreamWorld3D.tsx`.

It had three jobs:

1. create audio resources
2. react to world state
3. dispose audio resources

That makes it a low-risk first extraction.

---

# 7. `libraryAudio.ts`

## Public API

The module exports:

```ts
createLibraryAudio(listener)
```

It returns a controller with:

```ts
{
  update(...)
  updateShelfFocus(...)
  dispose()
}
```

The renderer no longer needs to know which oscillators, filters, gains, buffers, or timers produce the soundscape.

---

## `createLibraryAudio(listener)`

Creates and owns the procedural Web Audio graph.

### Audio master

A master `GainNode` connects the library soundscape to the existing Three.js `AudioListener`.

The master begins silent.

This keeps browser autoplay behavior safe.

### Floor layer

Uses:

- sine oscillator
- low-pass filter
- gain control

Purpose:

Create the subtle holographic causeway hum.

Walk mode makes this layer slightly more prominent.

### Drone layer

Uses:

- triangle oscillator
- low-pass filter
- gain control

Purpose:

Provide distant machinery / archive ambience.

The base frequency changes by district audio profile.

### Tonal layer

Uses a quiet sine oscillator.

Purpose:

Give districts a second subtle harmonic identity.

### Wind layer

Uses:

- generated noise buffer
- looping `AudioBufferSourceNode`
- band-pass filter
- gain control

Purpose:

Create movement/air texture.

It remains very subtle while walking and becomes more noticeable in Fly mode.

### Transient tones

Short oscillators are created for one-shot events such as:

- footsteps
- shelf wake chime

They connect through the same master bus.

---

# 8. Library audio district profiles

Audio identity comes from structured district metadata.

The audio controller does not hard-code district IDs.

It receives each district's:

- `bay`
- `audioProfile`

Profiles currently include:

- `ambient`
- `crystalline`
- `mechanical`
- `warm`
- `deep`

The controller maps those profiles to drone/tone frequency pairs.

This matters because the renderer should not need logic like:

```ts
if (district.id === 'linux') ...
```

Instead, authored world metadata declares:

```ts
audioProfile: 'mechanical'
```

and the audio system interprets that presentation intent.

That keeps content/world configuration separate from rendering implementation.

---

# 9. `libraryAudio.update(...)`

Called from the Three.js animation loop.

Inputs:

- sound enabled state
- movement mode
- current movement speed
- elapsed scene time
- current archive bay
- active district metadata

## What it does

### Master fade

Smoothly fades the entire soundscape in/out rather than abruptly muting audio nodes.

### Movement response

Calculates normalized movement strength.

### Walk mode

Adjusts:

- floor hum
- low wind
- footsteps

### Fly mode

Raises wind intensity relative to movement.

### District response

Finds the closest active district by bay.

Then smoothly moves the drone/tone oscillator frequencies toward that district's audio profile.

### Footstep scheduling

Footsteps are synthesized as short low triangle tones.

Step cadence becomes slightly faster as movement speed increases.

The controller stores `nextFootstepAt` internally.

The renderer does not own timing anymore.

---

# 10. `libraryAudio.updateShelfFocus(...)`

Inputs:

- sound enabled
- nearest shelf ID
- proximity/focus strength

## Purpose

Own the shelf-wake audio state machine.

When a visitor enters the wake threshold for a shelf:

- play the shelf wake cue once
- remember that shelf
- do not replay every frame

When the visitor moves far enough away:

- reset the internal shelf ID
- allow a future shelf approach to trigger again

The renderer only reports proximity state.

The controller owns the auditory behavior.

---

# 11. Browser audio unlock

Browsers generally require a real user gesture before resuming a Web Audio context.

The DEV Library starts muted.

When the visible `SOUND` control is enabled, the UI dispatches:

`oniria:library-audio-enable`

The audio controller listens for this event and calls:

```ts
context.resume()
```

This avoids trying to start audible Web Audio automatically on page load.

## Future cleanup opportunity

The custom event works and preserves the current architecture, but a later pass could replace this hidden event bridge with an explicit controller/ref boundary if desired.

It is intentionally not being redesigned during Phase 1.

---

# 12. `libraryAudio.dispose()`

This is a critical part of the controller contract.

The DEV catalogue can cause scene reconstruction.

If audio nodes survive a scene rebuild, multiple ambient soundscapes could play simultaneously.

The controller therefore owns all of its teardown.

It:

- removes the browser unlock event listener
- stops looping noise
- stops floor oscillator
- stops drone oscillator
- stops tone oscillator
- disconnects sources
- disconnects filters
- disconnects gains
- disconnects master output

After extraction, `DreamWorld3D.tsx` only calls:

```ts
libraryAudio?.dispose()
```

It no longer needs to understand the audio graph.

---

# 13. Phase 1 data flow

The runtime relationship is now:

```text
DevLibraryMap
    │
    ├── soundEnabled
    │
    ▼
DreamWorld3D
    │
    ├── movement state
    ├── current archive bay
    ├── active districts
    ├── nearest shelf proximity
    │
    ▼
libraryAudio controller
    │
    ├── floor hum
    ├── drone
    ├── district tone
    ├── flight wind
    ├── footsteps
    └── shelf wake cue
```

This is the desired cleanup direction:

**high-level state enters a subsystem; implementation detail stays inside it.**

---

# 14. What `DreamWorld3D` knows about audio after Phase 1

It should know only:

### Creation

```ts
const libraryAudio = libraryMode
  ? createLibraryAudio(listener)
  : null
```

### Per-frame world update

```ts
libraryAudio?.update({
  enabled,
  movementMode,
  speed,
  elapsed,
  currentBay,
  districts,
})
```

### Shelf proximity

```ts
libraryAudio?.updateShelfFocus({
  enabled,
  shelfId,
  focusStrength,
})
```

### Cleanup

```ts
libraryAudio?.dispose()
```

It should not know about:

- `OscillatorNode`
- `GainNode`
- `BiquadFilterNode`
- noise buffers
- audio frequencies
- step timers
- shelf audio replay suppression

Those now belong to `libraryAudio.ts`.

---

# 15. Why this boundary is better

Before Phase 1, audio implementation details were mixed into:

- scene creation
- animation loop
- shelf proximity logic
- cleanup

A developer trying to modify a visual shelf behavior could accidentally be editing around Web Audio state.

After extraction:

- audio parameters are searchable in one file
- lifecycle is explicit
- cleanup is owned by the resource creator
- district audio semantics are centralized
- `DreamWorld3D` loses a large set of local variables
- future audio improvements do not require touching the renderer's setup code

This is the pattern to repeat.

---

# 16. Proposed cleanup phases after Phase 1

These are architectural targets, not strict promises.

They should be done one at a time with a green build between them.

## Phase 2 — Reading ritual

Status: **extracted**

Path:

`src/app/map/libraryReadingRitual.ts`

The reading controller now owns:

- opening-book state
- pull-out progress
- shelf-local presentation transforms
- cover opening
- reader handoff timing
- automatic return timing
- bookmark visibility
- safety-envelope displacement clamp
- last-resort stuck-book reset
- reading light creation/update/disposal
- book detail/hover presentation that was previously coupled directly to the ritual loop

The public surface is intentionally small:

```ts
createLibraryReadingRitual(scene)

ritual.begin(book)
ritual.update({...})
ritual.isActive()
ritual.isPresenting(book)
ritual.dispose()
```

`DreamWorld3D.tsx` now provides world facts such as the hovered book, current approached shelf, shelf distance, and reader callback. It no longer owns the reading state machine itself.

### Cleanup-discovered timing bug

During extraction, the old implementation revealed a hidden clock mismatch.

`beginBookOpen()` recorded `performance.now()`, but the animation code was reading an unrelated scene-start `Date.now()` constant used by the supernova/recent-dream calculation.

That mixed two incompatible time bases and could cause the opening/return progress to jump immediately.

The extracted controller now uses one consistent clock: the animation frame's `performance.now()`-compatible seconds.

This was treated as a lifecycle bug uncovered by cleanup rather than a new feature.

---

## Phase 3 — Atmosphere

Status: **extracted (library haze scope)**

Path:

`src/app/map/libraryAtmosphere.ts`

This phase intentionally extracted the coherent DEV Library haze system rather than every atmospheric effect in the shared dream renderer.

The controller now owns:

- distant library haze planes
- haze textures/materials
- fixed archive fog banks
- camera-following local haze corridor
- camera-distance fog clearing
- district-accent haze tinting
- haze/fog animation
- all resources created by those systems
- atmosphere disposal

The public surface is:

```ts
createLibraryAtmosphere({...})

atmosphere.update({
  elapsed,
  camera,
  districts,
})

atmosphere.dispose()
```

The controller consumes the authoritative archive functions from `libraryLayout.ts`; it does not duplicate path geometry.

### Intentionally left in `DreamWorld3D.tsx`

These were not moved because they either serve both dream/library modes or form a different subsystem boundary:

- global scene `FogExp2`
- generic foreground fog
- near-camera dust
- far particle shader field
- distant archive skyline / building geometry

Those can be revisited later if they develop a stronger standalone ownership boundary.

The goal of Phase 3 was not line-count reduction. It was to give the continuous archive haze system one lifecycle owner.

---

## Phase 4 — Shelf renderer

Likely module:

`libraryShelves.ts`

Should own:

- shelf geometry
- shelf material creation
- book geometry
- cover material/texture loading
- bookmarks
- book raycast metadata
- shelf-level LOD resources

Possible controller surface:

- build shelf
- update proximity
- pick book
- dispose

This will likely be one of the larger extractions.

---

## Phase 5 — Movement controller

Likely module:

`libraryMovement.ts`

Should own:

- Walk/Fly input interpretation
- velocity
- path clamping
- ground following
- camera bob
- movement speed
- route cancellation
- auto-route traversal

Input/event listener ownership needs to be designed carefully.

Avoid splitting keyboard state across multiple owners.

---

## Phase 6 — Causeway / route renderer

Likely module:

`libraryCauseway.ts`

Should own:

- path ribbon
- rails
- moving energy
- route arrows
- district markers
- welcome platform visual
- path-related materials

It should consume `libraryLayout.ts`, not redefine path math.

---

## Phase 7 — Resource cleanup registry

Potential helper:

`libraryResources.ts` or generic dreamworld disposal utility.

Goal:

Replace enormous manual cleanup lists with explicit registration.

Possible pattern:

```ts
resources.track(geometry)
resources.track(material)
resources.track(texture)
resources.addCleanup(() => ...)
resources.dispose()
```

Do this only after subsystem ownership is clearer.

A resource registry should support ownership, not obscure it.

---

# 17. Rules for the remainder of cleanup

## Rule 1 — Do not change behavior during extraction

If a feature improvement is discovered, write it down.

Do not mix it into the refactor unless it is required to fix a bug caused by the extraction.

## Rule 2 — The creator disposes

If a subsystem creates a long-lived resource, that subsystem should normally dispose it.

Examples:

- audio controller creates oscillator → audio controller stops it
- atmosphere creates fog texture → atmosphere disposes it
- shelf renderer loads cover texture → shelf renderer owns its disposal

## Rule 3 — Keep `libraryLayout.ts` pure

Do not put Three.js meshes or React state inside the spatial model.

## Rule 4 — Keep React responsible for application state

Do not move network fetching into Three.js controllers.

## Rule 5 — Prefer narrow controller APIs

A controller should receive world facts, not reach into unrelated renderer internals.

## Rule 6 — Keep a known-good checkpoint

After each extraction:

1. typecheck
2. Next build
3. smoke test
4. commit
5. update this document

---

# 18. Manual smoke-test checklist after an extraction

At minimum verify:

- library loads
- arrival position unchanged
- shelves remain in same positions
- Walk movement works
- Fly movement works
- `G` toggles movement
- `E` opens a book
- physical book returns after reader handoff
- reader closes correctly
- bookmark remains
- sound toggles on/off
- footsteps occur while moving in Walk
- wind responds in Fly
- shelf wake sound does not spam
- district ambience changes
- catalogue can extend
- camera does not reset during catalogue growth
- haze continues deep into archive
- no obvious console errors
- no duplicate audio after scene rebuild

---

# 19. Cleanup progress tracker

## Phase 1 — Library audio

- [x] identify controller boundary
- [x] create `libraryAudio.ts`
- [x] move Web Audio graph creation
- [x] move district tone mapping
- [x] move footstep scheduling
- [x] move shelf wake audio state
- [x] move audio cleanup
- [x] replace renderer internals with controller calls
- [x] document responsibilities
- [x] CI verification — Cinematic branch checks #321 passed
- [ ] manual browser smoke test

## Phase 2 — Reading ritual

- [x] identify controller boundary
- [x] create `libraryReadingRitual.ts`
- [x] move opening/return state machine
- [x] move book presentation animation
- [x] move bookmark handoff behavior
- [x] move reading light ownership
- [x] remove inline `openingBook` state
- [x] fix mixed-clock timing bug uncovered during extraction
- [x] source-level stale-reference audit
- [x] CI verification — Cinematic branch checks #325 passed
- [ ] manual browser smoke test

## Phase 3 — Atmosphere

- [x] define library-only atmosphere boundary
- [x] create `libraryAtmosphere.ts`
- [x] move distant haze planes
- [x] move fixed archive fog banks
- [x] move camera-following local haze
- [x] move district haze tint response
- [x] move fog/haze resource disposal
- [x] remove renderer-owned haze/fog arrays
- [x] source-level stale-reference audit
- [ ] CI verification
- [ ] manual browser smoke test

## Phase 4 — Shelf renderer

- [ ] not started

## Phase 5 — Movement

- [ ] not started

## Phase 6 — Causeway/routes

- [ ] not started

## Phase 7 — cleanup/resource registry

- [ ] not started

---

# 20. Current cleanup principle

The metric for success is not:

> “How many lines did we remove from DreamWorld3D?”

The metric is:

> **“Can a developer identify the owner of a behavior without reading the entire renderer?”**

After Phase 1, the answer for library audio is now yes.
