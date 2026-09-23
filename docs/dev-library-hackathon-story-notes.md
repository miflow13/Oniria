# DEV Library Hackathon Story Notes

> Living build transcript, technical rationale, article source material, and contest-story notes.
>
> Project: **Oniria / DEV Library**
> Branch documented here: `feat/cinematic-dream-rendering`
> Snapshot date: **September 22, 2026**
> Purpose: preserve the build story while the decisions, problems, fixes, and small discoveries are still fresh.

---

## 1. The short version

The DEV Library evolved from a functional 3D article browser into a navigable science-fiction archive where real DEV Community writing becomes physical space.

The important idea is not simply "render DEV posts as books." The project treats a live content system as architecture:

- DEV API data supplies the writing.
- Article tags decide where writing belongs.
- Sanity controls district identity, route placement, accent colors, atmosphere, landmark types, and curation.
- Three.js turns that information into shelves, districts, landmarks, paths, haze, skyline architecture, and first-person movement.
- The user walks through the archive, approaches shelves, inspects a book, and reads the real article.
- The world keeps a conventional reading loop intact even while the navigation becomes spatial.

That separation became one of the strongest technical and narrative ideas in the project:

**content is live, editorial structure is CMS-authored, and the rendering layer interprets both as a place.**

The build repeatedly moved through the same cycle:

1. make the idea work,
2. walk through it,
3. notice what fails at human scale,
4. turn the failure into a design rule,
5. optimize before adding more spectacle.

The latest pass focused on the final step: making the archive feel cinematic enough for a hackathon showcase without destabilizing its navigation, article reading, DEV ingestion, or Sanity synchronization.

---

# 2. Reconstructed build transcript

This is a concise reconstruction of the working thread rather than a word-for-word export. It preserves the decisions and feedback that materially changed the project.

## Phase A — "A library" was not enough

Early versions technically contained DEV content, but the space did not yet read as the enormous archive the concept promised.

Recurring feedback included:

- article reading needed to work reliably,
- browsing needed to remain readable,
- the visual language should feel closer to DEV rather than an unrelated fantasy-library skin,
- shelves should behave like physical shelves,
- the library needed depth, floors, architecture, and a convincing sense of scale,
- real articles should occupy the shelves rather than filler.

A key design choice was to preserve the familiar DEV visual vocabulary — near-black surfaces, white typography, restrained accent colors — while letting the spatial world become much more surreal.

This prevented the 3D treatment from severing the archive from its source community.

### Interesting article angle

The project initially risked becoming a "3D skin" over a feed. The breakthrough was realizing that the content itself needed to determine the architecture.

---

## Phase B — The article loop became the core interaction

The intended interaction loop became:

**walk → notice shelf → approach → target a book → inspect → open → read → close → resume walking**

That led to several small but important UX decisions:

- books sit in clear shelf rows,
- covers need to remain visible before interaction,
- the targeted book can pull forward,
- shelves should subtly react as the player approaches,
- `E` should close an article as well as open it,
- after reading, pointer-lock / first-person control should resume cleanly,
- shelves should face the arriving player instead of spawning backwards.

These details matter because a first-person interface makes every small inconvenience physical. A poorly oriented card in a normal website is mildly annoying. A shelf facing the wrong way in a walkable environment makes the world feel broken.

### Article line worth developing

> Once the interface became a place, UI bugs started behaving like architectural bugs.

---

## Phase C — "Fill the library"

The next problem was scale.

The library looked sparse because the amount of visible architecture grew faster than the article catalogue feeding it.

The project expanded DEV ingestion and shelf population while trying not to turn the client into an accidental crawler or GPU stress test.

Important changes in this phase included:

- deeper live DEV catalogue ingestion,
- bounded/paged fetching instead of one giant request,
- multiple floors / stack levels,
- more rows of shelves,
- explicit floor navigation,
- larger physical library shell,
- article detail rendered only where necessary,
- hidden-floor books excluded from raycasting and animation,
- shared geometry for repeated book/shelf elements,
- off-floor content culled aggressively.

Representative commits from this part of the build include:

- `2b36565` — Expand DEV stack ingestion and fetch large catalogs in bounded waves
- `0b36f29` — Fill six stack levels from a much larger live DEV catalog
- `759e944` — Build a visible multi-storey library shell and share heavy book geometry
- `9aca51c` — Cap active book detail, stop texture thrash, and render only the current floor's content
- `135592d` — Animate only the active floor instead of hundreds of hidden books
- `6212735` — Eliminate transparent cover flicker and cull off-floor article detail
- `6f9d13a` — Cut route and shadow costs in the primary browsing render loop
- `f5ceeb8` — Allow a deeper DEV catalog to fully populate the mega-library shelves

### Technical lesson

The visual fantasy was "an enormous library."

The implementation could not literally render every detail everywhere at once.

The solution was to make the *architecture* feel huge while keeping expensive article detail local to where the player is actually looking.

That is a useful contest-story point because it shows the project was not just about adding objects. Scale came from selective detail, routing, visual continuity, and data streaming.

---

## Phase D — Cover flicker exposed a real-time rendering problem

Article cover images flickered in early versions.

The cause was not the DEV content itself; it was the way transparent image materials interacted with depth sorting and the growing number of visible objects.

The fix moved the rendering toward more stable opaque/materialized covers and reduced unnecessary transparent sorting.

Representative commits:

- `122e194` — Stop cover flicker and reduce baseline GPU cost
- `5ba4f77` — Eliminate transparent cover sorting and soften image materialization

### Article angle

This is a nice concrete example of the project crossing from web UI problems into graphics-engine problems.

Loading an article image is ordinary web development.

Keeping hundreds of those images stable inside a moving 3D camera becomes a depth, material, texture, and performance problem.

---

## Phase E — Floors helped scale, but navigation started feeling abstract

Adding floors solved density, but introduced a new UX problem: a floor selector is not enough if the player cannot understand what "up" means in the world.

This led to:

- central lift / floor concepts,
- routes through the lift for cross-floor travel,
- physical guide strips that remain attached to the correct floor,
- bridges to upper levels,
- keyboard-first floor controls,
- clearer stack-level signage.

Representative commits:

- `3ba9a62` — Guide cross-floor routes through the central lift
- `30ddb98` — Preserve cross-floor routes after taking the lift
- `c2800b1` — Add walkable bridges to every upper library level
- `5438642` — Make six stack levels obvious and horizontally navigable
- `ff9a93d` — Add keyboard lifts, smooth cover fades, occupied shelves, graphic signs, and floor declutter

The underlying rule was simple:

**navigation should be visible in the world whenever possible, not only explained by HUD text.**

---

## Phase F — The project shifted toward districts

As the catalogue grew, floors alone did not communicate *meaning*.

The library began organizing itself into named districts:

- FRONT PAGE
- WEB DEV
- AI
- LINUX
- JAVASCRIPT
- ARCHIVE 2026
- COMMUNITY
- DEEP STACKS

Each district has data that can come from Sanity:

- ID
- title / label
- wayfinding code
- route bay
- DEV tags
- accent color
- atmosphere
- audio profile
- landmark type
- enabled state

This is where Sanity became more than a place to edit text.

It became an **architectural control plane**.

Changing a district can change where a region appears, what articles flow into it, how it is colored, what kind of landmark it renders, and what atmosphere/audio identity surrounds it.

### Code concept

`LibraryDistrictConfig` is the bridge between editorial intent and the physical world.

The district config contains fields such as:

```ts
type LibraryDistrictConfig = {
  id: string
  label: string
  code: string
  bay: number
  description?: string
  devTags: string[]
  accent: string
  atmosphere: LibraryAtmosphere
  audioProfile: LibraryAudioProfile
  landmarkType: LibraryLandmarkType
  enabled: boolean
}
```

The renderer should not need to know that "AI should always be purple" or "Linux always uses a terminal wall."

Sanity provides the identity. The renderer interprets it.

That separation is one of the cleanest architectural ideas in the project.

---

## Phase G — Data synchronization became visible as spatial bugs

Several problems looked visual but were actually data-flow problems:

- a district appeared empty,
- WEB DEV was not populated,
- FRONT PAGE stopped after only a few shelves,
- changing Sanity did not immediately alter the browser,
- landmarks failed to appear,
- large empty gaps opened between districts.

These were especially interesting because in a spatial UI, stale data does not just produce stale text.

It produces **empty architecture**.

Fixes included:

- seeding semantic districts from their configured DEV tags,
- allowing FRONT PAGE to grow from live feed/latest/catalogue rather than treating it as a narrow taxonomy bucket,
- streaming remaining catalogue articles into tag-matched districts,
- using no-store / preview-aware Sanity fetching,
- compacting oversized district gaps,
- separating physical district placement from the number of currently loaded shelves.

The code now treats the archive spine as a source of truth independent of catalogue size.

### Route architecture

The route has a fixed logical length:

```ts
export const ARCHIVE_PATH_RENDER_BAYS = 72
export const ARCHIVE_BAY_SPACING = 9.2
export const ARCHIVE_WALKWAY_HALF_WIDTH = 4.1
```

`archivePathPoint(bay)` converts a logical bay number into a 3D world position.

The path gently curves and changes elevation, which gives the archive a sense of scale without requiring a giant hand-authored level.

Shelves are decorations of this route rather than the route itself.

That decision fixed an important class of bugs: changing how many shelves are loaded should not tear apart the physical world.

---

## Phase H — Empty space and invisible boundaries

At one point the player could walk only so far before hitting an invisible boundary. Beyond it was mostly black space.

That prompted two changes in direction:

1. the archive route needed to remain physically continuous,
2. distant space needed atmosphere and visual information even before the player reached it.

The world gained:

- extended route continuity,
- continuous fog,
- more distant particles,
- fewer arbitrary stage-light elements,
- holographic paths toward shelf structures,
- stronger environmental dressing farther down the archive.

The walkway eventually became a primary composition tool rather than just collision geometry.

---

## Phase I — Landmarks became district anchors

Districts still needed a visual answer to the question:

**"Where am I?"**

Landmarks were moved directly onto the center path, with district signs floating above them.

This produced a useful design tension.

Putting the landmark off to the side made it easier to walk around, but weaker as a navigational anchor.

Putting it on the centerline made it unmistakable, but could create collision and camera-clipping problems.

The final design deliberately keeps landmarks on the centerline but marks them as decorative and excludes them from collision/raycast systems.

Later, a very short-range holographic fade was added so the landmark can remain visually dominant on approach, then dissolve gracefully as the camera passes through it.

This is a strong article example of solving a conflict between:

- visual composition,
- navigation clarity,
- player comfort,
- and interaction correctness.

---

## Phase J — Placeholder blocks had to go

As real articles populated the shelves, placeholder/filler geometry began clipping through actual content.

The decision was simple: once the real content pipeline worked, fake density was doing more harm than good.

Placeholder blocks were removed.

This reinforced another project rule:

**the archive should look full because it has content, not because it has decorative lies.**

---

# 3. The cinematic graphics pass

By this point the project was functional enough to walk, browse, read, and populate.

The final request became:

> Push the library from "working prototype" to "cinematic hackathon showcase" without destabilizing navigation, shelf interaction, Sanity syncing, or reading flow.

This constraint mattered.

The graphics pass was intentionally built on existing rendering systems instead of replacing them with a new shader-heavy stack.

The branch already had:

- `EffectComposer`
- SSAO
- bloom
- Bokeh / depth-of-field support
- a custom `DreamPostShader`
- fog
- particle systems
- instanced skyline geometry
- shelf proximity logic

So the strategy was to **amplify the systems already paying for themselves**.

---

## 3.1 Animated archive pathway energy

Commit:

- `25545c0` — Animate archive pathway energy and edge flow

The existing route-dot system was expanded into three moving lanes:

- central cyan energy,
- violet edge flow,
- pink edge flow.

The dots travel forward along the curved archive path using the same `archivePathPoint()` and `archivePathFrame()` functions used by the physical walkway.

That means the effect naturally follows changes in the route.

The side lanes derive their lateral offset from the walkway width at each bay, so district plazas can widen without the pulses drifting into the wrong place.

The walkway panel and rail opacity also pulse subtly with movement.

### Why this approach

A custom animated floor shader could have been more visually elaborate, but it would have increased shader complexity and created another rendering system to tune.

Using an existing `Points` geometry kept the effect cheap, readable, and easy to disable or reduce later.

---

## 3.2 Archive skyline

Commit:

- `3453047` — Enhance skyline silhouettes with lit archive towers

Feedback before this pass was blunt and useful:

> "they don't look like buildings"

and:

> "the skyscrapers and buildings are still way too dark"

The solution was not to flood them with light.

The skyline is supposed to remain background structure.

Instead:

- tower masses became brighter blue-black silhouettes,
- shapes use stepped bases, shafts, crowns, and roof pieces,
- facade windows use instancing,
- architectural light seams survive at distance,
- soft neon is restricted to skyscrapers only,
- secondary towers add depth behind the main district skyline.

This preserves a visual hierarchy:

1. article covers and shelves stay readable,
2. landmarks lead navigation,
3. skyline establishes scale,
4. atmosphere sits behind everything.

### Performance detail

The skyline is built with instanced meshes.

Window strips and neon accents can create the impression of many illuminated structures without creating a separate material/object hierarchy for every light.

---

## 3.3 Landmark polish

Commit:

- `c888047` — Polish district landmarks and atmospheric effects

Every landmark gained lightweight presentation systems:

- glow aura,
- scan ring,
- orbiting particles,
- pulsing pedestal,
- wireframe/core layers,
- Sanity accent color.

These pieces are decorative only.

They do not become collision geometry or article interaction targets.

### District-specific motifs

The renderer adds lightweight identity based on district ID / landmark type.

#### FRONT PAGE

Headline-like horizontal bars create a "front page / featured display" feel.

#### WEB DEV

Floating browser/grid panels create a cyan glass UI motif.

#### AI

Nested/angled neural rings suggest connected computational systems.

#### LINUX

Terminal-line bars and a cursor-like block make the landmark feel machine/console oriented.

#### JAVASCRIPT

A branching line structure reads like a syntax tree.

#### ARCHIVE / DEEP STACKS / other quieter districts

Simple ring motifs keep them differentiated without making every district equally loud.

### Why geometry instead of text labels everywhere

Small text becomes noisy and unreadable in a moving first-person scene.

Simple shapes remain legible at distance and support the district theme without fighting article titles and signs.

---

## 3.4 Reactive shelves

Commit:

- `d52abc9` — Refine shelf reactivity and cinematic presentation

Early shelf materials were shared globally.

That made it difficult to make one nearby shelf react without affecting every shelf using the same material.

The pass introduced per-shelf clones for:

- frame material,
- board material,
- accent material.

The nearest shelf can now:

- increase frame emissive intensity,
- strengthen accent rails,
- brighten cover presentation,
- receive a local point light,
- show subtle sparkles.

At the same time, neighboring shelves can recede slightly.

This gives the player's attention a visual "gravity well" without darkening the archive into unreadability.

### Important detail

Article covers remain the primary readable object.

The effect is designed around helping a shelf become legible, not decorating over it.

---

## 3.5 Atmosphere

Commit:

- `d03dc13` — Polish archive haze and cinematic presentation

The archive already had fog banks and camera-local haze.

The pass expanded the palette with cyan and blue-violet layers and increased fog-bank density modestly for higher quality modes.

Local haze now reads the nearest district accent and slowly lerps toward that color.

It also becomes slightly richer around district plazas.

This means the player can feel a district transition before reading the sign.

### Why local moving haze

A single global fog value can create depth but cannot communicate place.

Camera-local haze provides continuous atmosphere along the route, while district tint creates variation without requiring expensive true volumetric lighting.

---

## 3.6 Post processing

The graphics pass deliberately stayed restrained.

The scene already uses:

- SSAO,
- bloom,
- custom chromatic aberration,
- vignette,
- film grain,
- highlight compression,
- travel smear.

Rather than stacking more effects, the pass slightly reduced custom post intensity while increasing exposure and bloom just enough to improve screenshot legibility.

The principle was:

**cinematic should mean composed, not blurry.**

---

# 4. Walking-height composition pass

The next question was not "can we add more effects?"

It was:

**does this composition actually work from the player's eyes?**

The walking camera uses roughly a **1.64 m eye height** above the archive path.

That matters because landmarks designed from an overhead/debug perspective can become walls when seen from human height.

Two additional commits addressed this:

- `1ec7d3a` — Tune district hero composition at walking height
- `80acbbf` — Refine landmark pass-through framing

## Sign placement

The original district sign used one fixed height.

That created inconsistent spacing because landmark heights vary.

The new sign height uses the expected landmark height:

- archive tower: 4.8 m
- syntax tree: 4.2 m
- neural lattice: 3.7 m
- index: 3.2 m
- terminal / DEV monument: about 2.7 m

The sign is placed high enough to preserve a clean silhouette between the landmark and its label.

## Linux landmark

The LINUX terminal wall was the most likely landmark to feel like a literal obstruction at walking height.

It was made:

- slightly narrower,
- slightly shorter,
- thinner,
- more transparent.

It remains visually recognizable but behaves like holographic architecture.

## Hero reveal

As the camera approaches a district:

- the landmark scales only slightly,
- its halo strengthens,
- particles brighten,
- scan treatment becomes more visible,
- pedestal light rises,
- motif presence increases.

The effect is based on distance in route bays rather than screen-space tricks.

This makes each district entrance feel like a small reveal.

## Pass-through fade

Because landmarks remain on the centerline, the camera eventually occupies the same space.

Instead of accepting ugly clipping, the landmark uses a very short-range fade.

The hero presentation remains strong on approach.

At extremely close range:

- core fades,
- wireframe fades,
- scan ring fades,
- orbit particles fade,
- halo fades.

Then the landmark becomes visible again after the player passes through.

This solves camera comfort without moving the landmark away from its strongest navigational position.

---

# 5. Shelf and article population architecture

The library population logic is worth explaining in the article because it connects the live web to the physical world.

## Article fetching

Catalogue loading is paged.

Current library code uses values such as:

- catalogue page size: 100
- up to 9 article books per shelf

The client extends the catalogue as needed instead of trying to ingest the entire DEV corpus in one blocking operation.

## De-duplication

Articles from feed, latest, profile, tag-specific district samples, and catalogue pages can overlap.

`uniqueArticles()` uses article IDs to collapse duplicates before shelving.

## Special entrance treatment

FRONT PAGE is intentionally not treated as a strict tag taxonomy.

It can draw from:

- feed,
- latest,
- streamed catalogue.

This lets the entrance feel populated even if a strict tag mapping would leave it sparse.

## Semantic district population

Districts with configured DEV tags fetch sample articles from those tags.

Remaining catalogue articles are assigned using `districtForTags()`.

The function normalizes tags and chooses the enabled district with the strongest configured tag overlap.

Content that does not map cleanly falls back toward archival / deep-stack districts.

### Why this matters

The library does not simply scatter posts randomly.

The spatial arrangement is derived from article semantics plus editorial rules.

---

# 6. Sanity as worldbuilding infrastructure

One of the strongest contest angles is that Sanity is not just storing article metadata.

It is authoring the **world rules**.

Sanity can influence:

- district title,
- district ID,
- wayfinding code,
- route position,
- accent color,
- DEV tags,
- atmosphere mode,
- audio profile,
- landmark type,
- district enabled state,
- curated articles,
- journeys,
- global archive copy and status,
- default movement,
- haze intensity.

The app sanitizes this input before rendering it.

Examples:

- accent colors must be valid hex,
- route bays are clamped,
- enum-like atmosphere/audio/landmark values are validated,
- disabled districts are excluded,
- excessively large route gaps are compacted.

### Interesting design principle

A CMS field can have spatial consequences.

Changing a `routeBay` is closer to moving a neighborhood than editing a paragraph.

Changing `accent` affects wayfinding and local atmosphere.

Changing `landmarkType` changes a physical centerpiece.

That makes content modeling part of level design.

---

# 7. Performance decisions worth mentioning

The project only works as a showcase if it remains comfortable to move through.

Important performance choices include:

- bounded DEV catalogue fetching,
- shared geometry,
- instanced skyline architecture,
- instanced skyline windows/neon,
- inexpensive point/line effects instead of heavy custom shaders where possible,
- active-floor rendering,
- off-floor culling,
- hidden-floor raycast exclusion,
- reduced shadow cost,
- limited anisotropy for article textures,
- stable opaque cover rendering,
- quality-scaled particle/fog counts,
- adaptive rendering systems already present in the cinematic branch,
- decorative landmarks excluded from collision and article raycasts.

### Strong article sentence

> The goal was never "render everything." The goal was to make the player believe everything continues beyond what is currently expensive enough to render.

---

# 8. Bugs / failures that make the story more interesting

Do not hide these in the eventual article. They are the clearest evidence of iteration.

## "The buildings don't look like buildings"

The skyline began as dark abstract masses.

Fixing it required architectural hierarchy, lit windows, panel seams, varied silhouettes, and careful brightness control.

## "The shelves are sparse"

More geometry made the emptiness more obvious.

The answer was not filler blocks. It was a better catalogue pipeline and denser real content.

## "FRONT PAGE only goes up to 3"

Entrance population logic was too restrictive.

FRONT PAGE became a showcase district fed by broader live sources.

## "WEB DEV is empty"

Semantic districts needed explicit tag-seeded samples instead of relying only on generic catalogue flow.

## "Sanity changes aren't showing"

Caching/preview behavior can masquerade as a rendering bug.

The sync path moved toward no-store preview-aware fetching and stronger normalization.

## "There is a giant gap between districts"

CMS route positions were too literal for the desired walking scale.

District spacing gained route compaction so authored values can remain expressive without creating dead travel.

## "Landmarks aren't appearing"

Landmarks needed explicit placement, rendering hierarchy, and then center-path anchoring.

## "The sign is blocking the landmark"

Signs were moved higher.

Later the system became height-aware rather than relying on one magic number.

## "Placeholder blocks are clipping through articles"

Once real articles were present, filler geometry had to be removed.

## Invisible wall / black beyond boundary

The world boundary contradicted the illusion of a huge archive.

The route, particles, atmosphere, and navigation needed to continue into the distance.

## Camera clipping through centered landmarks

The centerline was compositionally correct but physically awkward.

Instead of moving the landmarks, the renderer now fades them at very close range.

This is a particularly good "design compromise became an effect" story.

---

# 9. Commit trail for the final graphics pass

The high-impact polish sequence:

1. `25545c0` — **Animate archive pathway energy and edge flow**
2. `3453047` — **Enhance skyline silhouettes with lit archive towers**
3. `c888047` — **Polish district landmarks and atmospheric effects**
4. `d52abc9` — **Refine shelf reactivity and cinematic presentation**
5. `d03dc13` — **Polish archive haze and cinematic presentation**
6. `1ec7d3a` — **Tune district hero composition at walking height**
7. `80acbbf` — **Refine landmark pass-through framing**

The final `80acbbf` revision passed:

- TypeScript typecheck
- Next.js production build

That is useful contest documentation because the graphics pass remained build-safe while touching a large real-time rendering component.

---

# 10. Good story beats for the eventual article

## Hook: "I tried to turn DEV into a place"

Instead of building another article feed, the project asks what a developer community would feel like if its writing occupied physical space.

Possible opening idea:

> I spend enough time reading developer posts that I started wondering what the feed would look like if it stopped being a feed. Not another grid. Not another infinite scroll. A place.

## Hook: "The CMS became a city planner"

Sanity does not merely publish copy.

It controls district identity and spatial interpretation.

This is probably the strongest technology-specific story.

## Hook: "The first version worked and still felt wrong"

A functioning 3D prototype was not enough.

Shelves could exist and articles could open, but the world still felt empty, dark, confusing, or fake.

The rest of the project became the process of closing the gap between technical functionality and spatial believability.

## Hook: "Every web bug got a physical counterpart"

Examples:

- stale CMS data → empty district,
- sparse API results → empty architecture,
- transparent image sorting → flickering book covers,
- bad navigation → invisible walls,
- label spacing → signage colliding with architecture,
- rendering too much → an entire building becoming slow.

## Hook: "Performance was part of the art direction"

Instancing, culling, bounded fetching, local detail, and restrained effects are what make the scale believable.

The optimization work is not separate from the look.

It enables the look.

---

# 11. Potential article structure

## Title ideas

- **I Turned DEV Into a Walkable Sci-Fi Library**
- **What If a Developer Community Was a Place Instead of a Feed?**
- **I Built a 3D Archive Where DEV Articles Become Books**
- **Sanity Is the CMS. I Used It as a City Planner.**
- **Building an Infinite-Looking Library Without Rendering Infinity**

## Suggested structure

### 1. The idea

Explain the frustration / curiosity behind turning articles into place.

### 2. The first working prototype

Show the earliest functional shelf and article-reading loop.

### 3. Why it still felt fake

Dark buildings, sparse shelves, awkward navigation, empty space.

### 4. Turning content into architecture

Explain DEV ingestion, tags, districts, and Sanity.

### 5. The scale problem

Explain floors, catalogue paging, culling, texture/render cost.

### 6. Designing at human height

Explain walking camera, shelf orientation, landmarks, sign spacing, pass-through fade.

### 7. The cinematic pass

Path energy, skyline, district identities, haze, reactive shelves.

### 8. What I learned

Potential lessons:

- spatial UI exposes different usability problems,
- CMS modeling can become worldbuilding,
- real-time graphics rewards restraint,
- scale is mostly a hierarchy/detail-management problem,
- first-person interfaces need physical explanations for navigation,
- a dramatic effect is often less valuable than one good compositional rule.

### 9. Final result

End with the complete walk/read loop and a few district screenshots or GIFs.

---

# 12. Screenshots / GIFs to capture for the article

Capture these before contest submission.

## Essential

- arrival / FRONT PAGE from player eye height,
- WEB DEV approach with browser-grid motif,
- AI landmark with neural rings,
- LINUX terminal landmark head-on,
- JAVASCRIPT syntax-tree landmark,
- district sign clearly floating above its landmark,
- long view down the energy causeway,
- skyline with window strips and skyscraper-only neon,
- shelf in dormant state,
- same shelf "awake" as the player approaches,
- article/book pulled forward,
- reading mode showing a real DEV article,
- Sanity district editor next to the resulting in-world district.

## Great GIFs

- walking into a district as its halo/pedestal/particles wake up,
- passing through a center landmark and showing the close-range holographic fade,
- shelf covers waking as the player approaches,
- path energy moving toward the archive,
- switching a Sanity accent / district setting and showing the world update.

## Before / after images worth saving

- dark abstract skyline → recognizable archive city,
- sparse entrance → populated FRONT PAGE,
- empty WEB DEV → semantic district population,
- placeholder-filled shelves → real article-only shelves,
- landmark + sign overlap → height-aware composition,
- flat path → animated holographic causeway.

---

# 13. Code explanations for a technical sidebar

## A. The archive spine

`archivePathPoint(bay)` is the world-space backbone.

It maps a simple logical bay index to an `[x, y, z]` coordinate.

The Z axis advances by a fixed bay spacing while X gently curves and Y moves through tier transitions.

Because shelves and landmarks reference the same route functions, they remain coherent even if article counts change.

## B. The frame

`archivePathFrame(bay)` samples the route before and after a bay and derives:

- tangent direction,
- normal direction.

That one frame powers:

- shelf offset,
- walkway width,
- energy lanes,
- skyline placement,
- district architecture,
- player clamping.

## C. Walkway width

The base half-width is 4.1 world units.

District influence can widen the path around plazas.

The entrance gets extra width as well.

This produces "rooms" without abandoning one continuous route.

## D. District mapping

`districtForTags(articleTags, districts)` normalizes DEV tags and scores district overlap.

The best enabled district wins.

This is intentionally understandable rather than "AI magic"; the spatial taxonomy can be inspected and edited.

## E. Sanity normalization

Sanity data is treated as authored input, not blindly trusted runtime state.

Values are validated and clamped before entering the renderer.

This helps keep editorial freedom from breaking the 3D world.

## F. Skyline instancing

Tower bodies, windows, and neon use repeated geometry + instance transforms.

That lets the project create many apparent architectural details while keeping draw/object overhead manageable.

## G. Shelf material cloning

Shared materials are efficient, but they prevent one shelf from reacting independently.

The compromise is shared geometry plus lightweight per-shelf reactive material clones.

The nearest shelf can wake without making the entire archive glow.

## H. Landmark pass-through

The landmarks remain centered because that is best for navigation.

They remain non-colliding because that is best for movement.

Very close to the camera their holographic layers fade.

The final behavior comes from combining three systems instead of forcing one system to solve everything:

- spatial placement for wayfinding,
- collision rules for movement,
- visual fade for camera comfort.

---

# 14. Design rules that emerged during the build

These were not all planned at the beginning. They became rules because something broke without them.

1. **Real articles beat fake density.**
2. **The route cannot depend on catalogue size.**
3. **A district must communicate identity before the player reads its label.**
4. **Shelves and covers are brighter than background architecture.**
5. **Neon belongs to accents, not every object.**
6. **Navigation should exist physically, not only in HUD instructions.**
7. **First-person composition must be judged from human eye height.**
8. **Decorative landmarks should not become invisible collision walls.**
9. **Expensive detail follows the player.**
10. **Use the CMS to author meaning; use rendering code to interpret meaning.**
11. **A cinematic effect should improve hierarchy, not merely add light.**
12. **If the player notices the optimization, it probably needs another pass.**

---

# 15. Contest-demo talking points

A concise demo explanation could be:

> This is a live spatial archive of DEV Community writing. DEV provides the articles; Sanity defines the archive's editorial geography. Districts have tags, colors, landmarks, atmosphere, and route positions. The Three.js renderer turns those rules into a walkable place. As you approach shelves they wake up, you can inspect a real article as a book, open it, read it, close it with E, and keep walking. The skyline, fog, path energy, and district landmarks are all presentation layers around that core reading loop.

Then show Sanity and say:

> This field is not just changing metadata. It changes the identity of a physical district in the world.

That is a memorable contest demonstration.

---

# 16. What changed in the latest thread specifically

The latest thread began with a focused visual-polish brief.

The constraints were explicit:

- visual richness,
- atmosphere,
- motion,
- district identity,
- screenshot-worthy composition,
- performance safety,
- no regressions to reading / movement / syncing.

### First inspection

The branch already contained more useful infrastructure than expected:

- instanced skyline windows/neon,
- continuous archive fog,
- route dots,
- shelf proximity logic,
- bloom/post-processing.

Decision: build on those systems instead of replacing them.

### Path pass

Route dots became three moving energy lanes.

### Skyline pass

Tower silhouettes were lifted enough to read in screenshots, secondary architecture became denser, windows remained bright, neon remained limited to skyscrapers.

### Landmark pass

Landmarks gained scan rings, orbit motes, pulsing pedestals, Sanity-color accents, and district-specific motifs.

### Shelf pass

Shared visual materials were replaced by per-shelf reactive clones where local response was necessary.

### Atmosphere pass

Fog palette expanded and local haze began inheriting the nearest district accent.

### Composition pass

The player camera height was used as a design constraint.

Signs became landmark-height-aware.

The LINUX wall became more holographic.

Landmarks gained a proximity hero treatment.

### Pass-through pass

Centered landmarks now dissolve at very close range to prevent first-person clipping.

### Validation

The final branch passed both TypeScript and Next.js production build checks.

---

# 17. Current project state

At this snapshot:

- article ingestion works,
- article reading works,
- `E` closes the reader,
- pointer-lock browsing is preserved,
- shelves are populated with real DEV articles,
- districts can be driven by Sanity,
- district signs are above landmarks,
- landmarks sit on the center path,
- landmarks are decorative / non-blocking,
- placeholder filler has been removed,
- district gaps are compacted,
- fog continues down the archive,
- skyline structures read as architecture,
- skyscraper neon is isolated to the skyline,
- shelves react to proximity,
- district visual identity is present,
- the main causeway carries animated energy,
- close-range landmark clipping has a holographic fade,
- the latest TypeScript + Next build is green.

---

# 18. Open questions / future article notes

Keep recording these as the project changes:

- Which district produces the strongest screenshot at actual gameplay scale?
- How does the experience perform on a less powerful GPU?
- Does Sanity editing become part of the final live demo?
- How many articles can the streamed archive comfortably expose in one session?
- Should the article discuss the earlier dream-world / Oniria DNA, or present the DEV Library as its own focused experiment?
- Which failure was the most emotionally frustrating during the build? That is often a better story beat than another technical feature.
- What does the project teach about spatial interfaces that would still apply outside a 3D library?

---

# 19. Notes for tone

The eventual article should avoid reading like:

> I added X, then I added Y, then I added Z.

The more interesting story is:

- what the player experienced,
- what felt wrong,
- why the obvious solution was not good enough,
- what constraint forced a better solution,
- how the code reflects that decision.

A useful repeating structure is:

**Observation → constraint → decision → implementation → result.**

Example:

> The landmarks were strongest when centered on the path, but walking through them caused camera clipping. Moving them aside weakened wayfinding, and making them colliders created an obstacle. So they stayed centered, remained non-colliding, and gained a close-range holographic fade. The problem became part of the visual language.

That pattern can carry most of the final contest story.

---

# 20. One-sentence project thesis

**The DEV Library turns live community writing and CMS-authored editorial structure into a walkable archive, using spatial design to make browsing feel like exploration without sacrificing the actual act of reading.**
