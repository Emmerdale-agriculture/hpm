# CLAUDE.md — hampshirepaddockmanagement.com (hpm-site)

## Absolute rules

### Never touch the Lumenira repo
When working on this project (hpm-site / hampshirepaddockmanagement.com), **do not write, merge, push, branch, or otherwise modify anything in the `tomforex1/Lumenira` repository on GitHub**. Lumenira is an unrelated project.

If the configured git remote for hpm-site doesn't exist on GitHub (e.g. `emmerdaleagriculture/hpm` 404s) and you need a place to push, **ask the user for the correct target repo** — never silently fall back to Lumenira or any other unrelated repo.

### Only push when the build is green
**Never `git push` to `main` until the build passes.** Pushing to `main` auto-deploys to production, so a red build = a failed/blocked deploy. Get the build green first, *then* commit and push — never commit+push+deploy in one batch hoping it passes. One change at a time when fixing build errors: `next build` stops at the first type error, so several can hide behind one.

**What "green" means here (read this — local builds give false reds):** `payload-types.ts` is gitignored and regenerated at build time. A local `next build` only generates *correct* Payload types when it can reach the real database; with a dummy/unreachable `DATABASE_URL` it emits degraded types (`JsonObject & TypeWithID`) that throw spurious `MediaLike`/assignability errors which do **not** occur on Vercel. So:
- A clean local build needs a reachable DB. If you only have a dummy DB, the type-check is unreliable — a `MediaLike`/`JsonObject` error or an ESLint *warning* (e.g. unused var) is not necessarily a real failure.
- **The Vercel deploy is the authoritative oracle.** After pushing, confirm the deployment reaches `READY` (poll the Vercel API). If it `ERROR`s, fix forward; production keeps serving the last good deploy until then.
- Treat unverifiable local reds as "needs confirming on Vercel," not "broken" — don't thrash reverting/patching based on a dummy-DB local build alone.
