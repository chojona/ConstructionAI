# WEAK wedge schema wall (CON-74)

Under the WEAK product wedge, the spine stays **unlabeled ProposedFact + ReviewDecision** only. We do not add schema or API surface that presupposes entitlement, DSC, force-account (FA), or change-order (CO) candidate workflows.

This complements [CON-47](https://linear.app/dealwatch/issue/CON-47/domain-copy-lock-changes-change-orders-dsc-fa) (UI copy lock: “Changes” ≠ construction change orders). CON-74 is the **hard schema/API wall**; it is not detection work.

## Allowed spine (Phase 1)

- `ProposedFact` with `ProposedFactType`: `equipment_requirement`, `schedule_date`, `quantity`
- `ReviewDecision` with `ReviewDecisionValue`: `ACCEPTED`, `DISMISSED`, `FLAGGED`
- `ReviewSubjectKind`: `PROPOSED_FACT`, `REVISION_CHANGE` with `RevisionChangeType` for document revision diffs (not CO product status)
- `HeavyJobSourceObject` snapshots with neutral `HeavyJobObjectType` values and raw JSON (no entitlement classification columns)

## Banned until DETECTION_SIGNAL / interviews reopen

No new Prisma enums, columns, or tables, and no new API DTO / Zod request fields whose identifiers encode:

| Label | Examples (non-exhaustive) |
| --- | --- |
| Entitlement | `entitlement`, `EntitlementCandidate` |
| DSC | `dsc`, `dsc_status` |
| Force-account (FA) | `force_account`, `isForceAccount`, standalone `fa` segment |
| Change-order (CO) | `change_order`, `changeOrder` as product fields |
| PCO | `pco`, `pco_number` |
| CO / entitlement candidates | `candidate`, `co_candidate`, `candidate_status` |
| Detection signal machines | `detection_signal` |

Parked mid-terms [CON-48](https://linear.app/dealwatch/issue/CON-48) / [CON-51](https://linear.app/dealwatch/issue/CON-51) remain parked; do not land their schema here.

## Enforcement

`lib/spine/weakWedgeSchemaWall.test.ts` audits:

- `prisma/schema.prisma`
- `lib/domain/types.ts`, `lib/domain/repository.ts`
- `lib/**/dto.ts` API mappers
- Zod API schemas under `lib/*/service.ts` and `lib/extractions/constructionFacts.ts`

CI runs this via `npm test` (unit project). A failure lists file, line, identifier, and banned label.
