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
# Oniria


## Living DEV Library evolution

The Topics room can evolve persistent shelf occupancy from live DEV activity.

- Physical shelf coordinates are permanent slots.
- Sanity `librarySlotState` documents store each slot's current occupant, lifecycle, vitality, and history.
- `/api/library-evolution` samples recent/trending DEV articles and evolves topic slots.
- Vercel runs the evolution endpoint every 30 minutes through `vercel.json`.
- The renderer reads the shared Sanity slot state, so visitors see the same world.

Production requires:

```env
SANITY_API_WRITE_TOKEN=your_server_side_write_token
CRON_SECRET=use_a_long_random_secret
```

Vercel sends `CRON_SECRET` to the scheduled endpoint as a Bearer token. Keep both values server-only.

For local development, with Sanity configured and a write token available, force an evolution pass with:

```text
GET /api/library-evolution?force=1
```

The lifecycle is `dormant → forming → active → cooling → dormant`. Archival events remain in the slot's Sanity history even after the physical space becomes available again.
