# Oniria submission readiness — October 3, 2026

Submission: https://dev.to/mikachu/i-tried-to-prompt-a-3d-dev-library-into-existence-then-i-had-to-build-my-own-level-editor-37gf
Rules: https://dev.to/challenges/sanity-2026-09-16
Repository: https://github.com/miflow13/Oniria

## Submission criteria

- Path Two identification, required `sanitychallenge` tag, repository link, substantive build-process writeup, and Sanity project ID are present in the published post.
- Sanity project: `z5fp07ep`; dataset: `production`; embedded Studio: `/studio`.
- Public sanitized transcripts are reachable from the post. The DEV Agent Sessions uploader is optional; a GitHub transcript is supporting evidence rather than an uploader embed.
- Live app and demo video still say `TBA`. Replace both after verification and recording.
- Screenshot headings currently have no images. Add actual captures or remove the empty headings.
- App SDK and Sanity Workflows are optional. The custom evolution route is application logic, not evidence of using the Sanity Workflows product.
- Deadline: October 4, 2026, 11:59 PM PDT (October 5, 2:59 AM EDT).

## Evidence and limitations

The audit started from GitHub main `dcaa27f`. The desktop checkout is a separate `feat/living-prototype` branch containing newer runtime changes; those changes are not part of this submission branch.

Authenticated read-only Sanity counts found 9 published room documents, 3 draft room documents, and 12 shelf-state documents. No layout-marker documents were found. Anonymous counts exposed one library configuration but no room or shelf documents. Configure a server-side read token and verify the returned enabled rooms after deployment. Do not run the seed script blindly: it replaces configuration and room documents.

The renderer can fall back to default rooms. A working default scene alone does not prove that the Sanity-backed world is loading. Check `/api/library-world` for `source`, room count, sync mode, and revision.

The background music file referenced by the renderer was untracked in the desktop checkout. This branch includes that supplied file at its documented runtime path. Attribution names SolarFLEX in `public/audio/README.md`; the original source URL and redistribution/license evidence remain to be confirmed. Supplied GLB asset licensing also needs confirmation. Do not claim the license audit is complete.

Draft world data is available only on the local development server. Deployed world reads use published data; deployed layout mutations require the authoring key. Regression tests cover production, preview, and non-Vercel hosting boundaries.

## Concrete deployment payload

Deploy this repository branch as a new Oniria Next.js project. Use Node 22, `npm ci`, and `npm run build`. Include tracked application source, public assets, schemas, lockfile, and configuration. Exclude `.env*` secrets, `.git`, local dependencies, generated build output, and private session files.

Required environment:

```env
NEXT_PUBLIC_SANITY_PROJECT_ID=z5fp07ep
NEXT_PUBLIC_SANITY_DATASET=production
SANITY_API_READ_TOKEN=<server-side read token>
```

For persistent scheduled evolution, also set `SANITY_API_WRITE_TOKEN` and `CRON_SECRET` as server-only secrets. Keep layout authoring disabled unless deliberately enabling it with `LIBRARY_LAYOUT_AUTHORING_KEY`.

The committed `*/30 * * * *` schedule requires Vercel Pro or Enterprise. If deploying to Hobby, explicitly choose daily scheduling and update the post's 30-minute claim accordingly. Do not buy or upgrade a plan automatically.

The connected Vercel account exposes only the Premiere Ops team and no Oniria project. Deployment destination approval remains required after automatic review rejected an unspecified deployment. No deployment URL has been verified.

## Deployment acceptance checks

1. Open the stable app URL without a Vercel login.
2. Verify `/` leads to `/map`, the scene renders, and supplied GLB assets and music load.
3. Verify `/api/library-world` returns Sanity data rather than fallback and published sync mode, even with `?preview=1`.
4. Verify DEV bootstrap, a search, article opening, and exact return to the shelf.
5. Verify unauthenticated layout POST/DELETE return 403 and evolution returns 401.
6. Confirm Studio access instructions; visitors should not need an account to browse the library. Sanity Studio requires authorized membership.
7. Verify the scheduler in the hosting dashboard before claiming it is running.
8. Add the verified URL and final video to the DEV post.

Local production verification passed: Sanity source, published perspective even with preview requested, six enabled rooms, 12 slots, live DEV bootstrap (60 feed and 60 latest articles), music HTTP 200, layout POST/DELETE 403, and evolution 401. The configured first room currently reports `A-18`, rather than the post's `R-01`; confirm the intended room identity in Studio.

Browser verification showed the authored scene and Sanity published badge. It exposed unrelated results from the old search endpoint. Search now uses supported article/tag queries and keyword matching over a bounded live sample; it is not a full-archive text search. Update the post if it implies exhaustive search. Article opening and exact return-to-shelf still need a complete walkthrough.

Build and route checks do not replace visual/performance QA or license evidence.

## Demo recording sequence

1. Enter the library; explain that DEV owns articles and Sanity owns world structure.
2. Browse Featured/New Arrivals, target a book, open the article, and return to the same shelf.
3. Search and show shelves restocking around results.
4. Visit Topics and Archive.
5. Show the six-room schema, configuration, and persisted shelf lifecycle in Studio.
6. Demonstrate spatial authoring locally if desired; no layout pins are currently persisted in the audited dataset.
7. Finish with the repository and verified live URL. Show scheduler evidence only after deployment verification.
