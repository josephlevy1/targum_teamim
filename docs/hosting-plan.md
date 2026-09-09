# Hosting plan

## Recommendation

Deploy the web application as a persistent Node service on Railway, Render, or Fly.io for the first public release. The current application writes to SQLite at `data/app.db`, serves manuscript image artifacts from `data/`, and runs OCR/import jobs. Those needs do not fit a pure Vercel deployment: Vercel function filesystems are ephemeral, SQLite writes are not shared across instances, and long-running work is constrained.

Use Vercel only after the persistence and worker migration described below, or use it for preview deployments while the production service remains persistent.

## Target architecture

```text
Browser -> Cloudflare DNS/WAF -> Next.js Node service
                                      |-- PostgreSQL (transactional data)
                                      |-- S3/R2 (manuscript images, exports, backups)
                                      `-- worker/queue (OCR and import jobs)
```

Keep Clerk for authentication. Restrict every mutation and operations route; the current middleware intentionally leaves the manuscript dashboard public, so either protect it before launch or gate it with a separate shared-secret/allowlist policy.

## Phase 0: production readiness (1-2 days)

1. Inventory the existing `data/` directory: database size, source images, generated artifacts, and expected growth.
2. Add a production environment contract: `NODE_ENV`, Clerk production keys, a non-personal audit author identity, public application URL, database URL, object-storage credentials, OCR provider credentials, and error-monitoring DSN.
3. Change `getDataPaths()` and image/artifact access behind storage interfaces so local development can retain SQLite/files while production uses managed services.
4. Add CI for `pnpm typecheck`, `pnpm test`, and `pnpm build`; make these required on `main`.
5. Add `/api/health` and a non-sensitive readiness check covering database connectivity and object storage.

## Phase 1: simplest public deployment (2-4 days)

1. Provision a Node service with a persistent volume and Node 22 support (Railway, Render, or Fly.io).
2. Build with `pnpm install --frozen-lockfile` and `pnpm build`; start with `pnpm --filter web start` and bind the platform-provided `PORT`.
3. Copy the current `data/` directory to the persistent volume before the first release, then run an integrity/read-only export check.
4. Put Cloudflare in front of the service, attach `taam.im`/`www`, force HTTPS, and configure Clerk’s production allowed origins and redirect URLs.
5. Schedule encrypted database backups to R2/S3, retain daily backups for 30 days, and test a restore into a non-production volume.
6. Configure uptime, structured error monitoring, and alerts for failed deployments, DB backup failures, job failures, and disk usage.

This phase retains the current SQLite and local-file model and is the fastest safe route online. It should run as a single application instance to prevent concurrent SQLite writers.

## Phase 2: Vercel-compatible architecture (1-2 weeks)

1. Migrate the SQLite schema and data to managed PostgreSQL (Neon, Supabase, or Vercel Postgres) and replace the `better-sqlite3` repository implementation with a database adapter.
2. Move `data/imports/manuscripts` source images, thumbnails, crops, and exports to Cloudflare R2 or S3. Store object keys/metadata in PostgreSQL and deliver private assets with signed URLs.
3. Move OCR, manuscript imports, full-Torah scrape, alignment expansion, and calibration scripts to a queue-backed worker (Inngest, Trigger.dev, a Railway worker, or a container job). API routes should enqueue work and return job IDs.
4. Make all web requests stateless, use connection pooling, add idempotency for mutations/jobs, and set Vercel function durations only for short request work.
5. Deploy the Next.js app to Vercel with preview deployments for pull requests and production deploys from protected `main`.

## Release checklist

1. Verify production build and all tests from the exact commit to deploy.
2. Run a database backup and restore rehearsal.
3. Smoke-test public reading/export endpoints and authenticated mutations against production.
4. Confirm dashboard exposure is intentional and that OCR/import controls are admin-only.
5. Set DNS, verify Clerk callbacks, enable monitoring, and publish a rollback procedure (previous image/deployment plus database restore decision tree).

## Decisions needed before implementation

- Choose the first-release platform: persistent Node service (recommended) or a larger Vercel migration.
- Decide whether manuscript images may be publicly accessible or require signed URLs.
- Define the administrators allowed to run imports/OCR and whether the monitoring dashboard can remain public.
- Set backup retention, recovery point objective, and recovery time objective.
