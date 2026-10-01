import type { Prisma } from "@prisma/client";

/**
 * Checked-in HeavyJob-shaped payloads for one demo job.
 *
 * Field names follow the public HeavyJob read models:
 * - timecard: GET /api/v1/timeCards/{id} (`v1_ApiTimeCardRead`)
 * - cost code: GET /api/v2/costCodes (`v1_ApiCostCodeWithAccountingValuesReadV2`)
 * - quantity: GET /api/v1/costTypeQuantities/materialInstalled (`v1_ApiMaterialInstalledRead`)
 * - diary: POST /api/v1/diaries/search (`v1_ApiDiaryRead`)
 * - attachment: POST /api/v1/attachment/advancedRequest (`v1_ApiAttachmentAdvancedRead`)
 *
 * Diary search returns working conditions as `workingConditionNote`.
 * Diary upsert sends the same text as `workingConditions`. Fixtures keep both
 * keys with the same string so the stored snapshot matches either shape.
 *
 * `isTm` and `isRework` on timecard cost codes are raw HeavyJob flags.
 * They are not entitlement, DSC, or force-account classifications.
 * Installed quantity and consumed quantity are stored as reported.
 * Diary text and attachment metadata are stored as reported.
 */
export const HEAVYJOB_OBJECT_TYPES = ["timecard", "cost_code", "quantity", "diary", "attachment"] as const;

export type HeavyJobObjectType = (typeof HEAVYJOB_OBJECT_TYPES)[number];

export const HEAVYJOB_FIXTURE_FETCHED_AT = "2026-06-13T18:04:00.000Z";

export const HEAVYJOB_DEMO_PROJECT_ID = "project_heavyjob_demo";
export const HEAVYJOB_DEMO_PROJECT_NAME = "Northstar River Road Reconstruction";
export const HEAVYJOB_DEMO_PROJECT_NUMBER = "NS-214";

const JOB_ID = "7c2a1f40-6b8e-4d1a-9c33-1a0e5d8b2f41";
const JOB_CODE = "NS-214";
const JOB_DESCRIPTION = "Northstar River Road Reconstruction";
const BUSINESS_UNIT_ID = "3e8b0c21-9a44-4f7e-8d12-6b5c0a9e1d70";
const BUSINESS_UNIT_CODE = "NORTHSTAR";
const FOREMAN_ID = "91d4e2ab-17c6-4a08-b5e3-2f8c6d0a4b19";
const EXCAVATION_COST_CODE_ID = "c0310010-1111-4a11-8c11-0310010aaa01";
const BASE_COST_CODE_ID = "c3210020-2222-4a22-8c22-3210020bbb02";
const USER_ID = "66666666-6666-4666-8666-666666666666";

export interface HeavyJobFixture {
  objectType: HeavyJobObjectType;
  sourceId: string;
  fetchedAt: string;
  raw: Prisma.InputJsonObject;
}

export const heavyJobFixtures: HeavyJobFixture[] = [
  {
    objectType: "timecard",
    sourceId: "11111111-1111-4111-8111-111111111111",
    fetchedAt: HEAVYJOB_FIXTURE_FETCHED_AT,
    raw: {
      id: "11111111-1111-4111-8111-111111111111",
      foremanId: FOREMAN_ID,
      foremanCode: "ALVAREZ",
      foremanDescription: "Jordan Alvarez",
      jobId: JOB_ID,
      jobCode: JOB_CODE,
      jobDescription: JOB_DESCRIPTION,
      businessUnitId: BUSINESS_UNIT_ID,
      businessUnitCode: BUSINESS_UNIT_CODE,
      businessUnitDescription: "Northstar Heavy Civil",
      date: "2026-06-12",
      shift: 1,
      revision: 2,
      isApproved: true,
      approvedById: USER_ID,
      isReviewed: true,
      reviewedById: USER_ID,
      isAccepted: false,
      isRejected: false,
      sentToPayrollRevision: null,
      sentToPayrollDateTime: null,
      lastModifiedDateTime: "2026-06-12T22:15:00Z",
      costCodes: [
        {
          timeCardCostCodeId: "11111111-1111-4111-8111-222222222222",
          costCodeId: EXCAVATION_COST_CODE_ID,
          costCodeCode: "03100.010",
          costCodeDescription: "Structural excavation",
          isRework: true,
          isTm: false,
          quantity: 18,
          unitOfMeasure: "CY",
          column: 1,
          publicNotes: "Re-excavated soft material at Sta 12+40.",
          privateNotes: null,
        },
        {
          timeCardCostCodeId: "11111111-1111-4111-8111-333333333333",
          costCodeId: BASE_COST_CODE_ID,
          costCodeCode: "32100.020",
          costCodeDescription: "Aggregate base course",
          isRework: false,
          isTm: true,
          quantity: 40,
          unitOfMeasure: "TON",
          column: 2,
          publicNotes: null,
          privateNotes: null,
        },
      ],
    },
  },
  {
    objectType: "cost_code",
    sourceId: EXCAVATION_COST_CODE_ID,
    fetchedAt: HEAVYJOB_FIXTURE_FETCHED_AT,
    raw: {
      id: EXCAVATION_COST_CODE_ID,
      code: "03100.010",
      description: "Structural excavation",
      businessUnitId: BUSINESS_UNIT_ID,
      businessUnitCode: BUSINESS_UNIT_CODE,
      jobId: JOB_ID,
      jobCode: JOB_CODE,
      jobDescription: JOB_DESCRIPTION,
      quantity: 1200,
      unitOfMeasure: "CY",
      status: "active",
      isTm: false,
      isDeleted: false,
      isHiddenFromMobile: false,
    },
  },
  {
    objectType: "cost_code",
    sourceId: BASE_COST_CODE_ID,
    fetchedAt: HEAVYJOB_FIXTURE_FETCHED_AT,
    raw: {
      id: BASE_COST_CODE_ID,
      code: "32100.020",
      description: "Aggregate base course",
      businessUnitId: BUSINESS_UNIT_ID,
      businessUnitCode: BUSINESS_UNIT_CODE,
      jobId: JOB_ID,
      jobCode: JOB_CODE,
      jobDescription: JOB_DESCRIPTION,
      quantity: 800,
      unitOfMeasure: "TON",
      status: "active",
      isTm: false,
      isDeleted: false,
      isHiddenFromMobile: false,
    },
  },
  {
    objectType: "quantity",
    sourceId: "22222222-2222-4222-8222-222222222222",
    fetchedAt: HEAVYJOB_FIXTURE_FETCHED_AT,
    raw: {
      id: "22222222-2222-4222-8222-222222222222",
      costCodeId: BASE_COST_CODE_ID,
      jobMaterialId: "55555555-5555-4555-8555-555555555555",
      foremanId: FOREMAN_ID,
      jobId: JOB_ID,
      businessUnitId: BUSINESS_UNIT_ID,
      date: "2026-06-12",
      consumedQuantity: 42.5,
      installedQuantity: 40,
      unitOfMeasure: "TON",
      referenceNumber: "AB-0612",
      isInvoiced: false,
      lastModifiedDateTime: "2026-06-12T21:05:00Z",
      lastModifiedPreciseDateTime: "2026-06-12T21:05:00.1200000Z",
      sourceEntry: "heavyJobWeb",
      sourceName: "HeavyJob Web",
    },
  },
  {
    objectType: "diary",
    sourceId: "33333333-3333-4333-8333-333333333333",
    fetchedAt: HEAVYJOB_FIXTURE_FETCHED_AT,
    raw: {
      id: "33333333-3333-4333-8333-333333333333",
      job: {
        id: JOB_ID,
        code: JOB_CODE,
        description: JOB_DESCRIPTION,
      },
      foreman: {
        id: FOREMAN_ID,
        code: "ALVAREZ",
        firstName: "Jordan",
        lastName: "Alvarez",
      },
      note: "Overnight rain left the subgrade soft at Sta 12+40 through Sta 12+80. Crew waited until 10:00, then placed aggregate base on the firmed surface.",
      workingConditions: "Wet subgrade at Sta 12+40 to Sta 12+80 after overnight rain.",
      workingConditionNote: "Wet subgrade at Sta 12+40 to Sta 12+80 after overnight rain.",
      date: "2026-06-12T00:00:00",
      revision: 1,
      tags: [],
      lastChangedDateTime: "2026-06-12T16:40:00Z",
    },
  },
  {
    objectType: "attachment",
    sourceId: "44444444-4444-4444-8444-444444444444",
    fetchedAt: HEAVYJOB_FIXTURE_FETCHED_AT,
    raw: {
      attachmentId: "44444444-4444-4444-8444-444444444444",
      transactionAttachmentId: "44444444-4444-4444-8444-555555555555",
      job: {
        jobId: JOB_ID,
        jobCode: JOB_CODE,
        jobDescription: JOB_DESCRIPTION,
      },
      employee: {
        employeeId: FOREMAN_ID,
        employeeCode: "ALVAREZ",
        employeeFirstName: "Jordan",
        employeeLastName: "Alvarez",
      },
      mimeType: "image/jpeg",
      name: "sta-12-40-subgrade.jpg",
      referenceDate: "2026-06-12T00:00:00",
      attachmentUrl: null,
      thumbnailUrl: null,
      attachmentHeight: 3024,
      attachmentWidth: 4032,
      thumbnailHeight: 240,
      thumbnailWidth: 320,
      latitude: 47.6062,
      longitude: -122.3321,
      sourceName: "Jordan Alvarez",
      note: "Morning photo of the subgrade at Sta 12+40.",
      lastModified: "2026-06-12T15:12:00Z",
      fileReferences: [
        {
          referenceType: "costCodeSetup",
          referenceId: EXCAVATION_COST_CODE_ID,
          referenceCode: "03100.010",
          referenceDescription: "Structural excavation",
        },
      ],
    },
  },
];

export function heavyJobFixtureInserts(projectId: string) {
  return heavyJobFixtures.map((fixture) => ({
    projectId,
    objectType: fixture.objectType,
    sourceId: fixture.sourceId,
    fetchedAt: new Date(fixture.fetchedAt),
    raw: fixture.raw,
  }));
}
