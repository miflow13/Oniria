# DEV Library — Hackathon Story / Build Transcript / Article Notes

> Working documentation for the Oniria / Sanity Hackathon project.
>
> Purpose: preserve the development story while it is still fresh — not only what shipped, but why decisions changed, what broke, what the screenshots revealed, how the implementation evolved, and which moments are worth turning into a contest submission or DEV article later.
>
> This is a curated transcript and engineering narrative, not a byte-for-byte export of chat messages. Direct quotes below are preserved only when they are especially useful to the story.

---

## Current milestone

**Branch:** `feat/cinematic-dream-rendering`

**Stable checkpoint:** procedural DEV Library with deterministic archive layout, streaming article catalogue, walk/fly navigation, reactive environment, physical book-reading ritual, continuous pink/violet haze, and opt-in procedural spatial ambience.

**Latest verified build state:** GitHub Actions **Cinematic branch checks #260 passed** after the spatial-audio and book-return fixes.

This is the deliberate pause point before the large cleanup/refactor pass.

---

# 1. The short version

The project did not begin as a 3D DEV library.

Oniria started from a more dreamlike spatial-web idea, and during the hackathon the direction kept evolving through experimentation: dream-journal spaces, explorable computer folders, floating worlds, and eventually a much stronger metaphor emerged — **what if DEV itself could become a place?**

Instead of another feed, grid, or search page, the project began treating articles as physical books inside a huge floating archive.

That decision created a very different set of engineering problems:

- How do you make thousands of remote articles feel spatial without loading everything at once?
- How do you keep a procedural environment stable while new catalogue pages stream in?
- How do you stop shelves from intersecting paths?
- How do you make a 3D web experience understandable to someone who just landed in it?
- How do you make reading feel physical without making the reader UI unusable?
- How do you keep cinematic fog, particles, cover images, lights, and animation from destroying performance?
- How do you make the environment feel alive rather than decorative?

The most important architectural decision was eventually very simple:

> **The path is authoritative. Everything else decorates the path.**

Once the library stopped letting shelf placement implicitly define navigation and instead used a fixed procedural causeway as the world coordinate system, the project became dramatically easier to reason about.

From there, the library gained semantic districts, catalogue streaming, reactive shelves, local route lighting, physical book interactions, cinematic haze, and finally a procedural audio layer.

The interesting story is not that every idea worked. It is that screenshots and real movement through the space repeatedly exposed problems that static code review did not.

---

# 2. Project evolution

## Early direction: dream space

Oniria originally leaned heavily into dream visualization and an explorable surreal environment.

The visual language that survives into the DEV Library came from that stage:

- fog
- floating platforms
- dark cosmic backgrounds
- atmospheric particles
- cinematic depth
- smooth camera travel
- dreamlike transitions
- spaces that feel discovered rather than simply rendered

The key shift during the hackathon was realizing that the same spatial language could represent something more concrete than dreams.

At one point the direction became:

> explore your own computer as a world

Folders would become worlds, files would be visible and readable, and different parts of a machine could become floating explorable spaces.

That experiment helped establish an important idea that carried directly into the library:

> **information can have geography.**

Files, articles, creators, tags, and archives do not need to be shown only as rows of cards. They can be places with distance, scale, orientation, and atmosphere.

---

# 3. The DEV Library idea emerges

The next major direction was to turn DEV content into an explorable library.

The first versions already had the core interaction metaphor:

- shelves represented collections
- articles became books
- books could be inspected/read
- different content groupings appeared as sections of the library

The early implementation worked, but screenshots immediately exposed that it still behaved more like a prototype than a believable place.

The recurring feedback became less about “add another feature” and more about **spatial legibility**.

Examples from the thread:

> “No clear sense of navigation state.”

> “Cluster labels are small and low-contrast.”

> “A first-time visitor dropped into this scene has no idea what's interactive vs. decorative.”

> “The space after the boundary just seems to be black.”

> “There is an invisible wall that stops you from reaching the other shelves.”

> “The library has no actual building like structure.”

Those comments changed the project.

The problem was not merely graphics.

The real problem was that the environment did not yet explain itself.

---

# 4. Navigation became an architecture problem

Early library versions had shelves and pathways, but the world did not have a sufficiently strong underlying spatial system.

Shelf positions could create awkward gaps, inaccessible regions, intersections, and invisible-feeling boundaries.

The fix was to stop treating shelves as the structure.

Instead, the project moved to a deterministic archive layout centered around a single fixed procedural path.

## Core rule

**The archive causeway owns navigation.**

Shelves are placed relative to it.

They do not redefine it.

This led to the current layout helpers in:

`src/app/map/libraryLayout.ts`

Important concepts include:

- `archivePathPoint(bay)`
- `archivePathFrame(bay)`
- `archiveBayFromWorldZ(z)`
- `archiveWalkwayHalfWidthAtBay(bay)`
- `archiveShelfPlacement(...)`

The path is sampled by “bay” index.

A bay acts like a continuous address inside the archive.

Given a bay, the renderer can derive:

- center point
- height
- forward direction
- side normal
- district
- local walkway width

That means shelves, fog, labels, route markers, and camera behavior can all reference the same spatial language.

This was one of the most consequential technical decisions in the project.

---

# 5. Deterministic procedural shelf placement

Once the causeway became authoritative, shelves moved to seeded deterministic placement.

The placement function takes stable inputs such as:

- shelf ID
- approximate bay
- side of the path
- lane bias
- height bias
- along-path jitter
- yaw jitter

The seed means the world can still feel organic without shelves jumping to new positions every time React state changes.

That matters because the catalogue is streamed.

If procedural positions were recomputed nondeterministically when another page of articles arrived, the library would visibly rearrange itself underneath the visitor.

The stable seed avoids that.

A simplified version of the model is:

```ts
const placement = archiveShelfPlacement(
  shelfId,
  baseBay,
  side,
  {
    laneBias,
    heightBias,
    alongJitterScale,
    yawJitterScale,
  },
)
```

The output includes the world position, yaw, path bay, and district identity.

This gave the project a useful combination:

**procedural appearance + deterministic world state**

---

# 6. Fixing shelf collisions by changing the world, not patching individual shelves

Screenshots exposed shelf intersections and awkward walking clearance.

The tempting fix would have been to manually move individual shelves.

Instead, the global archive spacing model was changed.

Notable changes included:

- `ARCHIVE_BAY_SPACING` increased
- shelf yaw jitter reduced
- along-path jitter reduced
- catalogue cluster offsets tightened
- shelf lanes moved farther from the main path
- the main causeway was widened

This was important because the catalogue is not a hand-authored level.

If every collision requires an individual adjustment, procedural generation has failed.

The better approach was to make the placement constraints safer globally.

---

# 7. The walkway experiment

At one stage, individual holographic spur paths were added from the main path toward floating shelves.

Visually they helped communicate reachability, but as the world grew they also added clutter and complexity.

Eventually those side spurs were removed entirely.

The main boulevard became wider instead.

This is a useful article moment because it demonstrates a recurring design rule from the project:

> Adding more navigation geometry did not necessarily make navigation clearer.

Sometimes simplification produced the stronger world.

The library now uses one unmistakable main causeway and shelf proximity rather than turning every shelf into a mini road junction.

---

# 8. Walk mode versus Fly mode

The library originally inherited free-flight behavior from the dream world.

That worked technically but did not make the space feel like a library.

Walking became its own movement mode.

## Walk

Walk mode uses:

- yaw-only directional movement
- no uncontrolled vertical drift
- path-relative height following
- clamping to the usable causeway width
- subtle camera bob/sway
- normal and boosted movement speeds

The camera height tracks:

```ts
archivePathPoint(currentBay).y
+ ARCHIVE_WALKWAY_Y_OFFSET
+ eyeHeight
```

This makes the floating causeway feel physically walkable even though it bends vertically through open space.

## Fly

Fly mode preserves six-axis traversal and is useful for:

- viewing the archive from above
- crossing long distances
- future district-scale navigation
- cinematic exploration

The `G` key switches WALK / FLY.

This became more than a movement feature.

It created two scales of experience:

**human-scale browsing** and **world-scale exploration**.

That idea is now one of the strongest possible future directions for the project.

---

# 9. Camera state and catalogue streaming

One subtle but critical bug appeared when more catalogue data loaded.

If the scene rebuilt because React received another page of articles, the visitor could lose their camera position.

For a normal webpage, rerendering a list is unremarkable.

For a first-person 3D environment, resetting the camera destroys the illusion of place.

The fix was to persist the library flight state across scene rebuilds:

```ts
libraryFlightStateRef.current = {
  position: [...],
  quaternion: [...],
}
```

When the renderer initializes again, it restores the saved position and orientation.

This is one of the clearest examples of how spatial UI changes ordinary frontend assumptions.

A state update is no longer just “rerender some components.”

It can accidentally teleport the user.

---

# 10. Streaming the DEV catalogue

The goal was to make the archive feel enormous rather than like a demo containing a handful of mocked books.

Instead of trying to download the entire DEV corpus into the browser up front, the catalogue progressively extends.

The client creates catalogue shelves from batches of article summaries.

As the visitor approaches the latest generated catalogue shelves, the next page can load.

This gives the impression that the archive continues much farther than the initially loaded region while keeping startup cost controlled.

The system also separates special shelves from general catalogue shelves:

- Featured
- New
- My DEV
- Topics
- Creators
- Search
- streamed catalogue shelves

One especially useful improvement was the Creators shelf.

Instead of remaining visually empty until a creator was explicitly selected, it receives representative articles from visible/top creators so every important destination communicates its purpose immediately.

---

# 11. Empty shelves were a UX bug, not just missing data

Repeated screenshots showed visually empty sections.

Even if the application technically supported a section, an empty shelf made it look unfinished.

That changed the implementation philosophy.

A destination in a spatial interface has to communicate meaning before interaction.

The system therefore began favoring previews:

- creator shelves show representative creator articles
- topic/collection areas expose content when possible
- article covers and titles appear before selection
- shelves react to proximity

This is another difference between a normal navigation menu and spatial navigation.

A text menu can contain an empty route.

A giant empty physical bookshelf looks broken.

---

# 12. Book-cover flicker and LOD

Loading many remote covers created another class of problems:

- visual flickering
- excessive texture work
- unnecessary detail on distant shelves
- performance pressure

The renderer moved toward explicit shelf/book LOD behavior.

Nearby books receive:

- full cover treatment
- readable labels
- physical pull-forward behavior
- reactive emissive lighting

Mid-distance shelves can simplify.

Farther shelves do not need the same texture/detail workload.

The deeper principle is:

> **The visitor only needs full fidelity where they can meaningfully interact.**

That principle became increasingly important as the archive density grew.

---

# 13. Making the library feel like a real place

The project then moved from layout correctness into environmental identity.

The major visual passes included:

- floating district signs
- welcome platform
- distant archive megastructure silhouettes
- archive towers / ribs / bridges / walls
- far particles
- transparent holographic causeway
- moving path energy
- local route markers
- district-specific atmosphere
- deeper fog
- removal of theatrical stage lights

The stage lights are worth mentioning.

They looked dramatic, but they made the environment feel like a set.

Removing them helped the space read as an enormous archive instead of a presentation stage.

That is a good example of choosing world believability over “more effects.”

---

# 14. The haze problem

One of the most persistent visual bugs involved the pink/violet archive haze.

The intended look was a continuous atmospheric field.

Early versions used large fog sprites distributed along the world.

Screenshots showed the weakness immediately:

> the haze appeared to end

The technical reason was straightforward.

A finite series of sprites can create the appearance of fog locally, but the user can eventually move beyond or between those visual volumes.

Several changes were layered together.

## A. Better fog sprite alpha

The nebula texture generator originally handled alpha too narrowly.

It was corrected to parse the supplied RGBA values properly and create a real radial falloff.

## B. More world fog banks

Fog sprites were distributed across the archive using pink, violet, and magenta tones.

## C. Camera/path-relative local haze

A reusable group of haze sprites now follows the visitor through the archive.

Each one is positioned using the current archive bay plus an offset.

Conceptually:

```ts
currentBay = archiveBayFromWorldZ(camera.position.z)

targetBay = currentBay + hazeOffset
targetPoint = archivePathPoint(targetBay)
targetFrame = archivePathFrame(targetBay)
```

The sprites move toward those targets continuously.

This means the atmospheric corridor cannot simply “run out.”

## D. Scene fog itself changed color

The final important realization was that the global `FogExp2` was still dark blue.

So even with pink sprites, the actual infinite fog volume was not pink.

Library mode now uses a subtle magenta-violet fog base:

```ts
scene.fog = new THREE.FogExp2(
  libraryMode ? 0x1b0d26 : 0x07101f,
  ...
)
```

This was the real root-level solution.

The sprite layers now add texture to the atmosphere instead of being solely responsible for its existence.

---

# 15. The library begins reacting to the visitor

At this point the world looked richer, but the next question was:

**How does it know I am here?**

The user explicitly chose this direction before the cleanup pass:

> “Make the library react to you.”

The result was a coordinated proximity system.

As the visitor moves:

- route arrows ahead brighten
- nearby fog subtly parts
- district signage intensifies
- the nearest shelf becomes more prominent
- shelf particles become visible
- the nearest shelf slightly turns toward the camera
- nearby book covers brighten
- distant books dim back

This is important because it changes the library from a static scene into a responsive environment.

The reaction is deliberately subtle.

The goal is not a theme-park effect.

The archive should feel aware without constantly demanding attention.

---

# 16. Why distant shelves dim

One late refinement was intentionally darkening distant cover materials while nearby books wake.

This was not just visual polish.

It creates **attention hierarchy in 3D**.

On a 2D page, hierarchy comes from typography, card size, layout, or contrast.

Inside the archive, distance alone is not enough because many shelves are visible simultaneously.

Local material response creates a kind of spatial focus system:

- nearby content becomes legible
- current interaction area feels alive
- the surrounding archive visually recedes
- density feels intentional rather than noisy

---

# 17. Physical reading ritual

The next selected feature was:

> “Give reading a physical ritual.”

This created one of the most memorable interactions in the project.

When a book is selected:

1. the physical book pulls out from its shelf
2. it moves toward the camera
3. it rotates into a reading presentation
4. it grows slightly
5. its cover opens
6. the article reader UI appears
7. a bookmark is left behind

The effect uses a persistent book visual state including:

- original local position
- original quaternion
- original scale
- cover rotation
- open/return timestamps

The book is animated in shelf-local coordinates so it can always return exactly to its slot.

The camera presentation target is derived from:

- camera position
- camera forward
- camera right
- a small vertical offset

This keeps the ritual consistent regardless of where the shelf is positioned.

---

# 18. The giant-book bug

The first implementation held the physical book in front of the camera for the entire reader session.

That sounded reasonable conceptually:

> “the book remains presented while you are reading”

In practice it was wrong.

A screenshot made the failure obvious: the article component opened, but the giant physical cover remained stuck across the screen.

This is an excellent story moment because the code was doing what it had been told to do.

The *interaction design* was wrong.

The fix changed the ritual from:

**open → remain physically attached while reading → return on close**

to:

**open → hand off to reader → return automatically**

The article remains open.

The physical book returns to its shelf after the handoff.

The bookmark remains visible as the persistent state marker.

The code now begins the return shortly after the reader fires instead of waiting for `libraryReadingBook` to become null.

This is a better separation of responsibilities:

- Three.js handles the physical transition
- React handles long-form reading
- the bookmark bridges the two states

---

# 19. Failure-state bug in the reading ritual

Another subtle issue appeared in the async article fetch.

The selection handler did roughly:

```ts
setReadingBook(...)
void openArticle(article).catch(...)
```

But `openArticle` already caught its own fetch error internally.

That meant the outer `.catch()` would never normally run.

If loading failed, the reading state could remain active.

The fix moved `setReadingBook(null)` into the internal error handler.

This is a small implementation detail, but it is a good example for the article:

**animation state and network state have to fail together.**

A failed API request should not leave a physical object trapped halfway through an interaction.

---

# 20. Bookmarks as environmental memory

The glowing bookmark was originally part of the reading animation.

It became more interesting as a persistent cue.

Instead of showing a normal “read” badge in a sidebar, the environment can remember reading physically.

A small glowing ribbon can remain protruding from a book that has been opened.

This suggests a larger future system:

- visited shelves
- read books
- saved books
- return cart
- personal library
- discovered districts

The important design constraint is to keep this atmospheric rather than turning the experience into generic XP/gamification.

---

# 21. Spatial audio

After the visual environment became reactive, audio was the next obvious layer.

The guiding request was:

> “Spatial audio. Not music blasting constantly—environmental sound.”

The implementation deliberately avoids shipping a soundtrack or large audio assets.

Instead it synthesizes ambience using the browser audio graph already available through the Three.js audio listener.

The library now has an opt-in `SOUND` control.

Audio only begins after explicit user interaction, which respects browser autoplay restrictions.

## Sound layers

The initial procedural soundscape includes:

- low holographic floor hum
- distant filtered machinery/drone
- subtle wind
- stronger wind in Fly mode
- synthesized footsteps in Walk mode
- a small crystalline shelf-wake chime
- district-dependent tone changes

The district tone mapping lets different areas acquire distinct identities without loading separate recordings.

For example:

- AI uses a higher, more crystalline base
- Linux is lower and more mechanical
- JavaScript uses a different mid-range pulse
- Deep Stacks becomes lower and darker

## Why procedural audio

Procedural audio fits this project especially well because it is:

- tiny compared with audio assets
- responsive to movement
- easy to parameterize
- continuous
- generated at runtime
- naturally connected to world state

The implementation uses Web Audio nodes such as:

- `OscillatorNode`
- `GainNode`
- `BiquadFilterNode`
- looping noise buffer
- the existing Three.js `AudioListener`

All audio nodes are explicitly stopped/disconnected during scene cleanup so scene rebuilds do not create ghost ambience.

---

# 22. Audio is tied to movement, not just enabled/disabled

The soundscape reacts to the visitor.

Examples:

### Walk mode

The floor hum is slightly stronger.

Footstep impulses are scheduled according to movement speed.

### Fly mode

The noise layer becomes more prominent and behaves like airflow.

### District movement

Oscillator frequencies smoothly transition toward district-specific tones.

### Shelf proximity

The first time a nearby shelf crosses the wake threshold, a very short two-part crystalline tone plays.

The sound system therefore follows the same philosophy as the visual system:

> the library responds to presence.

---

# 23. UI and onboarding lessons

A lot of the development effort came from a simple problem:

A first-time visitor should not need the developer standing beside them explaining the controls.

The project gradually added:

- top-bar navigation state
- current nearby shelf
- WALK / FLY state
- control legend
- district signs
- welcome board
- visible path language
- sound toggle
- `E` to inspect / close
- `G` to switch movement modes
- `R` auto-route when flying

The welcome board became especially important.

It now explains:

- what the DEV Library is
- how it is built
- basic controls
- what to follow visually

This is not glamorous engineering, but it is central to making an experimental interface usable.

---

# 24. E should both open and close

A tiny UX request became a useful consistency rule:

> “E key should close the book as well as opening it.”

The system now treats `E` as the semantic inspect/read key rather than making opening and closing unrelated actions.

This matters in immersive navigation because every extra control increases cognitive load.

Keeping a small interaction vocabulary makes the world easier to learn.

---

# 25. The library should open facing the visitor

Another screenshot-level problem:

The scene loaded, but shelves could initially face away.

That makes the first impression look accidental.

The orientation was corrected so the initial arrival presents the library intentionally.

This sounds minor but is exactly the kind of detail that separates a generated environment from a directed experience.

---

# 26. Distant architecture

The archive needed to feel larger than the currently interactive shelves.

The solution was not to immediately create thousands more full-detail shelf objects.

Instead, a distant megastructure skyline was added using lower-cost repeated geometry.

Elements include:

- tower silhouettes
- ribs
- bridge-like spans
- wall segments

These shapes are visual-only.

They provide scale and depth without pretending everything in the horizon needs to be interactive.

This is a useful performance/design lesson:

**world scale and interactive density do not have to be the same thing.**

---

# 27. Performance strategy

The project now uses several complementary techniques rather than relying on one optimization.

## A. LOD

Nearby content gets detail.

Distant content simplifies.

## B. Deterministic generation

World geometry does not churn randomly on state updates.

## C. Catalogue streaming

The client does not need the entire archive at startup.

## D. Instanced / repeated distant architecture

Large-scale silhouettes are cheap compared with thousands of unique objects.

## E. Texture restraint

Remote covers are most useful near interaction distance.

## F. Lightweight haze

Fog is composed from scene fog and a limited reusable sprite system rather than enormous shader complexity.

## G. Adaptive renderer pixel ratio

The renderer monitors average frame time and adjusts DPR within limits on high/cinematic quality modes.

The key design principle was repeatedly:

> cinematic does not mean unbounded.

---

# 28. Why no giant shader rewrite

Several visual problems could theoretically have been solved with more elaborate custom shaders.

The project generally chose cheaper primitives first:

- sprites
- emissive materials
- vertex colors
- scene fog
- instancing
- simple movement
- Web Audio oscillators

That choice made iteration much faster and reduced risk during the hackathon.

It also leaves room for future shader work when the architecture is more stable.

---

# 29. Important bugs and failures worth mentioning in the article

Do not sanitize the story too much.

The project became better because it repeatedly broke in visible ways.

Good examples:

### Invisible boundary

The visitor could not physically reach later shelves.

The response was to revisit the world bounds and path system rather than hide the issue.

### Black void after the library boundary

The interactive region ended, but nothing visually explained the space beyond it.

This led to deeper particles, haze, and distant archive architecture.

### Empty shelves

The code technically had categories, but the world communicated “unfinished.”

This pushed representative creator content and better catalogue population.

### Cover flicker

Remote cover rendering and density exposed the need for better LOD/texture handling.

### Stage lights

They looked dramatic but made the archive feel like a stage.

They were removed.

### Path clipping / z-fighting

Overlapping path geometry flickered.

The navigation model was simplified.

### Haze ending

A finite fog-sprite solution revealed itself as finite.

The final approach uses true scene fog plus moving haze layers.

### JSX syntax failure

A malformed callback closing brace stopped the build after the new book behavior was added.

The fix was tiny, but CI caught it immediately.

### TypeScript impossible comparison

`fogBankCount` could only be one of several fixed values, none of which was `1`, yet the code checked `fogBankCount === 1`.

TypeScript correctly flagged the dead condition.

The unnecessary branch was removed.

### Giant book stuck on screen

The physical reading ritual technically worked exactly as designed, but the design itself was wrong.

The book now returns after handing off to the reader.

### Audio cleanup

The first sound-bed implementation explicitly stopped drone/tone/noise sources but initially missed the floor-hum oscillator.

That was caught before the feature was considered complete.

---

# 30. CI as part of the development loop

The branch uses a GitHub Actions workflow:

**Cinematic branch checks**

The important behavior during this sprint was not merely “run CI at the end.”

CI became part of the iteration loop.

For example:

1. a visual interaction feature was pushed
2. workflow typecheck failed
3. logs pointed to an impossible literal comparison
4. the TypeScript issue was corrected
5. additional source audit caught interaction lifecycle issues
6. another workflow verified the full state

The current stable audio/book checkpoint passed as workflow run **#260**.

That gives the cleanup pass a known-good baseline.

---

# 31. Selected commit timeline

This is not every commit, but these are useful anchors for reconstructing the story.

| Commit | Purpose |
| --- | --- |
| `a77cf6d` | Remove stage-light beams from library mode |
| `ab4f904` | Add far particle field |
| `d51c683` | Haze/depth dressing |
| `45e730d` | Initial holographic walkways |
| `20dabd6` | Populate creators shelf |
| `e95e4e1` | Fixed procedural archive layout helpers |
| `3cd51c0` | Stable shelf orientation data |
| `4f17e33` | Seeded deterministic shelf placement |
| `3bf9021` | Fixed causeway |
| `7327cf8` | Preserve visitor position during catalogue streaming |
| `65231a6` | Floating district signs + welcome platform |
| `0f6dc76` | Distant archive megastructure skyline |
| `ac5c22d` | Make archive environment react to nearby visitors |
| `814d176` | Prepare physical book reading presentation state |
| `b35f7fd` | Persistent physical reading ritual |
| `6448165` | Connect selected book to reading state |
| `249089a` | Camera-following continuous haze corridor |
| `ddafc92` | Fix malformed book-selection JSX callback |
| `e2110ff` | Fix archive fog TypeScript check |
| `27977ac` | Make pink/violet haze continuous at scene level |
| `aa1719c` | Return book state when article loading fails |
| `41fd3ca` | Dim distant shelves while nearby books wake |
| `96206b5` | Return physical book after reader handoff |
| `d13c57a` | Add procedural spatial ambience |
| `6c17cfe` | Add opt-in audio control |
| `6cbe6bb` | Style spatial audio toggle |
| `b52cd9f` | Dispose ambience oscillator cleanly |

---

# 32. Main code areas

## `src/app/map/libraryLayout.ts`

Owns the deterministic spatial model.

Important responsibilities:

- archive path
- path frames
- districts
- walkway width
- world-Z → bay mapping
- seeded shelf placement

This should remain the authoritative geometry/navigation module during cleanup.

## `src/app/map/DevLibraryMap.tsx`

Owns the React-facing library application state.

Important responsibilities include:

- DEV bootstrap data
- catalogue loading
- shelf definitions
- topics
- creators
- search
- article fetch
- reader state
- sound toggle
- reading-book handoff
- HUD/navigation state

## `src/app/map/DreamWorld3D.tsx`

Currently owns a very large amount of rendering and interaction behavior.

For the library this includes:

- Three.js scene
- camera
- movement
- causeway rendering
- shelf meshes
- book meshes
- cover textures
- picking
- proximity reactions
- particles
- fog
- district visuals
- physical book ritual
- spatial/procedural audio

This file has become the main target for the upcoming cleanup pass.

---

# 33. The cleanup pass we intentionally postponed

The team explicitly stopped feature expansion at this milestone because `DreamWorld3D.tsx` has accumulated too many responsibilities.

The planned cleanup should preserve behavior while extracting library-specific systems into focused modules.

Likely boundaries:

### Library movement controller

Own:

- Walk/Fly state
- path clamping
- ground following
- bob
- movement speeds
- route behavior

### Library atmosphere

Own:

- archive fog
- local haze
- particles
- distant ambience
- district atmosphere

### Library causeway / route language

Own:

- ribbon geometry
- route arrows
- welcome platform
- district markers
- path energy

### Shelf renderer

Own:

- shelf geometry
- book creation
- cover loading
- LOD
- shelf proximity presentation

### Reading ritual controller

Own:

- book extraction
- presentation
- opening
- reader handoff
- return
- bookmark state

### Library audio

Own:

- audio context graph
- district tones
- walk steps
- flight wind
- shelf wake cues
- lifecycle cleanup

### Resource registry

Instead of maintaining a long manual cleanup block, library-created geometries, materials, textures, nodes, and audio resources should be registered and disposed centrally.

The goal of cleanup is not to redesign the library.

The goal is to make the existing world safe to continue extending.

---

# 34. Strongest story angles for the final contest article

## Angle A — “I accidentally built a spatial browser”

The most accessible story.

Start with the fact that the project was not originally supposed to become a giant DEV archive.

The interesting progression:

dream world → files/folders as places → articles as places → full spatial browser

The central question becomes:

> What changes when a feed stops being a feed and becomes somewhere you can walk?

---

## Angle B — “What if DEV had geography?”

This is probably the strongest conceptual headline.

The article can explain that once content has geography, normal frontend problems transform.

Examples:

- rerendering can teleport someone
- empty categories become empty buildings
- pagination becomes world streaming
- hierarchy becomes lighting and distance
- navigation becomes architecture
- reading state becomes physical object state

This angle naturally supports both product design and code.

---

## Angle C — “Building a library that reacts to you”

A more cinematic angle.

Focus on the progression from static shelves to an environment that acknowledges presence:

- lights wake
- fog parts
- district signs intensify
- books brighten
- sound changes
- shelves orient toward the visitor

The thesis:

> The difference between a 3D webpage and a world is whether the world knows you are inside it.

---

## Angle D — “The bugs only appeared when I walked through it”

Excellent engineering narrative.

Screenshots and first-person traversal exposed problems that were difficult to understand from code alone:

- invisible wall
- inaccessible shelves
- black void
- bad initial orientation
- path clipping
- haze cutoff
- giant book stuck in camera
- empty physical sections

This gives the article a strong “build, walk, notice, revise” rhythm.

---

## Angle E — “I stopped adding features and made the path authoritative”

A technical architecture article.

The thesis:

> The library became manageable only when one deterministic coordinate system became the source of truth.

Explain bays, path frames, seeded shelf placement, streaming data, camera persistence, and movement.

This is especially useful for developers building spatial interfaces.

---

# 35. Possible titles

- **What If DEV Had Geography? Building a Library You Can Walk Through**
- **I Turned a Developer Feed Into a Place**
- **Building a Spatial Browser for DEV**
- **The Bugs Only Appeared When I Walked Through My Website**
- **I Built a Library Out of DEV Articles**
- **From Feed to World: Building an Explorable Developer Archive**
- **Pagination Is Different When the User Can Walk Into It**
- **How a 3D Prototype Became a Living Developer Library**
- **A Feed Has Rows. A World Has Geography.**
- **I Wanted to Browse Articles. I Accidentally Built a Sci‑Fi Archive.**

---

# 36. Potential opening paragraphs

## Opening idea 1

I did not start this hackathon trying to build a library.

I was building Oniria as a spatial experiment — first dreams, then files, then folders as floating worlds. Somewhere in the middle of that process I looked at DEV and had a much stranger question:

**What if the feed was not a feed? What if it was a place?**

A few hours later I was debugging an invisible wall in a floating archive while hundreds of developer articles streamed onto bookshelves.

That is roughly when the project stopped behaving like a website.

---

## Opening idea 2

There is a frontend bug that only exists because your user has a body.

I found it when my catalogue pagination updated React state and my 3D library tried to rebuild underneath me.

On a normal site, rerendering a list is boring.

Inside a first-person archive, it can teleport the reader.

That bug ended up teaching me the rule that shaped the entire project:

**the path is authoritative; everything else decorates it.**

---

# 37. Quotable design principles discovered during the build

These are good candidates for pull quotes or section headers.

> A feed has order. A world needs geography.

> Pagination becomes world streaming when the user can physically walk toward the next page.

> Empty UI looks unfinished. Empty architecture looks abandoned.

> The path is authoritative. Everything else decorates it.

> Cinematic does not mean unbounded.

> World scale and interactive density do not have to be the same thing.

> The visitor only needs full fidelity where they can meaningfully interact.

> A responsive world should acknowledge presence without constantly demanding attention.

> The difference between a 3D webpage and a world is whether the world knows you are inside it.

> A failed network request should not leave a physical object trapped halfway through an animation.

> The book should perform the handoff. The reader should do the reading.

---

# 38. Future direction after cleanup

The next features should add meaning rather than simply adding more decoration.

## Semantic districts

Article placement should increasingly derive from real DEV tags and metadata.

Examples:

- Linux / Fedora / Arch → Linux district
- AI / LLM / agents → AI district
- JS / TS → JavaScript district
- frontend/backend/web → Web Dev

The physical archive would then reflect the actual content graph.

## Live DEV changes

The strongest future idea is making the library visibly change because DEV changed.

Possibilities:

- newly published articles materialize
- trending posts brighten
- old content moves deeper into archival regions
- active topics intensify

That would make the space a living archive rather than a static visualization.

## Persistent visitor memory

Potential physical memory:

- bookmarks in read books
- visited shelf markers
- personal saved shelf
- recently read return cart
- discovered district state

## Physical search

Searching `Wayland` could light a route through the archive instead of simply presenting a results list.

Search results across multiple districts could visibly branch through the environment.

## Deep Stacks

The library can gradually become stranger and larger:

Welcome → Front Page → Topics → Community → Archive → Deep Stacks

The farther the visitor travels, the older / more obscure content can become.

## Spatial scale transition

One particularly strong future idea:

At human scale, articles are books.

As the visitor flies higher, shelves collapse into district masses.

Higher again, the entire library becomes a knowledge graph of topics and relationships.

Then the visitor can descend into another region and resolve back into books.

**library at human scale → knowledge graph at cosmic scale**

---

# 39. Sanity / hackathon story notes

Keep the Sanity part of the final submission concrete.

The important framing should not be “we added Sanity because this is a Sanity contest.”

Instead:

- Sanity is part of the content/state architecture the project already needed.
- The visual world should remain decoupled from source data.
- The renderer consumes normalized world/library state rather than hard-coding article placement into scene geometry.
- As the project expands, Sanity can hold curated/persistent world metadata that external DEV data alone does not provide: spatial annotations, featured regions, visitor-created state, editorial landmarks, narrative metadata, or other authored experience data.
- The strongest submission story will show where authored structured content and live external data meet inside one world.

Do not overclaim any Sanity feature that has not actually shipped.

Document the real integration exactly during the cleanup/finalization pass.

---

# 40. Progress snapshot at the current stopping point

### Working

- fixed deterministic archive path
- wide holographic main causeway
- grounded Walk mode
- Fly mode
- district signs
- welcome board
- seeded shelf placement
- progressive DEV catalogue
- populated creator previews
- search/topic/creator interactions
- remote article reading
- book cover presentation
- shelf proximity reactions
- dynamic route lighting
- nearby fog parting
- distant shelf dimming
- persistent bookmark visual
- physical book extraction/opening/return
- continuous pink/violet haze
- distant archive skyline
- far particle field
- opt-in procedural spatial ambience
- walk footsteps
- fly wind
- shelf wake chime
- district tone variation
- camera preservation across streamed catalogue scene rebuilds
- successful typecheck/build at the latest stable checkpoint

### Intentionally deferred

- semantic tag-driven district placement
- persistent saved/read state across sessions
- physical search routes
- landmark architecture pass
- Deep Stacks content semantics
- knowledge-graph scale transition
- major shader work
- full structural refactor

### Next

**Huge cleanup / modularization pass before additional feature work.**

---

# 41. Suggested article structure

A strong long-form contest article could follow this order:

1. **Cold open:** the giant archive / “what if DEV had geography?”
2. **The original project was something else**
3. **Why articles became books**
4. **First prototype looked cool but was confusing**
5. **Screenshots revealed spatial UX problems**
6. **The rule that fixed everything: the path is authoritative**
7. **Procedural deterministic shelf placement**
8. **Streaming DEV content without teleporting the visitor**
9. **Making the environment react**
10. **Physical reading ritual**
11. **The giant-book mistake**
12. **Continuous fog: why sprites were not enough**
13. **Spatial audio**
14. **Performance compromises**
15. **What Sanity contributes**
16. **What I learned about building spatial interfaces**
17. **Where the archive goes next**

This avoids becoming a feature dump.

It gives the reader a story with escalating problems and decisions.

---

# 42. Things to capture before the final article

Take screenshots/video of these exact moments later:

- first arrival at the welcome board
- long view down the causeway
- district sign appearing through pink fog
- nearest shelf waking while distant shelves dim
- a book pulling out
- the physical book opening
- the book returning while the article reader remains open
- glowing bookmark left behind
- Walk mode
- Fly mode
- high aerial shot showing archive scale
- haze remaining continuous deep in the archive
- Deep Stacks once implemented
- sound toggle active
- DEV catalogue extending while the player position stays stable
- one screenshot of an ugly/broken earlier version for contrast
- invisible-wall / black-void screenshot if preserved
- giant-book-stuck screenshot as a debugging anecdote

A before/after sequence would make the article much stronger than polished screenshots alone.

---

# 43. Thread excerpts worth preserving

These lines capture the actual development direction particularly well:

> “Lets fill the library with vast amount of articles from dev.to, floor levels, and rows of rows of rows of actual articles like an enormous library.”

> “There is an invisible wall that stops you from reaching the other shelves.”

> “The space after the boundary just seems to be black.”

> “Lets also add a walkable light path to each floatable bookcase, it should be transparent almost halogram like.”

> “Make the library react to you.”

> “Give reading a physical ritual.”

> “Implement those two changes and then we will do a huge cleanup pass.”

> “Spatial audio. Not music blasting constantly—environmental sound.”

> “when picking up a book it opens the component to read but the book is stuck on your screen, it doesnt seem to be working properly”

Those quotes demonstrate the project’s evolution better than a sanitized feature checklist.

---

# 44. Cleanup pass: extracting ownership exposed a real timing bug

The cleanup pass was intentionally started before adding more showcase features.

The first three extracted ownership boundaries were:

- procedural library audio
- physical book reading ritual
- continuous archive haze / fog atmosphere

The goal was not to create lots of small files. It was to make each runtime system responsible for creating, updating, and disposing its own resources.

A particularly useful bug surfaced during the reading-ritual extraction.

The old physical-book animation recorded its start with `performance.now()`, but later progress calculations were accidentally reading a separate scene-start `Date.now()` value that existed for recent-dream calculations.

Those clocks have different origins.

The code typechecked and the variables looked reasonable in isolation, but combining them could make the book animation jump through its timing almost instantly.

Moving the ritual into its own controller made the mismatch obvious.

The extracted system now receives one consistent animation-clock value.

This is a useful engineering story for the final article:

> Refactoring did not just make the file smaller. Giving behavior a clear owner exposed a bug that was hidden by unrelated state living in the same scope.

After the next atmosphere extraction, the same ownership rule was applied to the archive haze:

- create haze/fog resources in one module
- update them from visitor + district state
- dispose them from the same module

Both phases passed the Cinematic branch TypeScript + Next build checks.

---

# 45. Final takeaway at this stage

The DEV Library is now interesting for a reason that has little to do with polygon count.

It has begun acquiring the properties of a place:

- stable geography
- movement rules
- districts
- distance
- memory
- environmental response
- physical interaction
- sound
- scale
- changing content

The strongest lesson from the sprint is that spatial interfaces are not ordinary web interfaces with a 3D renderer attached.

Once a user can inhabit the interface, ordinary frontend concepts become environmental design problems.

A loading state can become an empty room.

A rerender can become teleportation.

A category can become a district.

Pagination can become a horizon.

And opening an article can become pulling a book off a shelf.

That is the story worth telling.
