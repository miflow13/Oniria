# Sanity six-room DEV Library migration

The physical DEV Library is now a fixed six-room building. Sanity owns the room
identity and presentation metadata; DEV remains the source of truth for article
content.

## Room content sources

Each `libraryDistrict` document now has:

- `roomSlot` — integer 0 through 5
- `sourceMode` — one of:
  - `featured`
  - `latest`
  - `topics`
  - `creators`
  - `search`
  - `catalog`
  - `tagged`

The default floor plan is:

| Slot | Room | DEV source |
| --- | --- | --- |
| 0 | Featured | trending + curated Sanity article IDs |
| 1 | New Arrivals | latest DEV articles |
| 2 | Topics | live DEV tag queries |
| 3 | Creators | author shelves / creator queries |
| 4 | Search | live DEV search results |
| 5 | Archive | progressively paginated DEV catalogue |

## Data ownership

Sanity stores world intent:

- room names and order
- room accents / atmosphere / audio profile
- DEV tag hints
- curated article IDs
- archive journeys
- global library settings

DEV stores article truth:

- title
- author
- body
- tags
- reactions/comments
- cover/social image
- publication date

Do not mirror the full DEV catalogue into Sanity.

## Migrating the dataset

Run:

```bash
npm run seed:library
```

with `NEXT_PUBLIC_SANITY_PROJECT_ID` and `SANITY_API_WRITE_TOKEN` available.

The seed creates/replaces the six new room documents and updates the global
library control and default Library Tour journey.

Old cinematic district documents can remain in the dataset during migration.
The runtime intentionally ignores legacy district documents that have neither
`sourceMode` nor `roomSlot`, so they cannot collapse into the first room.

## Runtime flow

```text
Sanity /api/library-world
        |
        +-- room identity / source mode / curation / atmosphere
        |
DEV /api/devto
        |
        +-- live article bodies / feeds / tags / authors / search
        |
        v
DevLibraryMap
        |
        +-- maps each live DEV source into a Sanity-authored room
        |
        v
DreamWorld3D + libraryBuilding
        |
        +-- cinematic reading ritual / audio / post-processing
        +-- six-room physical building and authored GLB assets
```
