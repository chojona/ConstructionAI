# Construction AI

Phase 1 establishes a trustworthy construction-document source layer. A logical `Document` owns immutable uploaded `DocumentRevision` records, and every extracted `DocumentPage` retains stable page identity for future evidence.

## Local setup

Requirements: Node.js 22 and PostgreSQL 17 (the included Compose file provides PostgreSQL).

```bash
cp .env.example .env
docker compose up -d postgres
npm install
npx prisma migrate deploy
npm run db:seed
npm run dev
```

Open [http://localhost:3000/projects](http://localhost:3000/projects).

Files are stored under `DOCUMENT_STORAGE_DIR` using generated keys. The original filename is retained only as display metadata. The seeded organization id is `org_demo`; `APP_ORGANIZATION_ID` selects the organization used by the Phase 1 UI. API callers may provide `x-organization-id` as the already-authenticated tenancy context until authentication is introduced.

## Deploy to Vercel with Neon

Vercel detects the Next.js app automatically; `vercel.json` pins the framework preset. Import the repository into Vercel, then create a Neon PostgreSQL database and add these environment variables to the Vercel project:

- `DATABASE_URL`: Neon pooled connection string. The app passes it to the PostgreSQL driver adapter.
- `DIRECT_DATABASE_URL`: Neon direct (non-pooled) connection string. Prisma Migrate reads it from `prisma.config.ts`.
- `APP_ORGANIZATION_ID`: organization id used by the UI, such as `org_demo` after seeding.
- `DOCUMENT_STORAGE_DIR`: optional for local development only.

For a database that is not built on Vercel, apply the checked-in migrations with `DIRECT_DATABASE_URL` set:

```bash
npx prisma migrate deploy
npm run db:seed
```

The Vercel build runs `prisma migrate deploy` and `npm run db:seed` before `next build`. Migrate uses `DIRECT_DATABASE_URL` when it is set and `DATABASE_URL` otherwise. Seed upserts the organization selected by `APP_ORGANIZATION_ID`, or `org_demo` when that variable is unset, and loads HeavyJob fixture snapshots onto the demo project `project_heavyjob_demo`. For `org_demo`, seed also loads the demo portfolio. Running `npm run db:seed` again adds any missing rows and leaves review decisions that are already stored. `prisma generate` still runs during dependency installation.

After seeding, open:

- [Projects](http://localhost:3000/projects) for the portfolio. North River Bridge (`project_demo_review`, civil) and Harbor Warehouse Fit-Out (`project_demo_harbor`, commercial) still have open proposed facts. Pike Street Bus Corridor, I-405 Bellevue Widening, and Fremont Clinic TI are already reviewed.
- [Changes](http://localhost:3000/changes) for the open queue across those jobs.
- [North River Bridge documents](http://localhost:3000/projects/project_demo_review?view=documents) and [its changes](http://localhost:3000/projects/project_demo_review?view=changes). Earthworks keeps revisions `revision_demo_earthworks_04` and `revision_demo_earthworks_05`.
- [HeavyJob snapshots](http://localhost:3000/projects/project_heavyjob_demo?view=heavyjob) on Northstar River Road Reconstruction. Rows stay unlabeled: type, source id, fetched-at, and raw payload.

Document files currently use local filesystem storage. Vercel function filesystems are temporary, so uploaded documents will not persist reliably across requests or deployments on Vercel. Use a persistent object-storage backend before relying on document uploads in a hosted environment.

## Checks

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

## HeavyJob source snapshots

`npm run db:seed` stores checked-in HeavyJob-shaped fixtures for one demo project. Each row is a fetch snapshot (`HeavyJobSourceObject`) linked to that project, with `sourceId`, `fetchedAt`, the raw payload, and an object type of `timecard`, `cost_code`, `quantity`, `diary`, or `attachment`. Loading the same snapshot again does not rewrite it. Timecard `isTm` and `isRework` flags stay inside the raw payload as source data.

Read them with `GET /api/projects/{projectId}/heavyjob-objects`, optionally filtered by `objectType`. The same organization header used by the rest of the API applies.

After seeding, open `/projects/project_heavyjob_demo?view=heavyjob` (the HeavyJob tab on Northstar River Road Reconstruction). The table columns are type, sourceId, fetchedAt, and a collapsed raw expand.

This layer does not call HCSS, and it does not classify entitlements or build a review queue. Phase 1 still has no live external construction-system integration, OCR, or email.
