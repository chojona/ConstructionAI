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

Uploaded document files and approved pack bytes use one object store. Leave the bucket variables unset for a local demo and files stay under `DOCUMENT_STORAGE_DIR` (default `./data/documents`). The original filename is retained only as display metadata. The seeded organization id is `org_demo`. `APP_ORGANIZATION_ID` selects the organization used by the server-rendered desk. Seed also creates an active org admin, `user_demo` (`alex.chen@northstar.example`), in that organization.

Project, document, review, export, and email routes check organization membership. Send `x-user-id` for a person. That person can only act in an organization where their membership is active, and the role must allow the action (Viewer cannot Approve or export; Reviewer can). Callers that omit `x-user-id` still run as that demo admin until each person has a login. A different `x-organization-id` is denied on those routes unless the demo user is an active member. Org admins invite with `POST /api/org/memberships` and disable with `POST /api/org/memberships/{membershipId}/disable`. HeavyJob reads still accept `x-organization-id` as tenancy context.

## Deploy to Vercel with Neon

Vercel detects the Next.js app automatically; `vercel.json` pins the framework preset. Import the repository into Vercel, then create a Neon PostgreSQL database and add these environment variables to the Vercel project:

- `DATABASE_URL`: Neon pooled connection string. The app passes it to the PostgreSQL driver adapter.
- `DIRECT_DATABASE_URL`: Neon direct (non-pooled) connection string. Prisma Migrate reads it from `prisma.config.ts`.
- `APP_ORGANIZATION_ID`: organization id used by the UI, such as `org_demo` after seeding.
- `DOCUMENT_STORAGE_DIR`: optional local directory. Default `./data/documents`. Used only when no bucket credentials are set.
- `DOCUMENT_STORAGE_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, and `AWS_ENDPOINT_URL_S3`: Neon object storage used in production for documents and pack files. The bucket stays private. Path-style requests are on when an endpoint is set, which Neon requires.
- `OBJECT_STORAGE_BUCKET`, `OBJECT_STORAGE_ACCESS_KEY_ID`, and `OBJECT_STORAGE_SECRET_ACCESS_KEY`: optional override for the same store. When these are set they win over the Neon names.
- `OBJECT_STORAGE_REGION`: optional, default `us-east-1` or `AWS_REGION`. Use `auto` for Cloudflare R2.
- `OBJECT_STORAGE_ENDPOINT`: optional endpoint override for MinIO, R2, or another non-AWS store.
- `OBJECT_STORAGE_FORCE_PATH_STYLE`: optional `true` or `false`. When omitted, path-style is on if an endpoint is set.

For a database that is not built on Vercel, apply the checked-in migrations with `DIRECT_DATABASE_URL` set:

```bash
npx prisma migrate deploy
npm run db:seed
```

The Vercel build runs `prisma migrate deploy` and `npm run db:seed` before `next build`. Migrate uses `DIRECT_DATABASE_URL` when it is set and `DATABASE_URL` otherwise. Seed upserts the organization selected by `APP_ORGANIZATION_ID`, or `org_demo` when that variable is unset, and an active org-admin membership for `alex.chen@northstar.example`. It loads HeavyJob fixture snapshots onto the demo project `project_heavyjob_demo`. For `org_demo`, seed also loads the demo portfolio. Running `npm run db:seed` again adds any missing rows, stores each demo revision PDF in the shared object store, and leaves review decisions and existing membership role or status that are already stored. `prisma generate` still runs during dependency installation.

After seeding, open:

- [Projects](http://localhost:3000/projects) for the portfolio. North River Bridge (`project_demo_review`, civil) and Harbor Warehouse Fit-Out (`project_demo_harbor`, commercial) still have open proposed facts. Pike Street Bus Corridor, I-405 Bellevue Widening, and Fremont Clinic TI are already reviewed.
- [Changes](http://localhost:3000/changes) for the open queue across those jobs.
- [North River Bridge documents](http://localhost:3000/projects/project_demo_review?view=documents) and [its changes](http://localhost:3000/projects/project_demo_review?view=changes). Earthworks keeps revisions `revision_demo_earthworks_04` and `revision_demo_earthworks_05`.
- [HeavyJob snapshots](http://localhost:3000/projects/project_heavyjob_demo?view=heavyjob) on Northstar River Road Reconstruction. Rows stay unlabeled: type, source id, fetched-at, and raw payload.

Approved pack JSON is stored at `export-packets/{projectId}/{contentHash}.json`. Postgres keeps the packet row, the content hash, the byte size, and the links to accepted review decisions. New exports write the bytes to object storage and leave `ExportPacket.payload` empty. A hosted deploy without the bucket variables refuses to write those bytes, because the Vercel filesystem is temporary.

The content hash is the sha256 of that canonical JSON. It covers the approved changes, their decision ids, and any chapters and appendices. Each chapter or appendix is included by the sha256 of its file bytes. Exporting or downloading again returns that frozen snapshot. Attaching a chapter or appendix after export stores a new pack and leaves the earlier snapshot unchanged.

Packs created before this change may still have bytes in `ExportPacket.payload`. After the bucket variables are set, run the copy once:

```bash
npm run storage:migrate-packets
```

The command copies each remaining payload into the object store, clears that column, and copies document files found under `DOCUMENT_STORAGE_DIR` when the object store does not already have them. Running it again is safe. Re-exporting the same approved pack uses the existing row and the same object key.

## WEAK wedge schema wall

Prisma and API DTOs must not add entitlement, DSC, force-account, or change-order candidate fields while the WEAK wedge is active. See [docs/weak-wedge-schema-wall.md](docs/weak-wedge-schema-wall.md) (CON-74, complements CON-47 copy lock). `lib/spine/weakWedgeSchemaWall.test.ts` enforces this in unit tests.

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

Read them with `GET /api/projects/{projectId}/heavyjob-objects`, optionally filtered by `objectType`. This read still takes `x-organization-id` as tenancy context. Membership gating on the other project routes is described above.

After seeding, open `/projects/project_heavyjob_demo?view=heavyjob` (the HeavyJob tab on Northstar River Road Reconstruction). The table columns are type, sourceId, fetchedAt, and a collapsed raw expand.

This layer does not call HCSS, and it does not classify entitlements or build a review queue. Phase 1 still has no live external construction-system integration or OCR. After an approved pack is exported, Draft email records a human send in the ledger and does not deliver mail.
