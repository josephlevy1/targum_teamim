# Hosting plan

## Chosen deployment model

Deploy the public web application to Vercel and keep the Mac mini as a private, outbound-only worker for OCR, imports, alignment, and recovery backups. This separates low-latency public traffic from long-running, storage-heavy processing.

Operational preference: use provider CLIs for cloud provisioning and routine management whenever they support the required action. Use the provider UI only for authorization, billing, or actions unavailable in the CLI.

The current SQLite and local-file implementation cannot be deployed directly to Vercel: the deployed functions need managed database and object storage instead of `data/app.db` and the local filesystem. The worker and Vercel application communicate only through shared cloud services; Vercel never reaches into the home network.

## Target architecture

```text
Browser -> Vercel Next.js app -> PostgreSQL (verses, edits, jobs, metadata)
              |                         ^
              v                         |
       Blob/R2 (pages, thumbnails) <- Mac mini worker (OCR, imports, alignment)
                                          |
                                          `-> scheduled encrypted backup copies
```

Keep Clerk for authentication. Restrict every mutation and operations route; the current middleware intentionally leaves the manuscript dashboard public, so either protect it before launch or gate it with a separate shared-secret/allowlist policy.

## Phase 0: production readiness (1-2 days)

1. Inventory the existing `data/` directory: database size, source images, generated artifacts, and expected growth.
2. Add a production environment contract: `NODE_ENV`, Clerk production keys, a non-personal audit author identity, public application URL, database URL, object-storage credentials, OCR provider credentials, and error-monitoring DSN.
3. Change `getDataPaths()` and image/artifact access behind storage interfaces so local development can retain SQLite/files while production uses managed services.
4. Add CI for `pnpm typecheck`, `pnpm test`, and `pnpm build`; make these required on `main`.
5. Add `/api/health` and a non-sensitive readiness check covering database connectivity and object storage.

## Phase 1: migrate the shared state (required before Vercel cutover)

1. Migrate SQLite schema and data to managed PostgreSQL. Vercel and the Mac worker must read and write the same database; a mounted SQLite file cannot safely be shared between them.
2. Move manuscript page images and thumbnails to Cloudflare R2 or Vercel Blob. Preserve stable object keys in the database, replace the current Mac-specific absolute paths, and serve private files through authenticated signed URLs.
3. Keep generated OCR crops and historical backups out of the Vercel runtime. Upload them only to lifecycle-managed object storage when retention is needed.
4. Convert OCR/import/alignment API actions into idempotent queue submissions. The Mac worker leases and processes queued jobs, writes artifacts to object storage, and records results in PostgreSQL.
5. Add worker authentication with a dedicated secret, job leasing/heartbeats, retry limits, and stale-job recovery. The worker polls outbound; do not expose the Mac as a public webhook endpoint.

## Phase 2: deploy the Vercel web application

1. Connect the GitHub repository to Vercel. Deploy previews for pull requests and deploy production from protected `main`.
2. Set production secrets: Clerk keys, PostgreSQL connection string, object-storage credentials, worker API secret, public application URL, and error-monitoring DSN.
3. Set the Vercel region close to PostgreSQL and keep API handlers short; they should read/write shared state and enqueue work only.
4. Attach `taam.im` and `www` to Vercel after production smoke tests, then update Clerk production origins and redirect URLs.
5. Retain Cloudflare only for DNS/WAF if desired; retire the tunnel after DNS cutover succeeds.

## Phase 3: local worker and backups

1. Run the existing OCR/import/alignment scripts as a supervised local worker process. It uses the shared PostgreSQL job queue and object store rather than the Vercel filesystem.
2. Schedule database logical backups and object-storage inventory/replication from the Mac. Also enable managed PostgreSQL point-in-time recovery; local backups are an additional recovery copy, not the sole one.
3. Alert on worker heartbeat loss, failed jobs, backup failure, database connection errors, and object-storage growth.
4. Test restoration into an isolated database and object-storage prefix before declaring the rollout complete.

## Superseded alternative: persistent Node host

1. Provision a Node service with a persistent volume and Node 22 support (Railway, Render, or Fly.io).
2. Build with `pnpm install --frozen-lockfile` and `pnpm build`; start with `pnpm --filter web start` and bind the platform-provided `PORT`.
3. Copy the current `data/` directory to the persistent volume before the first release, then run an integrity/read-only export check.
4. Put Cloudflare in front of the service, attach `taam.im`/`www`, force HTTPS, and configure Clerk’s production allowed origins and redirect URLs.
5. Schedule encrypted database backups to R2/S3, retain daily backups for 30 days, and test a restore into a non-production volume.
6. Configure uptime, structured error monitoring, and alerts for failed deployments, DB backup failures, job failures, and disk usage.

This remains a valid short-term alternative when a Vercel cutover is not required. It retains SQLite and local files on a single persistent volume, but is no longer the selected target architecture.

## Release checklist

1. Verify production build and all tests from the exact commit to deploy.
2. Run a database backup and restore rehearsal.
3. Smoke-test public reading/export endpoints and authenticated mutations against production.
4. Confirm dashboard exposure is intentional and that OCR/import controls are admin-only.
5. Set DNS, verify Clerk callbacks, enable monitoring, and publish a rollback procedure (previous image/deployment plus database restore decision tree).

## Decisions needed before implementation

- Choose the managed PostgreSQL and object-storage vendors (recommended: Neon/Supabase plus Cloudflare R2, or Vercel Marketplace equivalents).
- Decide whether manuscript images may be publicly accessible or require signed URLs.
- Define the administrators allowed to run imports/OCR and whether the monitoring dashboard can remain public.
- Set backup retention, recovery point objective, and recovery time objective.
