# Oniria — Phase 1

Phase 1 foundation for a Sanity-backed dream journal built with Next.js App Router.

## Zero-config demo mode

You **do not need environment variables or a Sanity project to test the app right now**.

```bash
npm install
npm run dev
```

Open:

- Journal: http://localhost:3000
- Dream map: http://localhost:3000/map
- New dream: http://localhost:3000/studio

When Sanity credentials are absent, Oniria automatically enters **local demo mode**:

- three sample dreams are shown
- `/studio` becomes a lightweight local entry form
- you can select existing symbols
- you can create new symbols inline
- saved test dreams and symbols are stored in browser `localStorage`
- nothing is uploaded anywhere

This makes the complete Phase 1 UI testable before connecting Sanity.

## Connecting Sanity later

The real Sanity schema/client/query layer is already included. When you're ready, add:

```env
NEXT_PUBLIC_SANITY_PROJECT_ID=your_project_id
NEXT_PUBLIC_SANITY_DATASET=production
```

The app will automatically switch from local demo mode to Sanity-backed mode, and `/studio` will render the embedded Sanity Studio.

## Included

- `dream` schema: date, optional title, body, mood 1–5, lucid state, symbol references
- `symbol` schema: name, category, icon
- computed symbol frequency GROQ query
- embedded Sanity Studio when configured
- zero-config local test form when Sanity is not configured
- reverse-chronological dream journal
- symbol chips, mood indicator, lucid indicator
- dark navy/purple/cyan placeholder visual language inspired by the supplied mockups
- `/map` relationship-map prototype generated from the same dream/symbol data
- symbol frequency badges and co-occurrence connections
- clickable symbol detail card showing the dreams behind each node

## Map prototype scope

The `/map` route is intentionally a lightweight Phase 1.5 prototype. It derives a stable symbol graph from the same dream documents used by the journal. Symbols that occur in the same dream are connected; recurring symbols get larger/frequency badges.

Still out of scope:

- force-directed or physics clustering
- draggable/pannable infinite canvas
- time slider
- mood overlays
- Sanity Workflows

## Project structure

```text
src/
  app/
    DreamList.tsx
    page.tsx
    page.module.css
    globals.css
    layout.tsx
    map/
      page.tsx
      DreamMap.tsx
      map.module.css
    studio/[[...tool]]/
      page.tsx
      StudioClient.tsx
      DemoEntryForm.tsx
      studio.module.css
  lib/
    demoData.ts
  sanity/
    env.ts
    lib/
      client.ts
      queries.ts
    schemaTypes/
      dreamType.ts
      symbolType.ts
      index.ts
  types/
    dream.ts
sanity.config.ts
sanity.cli.ts
```

## Quick smoke test

1. `npm run dev`
2. Open `/`
3. Confirm the three sample dreams render.
4. Open `/map` and confirm symbol nodes and connections render.
5. Click **+ New dream**.
6. Enter a dream, mood, lucid state, and symbols.
7. Click **+ Create symbol** and make a custom symbol.
8. Save the dream.
9. Confirm it appears at the top of the journal and changes the map.

## Exporting the outdoor library

Open `/surf` and wait for the **Export GLB** control in the upper-right corner
to become available. It downloads `oniria-outdoor-library.glb`, a binary glTF
package that can be imported directly into the [three.js editor](https://threejs.org/editor/).

The exported scene is a snapshot of the currently loaded catalogue. It includes
the procedural terrace halls, landscape, authored library/environment assets,
lights, labels, and clouds; browser-only interaction, navigation, live DEV data
fetching, and cloud motion are intentionally not part of the static GLB.

The original low-poly environment attribution remains in
`public/assets/lowpoly-environment/ATTRIBUTION.md`; retain it when redistributing
an exported world.
# Oniria
