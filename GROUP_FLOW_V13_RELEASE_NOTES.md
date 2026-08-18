# GROUP FLOW V13 Stable - Release Notes

## Required Supabase migration
Run `supabase/v13_stability.sql` once in Supabase SQL Editor before deploying V13.
It is idempotent and aligns the database with the queries used by the current app and scheduler.

## Fixes
- Groups/Dashboard/Queue queries now use the current schema and tolerate optional group columns during migration.
- Removed legacy component queries that referenced `daily_queue`, `posting_history`, and old content relations.
- Added the missing `group_categories` schema.
- Added scheduler lifecycle fields and `posting` status support.
- Chrome Extension automatically clears stale local jobs, retries finish callbacks, recovers stale server jobs, and continues to the next queue.
- Light theme completed on core dashboard/login/group management surfaces; Prompt remains the global font.

## Features completed
- Per-day multiple schedules. Each weekday can have its own list of times.
- Per-queue Post as: Facebook Profile or Facebook Page.
- Existing queues remain backward compatible with group-level posting identity through `post_as = 'group'`.

## Extension
- Manifest name: GROUP FLOW Posting Agent V13
- Extension version: 1.0.15

## Validation performed
- `git diff --check` passed.
- All Chrome Extension JavaScript files passed `node --check`.
- Extension JSON files parsed successfully.
- Legacy runtime table query scan passed (no `facebook_groups`, `daily_queue`, `posting_history`, or old `contents` queries remain).

## Build environment note
A full `npm run build` could not be executed in the supplied sandbox because the internal npm registry returned 404 for `yaml@2.9.0`. The sandbox also provides Node 22 while this repository currently declares Node 24.x. Run the final build in Vercel/CI or a Node 24 environment with normal npm registry access.

## Important repository observation
The supplied ZIP declares Next.js `16.2.10` in `package.json`, although the project brief says Next.js 15. V13 keeps the supplied repository dependency versions instead of silently downgrading the framework.
