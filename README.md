# Oniria — The Living DEV Library

**Oniria turns DEV Community into a place you can walk through.**

Instead of browsing another feed, grid, or search page, you enter a persistent 3D library where real DEV articles become books, topics become rooms, search physically restocks shelves, and parts of the archive can evolve over time.

Built for the **Sanity Challenge — Path Two: Vibe-Code Something Strange**.

---

## What is Oniria?

Oniria is an experimental spatial interface for structured content.

The current hackathon build reimagines DEV as a six-room library:

- **R-01 · Featured** — popular and curator-picked writing
- **R-02 · New Arrivals** — recently published DEV articles
- **R-03 · Topics** — tag-driven shelves such as webdev, JavaScript, TypeScript, React, AI, and Linux
- **R-04 · Creators** — authors and the writing connected to them
- **R-05 · Search** — a physical card catalogue backed by live DEV search
- **R-06 · Archive** — a deeper, progressively browsable collection

The goal is not to replace DEV.

It is to explore a different question:

> **What if information had geography?**

Articles can be approached as physical objects, inspected, opened in a reading interface, searched for, and revisited inside an environment that remembers its own structure.

---

## Why Sanity?

Sanity is not just storing page copy for Oniria.

It acts as the **persistent memory and control layer for the world**.

DEV provides live article content. Sanity stores the authored and evolving structure around that content. Three.js turns both into a navigable environment.

~~~text
DEV API
   │
   │ live articles / creators / tags / search
   ▼
Oniria application
   │
   ├──────────────► Three.js
   │                 3D architecture
   │                 books + shelves
   │                 navigation
   │                 interactions
   │
   ▼
Sanity
world configuration
room definitions
layout markers
curator picks
guided journeys
living shelf state
history / lifecycle
~~~

This separation lets article data remain live while the library itself can have persistent authored structure.

---

## The Sanity model

The current Studio is organized as **Oniria Archive Control**.

### Library Control

Global world settings control things such as:

- welcome copy
- movement defaults
- atmosphere
- haze intensity
- live DEV updates
- deep archive behavior
- featured room selection

### Library Rooms

Each of the six physical rooms is represented as structured content with its own identity, ordering, atmosphere, content source, DEV tags, accent, and landmarks.

### Layout Pins · Authoring

One of the most important systems in the project came from a failure in the AI-assisted workflow.

Generating a 3D library entirely from code worked, but describing exact shelf placement through prompts was unreliable. A model could understand "move this shelf to the other wall," but it could not see the world with the same spatial precision as the person walking through it.

So Oniria gained an **in-world layout authoring tool**.

A position can be marked directly inside the running 3D environment and persisted as a Sanity **libraryLayoutMarker** document containing:

- room
- district
- world X / Y / Z
- rotation
- zone width
- zone depth
- creation time

That turned Sanity into part of the level-authoring workflow.

### Living Shelf Slots

Physical shelf locations can also have persistent state through **librarySlotState** documents.

A slot has a stable identity even when its content changes. Sanity stores:

- current occupant
- topic
- lifecycle
- vitality
- signal score
- recent article count
- materialization time
- last active time
- cooling state
- event history

The lifecycle is:

~~~text
dormant
   ↓
forming
   ↓
active
   ↓
cooling
   ↓
dormant
~~~

A shelf can therefore disappear from active use without losing the history of what previously occupied that physical location.

### Curator Picks and Guided Journeys

Sanity also supports curated DEV articles and ordered archive journeys so the library can combine live network data with intentional editorial structure.

---

## A living library

The Topics room can evolve based on recent DEV activity.

The scheduled **/api/library-evolution** route:

1. samples recent DEV articles
2. measures topic signals
3. evaluates available physical slots
4. updates their lifecycle and vitality
5. persists the resulting state to Sanity
6. lets every visitor render the same shared world state

Vercel runs the evolution endpoint every 30 minutes.

The important distinction is that **the shelf position is persistent while the occupant can change**.

The world has memory.

---

## Search is spatial

Search is not only a results panel.

The Search room treats a query like a physical restock operation. Results can populate shelves inside the environment so discovery remains part of the world instead of pulling the visitor out of it.

The DEV API proxy supports live article discovery while Oniria handles normalization, cover-image proxying, caching behavior, and spatial presentation.

---

## The build process

Oniria changed direction several times during the hackathon.

It began as a Sanity-backed dream journal with a relationship map. That evolved into a WebGL dream universe, first-person exploration, generated environments, and portal travel.

The same underlying question kept becoming more interesting:

> Can structured information become a place instead of a page?

That eventually produced a first-person DEV browser and then the current library.

Several of the strongest systems came from things **not working**:

- giant shelf fields were technically impressive but hard to navigate
- empty shelves made supported destinations look unfinished
- procedural layouts created collision and orientation problems
- loading too many book covers caused flicker and unnecessary GPU work
- camera state could reset when streamed catalogue data arrived
- AI-generated placement was not precise enough for hand-directed architecture
- decorative navigation geometry sometimes made the world harder to understand instead of easier

The project repeatedly moved toward simpler rules:

- one understandable building
- six obvious rooms
- human-scale walking
- full detail only where interaction matters
- shared spatial definitions for rendering and collision
- authored layout where precision matters
- live data where freshness matters
- persistent state where the world needs memory

A longer engineering narrative is kept in:

**docs/DEV_LIBRARY_HACKATHON_STORY_NOTES.md**

---

## Tech stack

- **Next.js 16**
- **React 19**
- **TypeScript**
- **Three.js**
- **Sanity**
- **next-sanity**
- **DEV / Forem API**
- **Vercel**
- GLB assets for architectural and environmental pieces

The 3D building itself is assembled through code, configuration, reusable geometry, and loaded assets rather than a traditional level editor.

---

## Run locally

Requirements:

- Node.js compatible with the current Next.js release
- npm

~~~bash
git clone https://github.com/miflow13/Oniria.git
cd Oniria
npm install
npm run dev
~~~

Open:

- **http://localhost:3000** — redirects to the DEV Library
- **http://localhost:3000/map** — DEV Library
- **http://localhost:3000/surf** — alternate DEV Library route
- **http://localhost:3000/studio** — embedded Sanity Studio when configured

You can explore the application locally without configuring every production integration.

---

## Environment configuration

Copy the example environment file:

~~~bash
cp .env.local.example .env.local
~~~

### Sanity connection

~~~env
NEXT_PUBLIC_SANITY_PROJECT_ID=
NEXT_PUBLIC_SANITY_DATASET=production
~~~

### Server-side Sanity tokens

Never expose these with a **NEXT_PUBLIC_** prefix.

~~~env
SANITY_API_READ_TOKEN=
SANITY_API_WRITE_TOKEN=
~~~

The read token enables live draft preview.

The write token is required for operations that persist or evolve world state, including the library seed script and living shelf updates.

### Layout authoring

For protected deployed layout authoring:

~~~env
LIBRARY_LAYOUT_AUTHORING_KEY=
~~~

Local development can use the layout-authoring workflow without this key.

### Living-library evolution

Production evolution can use:

~~~env
CRON_SECRET=
LIBRARY_EVOLUTION_KEY=
~~~

**CRON_SECRET** protects scheduled requests from Vercel. **LIBRARY_EVOLUTION_KEY** can optionally protect manual production evolution requests.

Keep all of these server-side.

---

## Seed the six-room world

With Sanity configured and a write token available:

~~~bash
npm run seed:library
~~~

This creates or updates the main library configuration, the six room documents, and the default guided journey.

---

## Useful development commands

~~~bash
npm run dev
npm run typecheck
npm run build
npm run start
npm run sanity
npm run seed:library
~~~

---

## Project structure

~~~text
src/
  app/
    api/
      devto/                 # DEV / Forem data + image proxy
      library-evolution/     # living-world evolution
      library-layout-markers/# spatial authoring persistence
      library-world/         # Sanity-backed world config
    map/
      DevLibraryMap.tsx      # application-level library experience
      DreamWorld3D.tsx       # Three.js renderer / world runtime
      libraryRoomLayout.ts   # physical room + shelf layout
      libraryLayoutAuthoring.ts
      libraryTypes.ts
    studio/                  # embedded Sanity Studio
    surf/                    # alternate DEV Library entry
  lib/
    libraryEvolution.ts
    libraryTopicSignals.ts
    libraryWorldConfig.ts
  sanity/
    schemaTypes/
      libraryConfigType.ts
      libraryDistrictType.ts
      libraryLayoutMarkerType.ts
      librarySlotStateType.ts
      curatedArticleType.ts
      archiveJourneyType.ts
      dreamType.ts           # legacy project history
      symbolType.ts          # legacy project history

scripts/
  seed-library-world.mjs

docs/
  DEV_LIBRARY_HACKATHON_STORY_NOTES.md
  SANITY_SIX_ROOM_MIGRATION.md
~~~

---

## Legacy: where Oniria started

The original Oniria prototype was a Sanity-backed dream journal.

Dreams referenced recurring symbols, and those relationships generated a visual map. During the hackathon that map became increasingly spatial and eventually turned into a general experiment in navigating structured information.

The old **dream** and **symbol** schemas remain in the repository as part of that development history, and Sanity Studio keeps them under **Legacy Dream Journal**.

The DEV Library is the current product direction.

---

## Experimental Oni SDK — stretch goal

A possible next step is extracting the reusable spatial-content architecture into **Oni**, a small experimental SDK.

The goal would not be to replace Three.js. It would expose the parts Oniria had to invent:

~~~text
structured content
      ↓
world
district
spatial slot
content adapter
lifecycle
persistence
      ↓
Three.js / Sanity
~~~

That could eventually let the same system represent repositories, documentation, knowledge bases, music collections, research archives, or other structured content as persistent explorable worlds.

For the hackathon, this remains a stretch goal. The priority is the finished Oniria experience.

---

## Hackathon

Oniria is being built for the **Sanity Challenge — Path Two: Vibe-Code Something Strange**.

The submission focuses heavily on the real build process: prompts that worked, prompts that failed, visual QA, architectural course corrections, and the point where an AI-assisted 3D workflow required building a new authoring tool instead of writing a better prompt.

---

## Author

**Mika Flowers**

GitHub: https://github.com/miflow13

---

## Status

**Hackathon submission build — active final polish.**

Current priorities:

- final UX and performance QA
- submission screenshots
- demo recording
- Sanity project details
- asset/license review
- final DEV Community submission
