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

## Checks

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

No AI extraction, change detection, OCR, email, HCSS, or external construction-system integrations are included in Phase 1.
