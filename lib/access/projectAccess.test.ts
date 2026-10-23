import { describe, expect, it } from "vitest";
import type { DocumentDetail, ProjectDetail, RevisionDetail } from "@/lib/domain/types";
import { requireDocumentAccess, requireProjectAccess, requireRevisionAccess } from "./projectAccess";

const now = new Date("2026-10-20T00:00:00.000Z");

function project(organizationId: string): ProjectDetail {
  return {
    id: "project_a",
    organizationId,
    name: "North River Bridge",
    projectNumber: "NR-1",
    createdAt: now,
    updatedAt: now,
    documents: [],
  };
}

describe("project access gate", () => {
  it("returns the project when Project.organizationId is the caller", async () => {
    const owned = project("org_a");
    const loaded = await requireProjectAccess({ organizationId: "org_a" }, owned.id, {
      async getProject(organizationId, projectId) {
        return organizationId === "org_a" && projectId === owned.id ? owned : null;
      },
    });
    expect(loaded).toBe(owned);
  });

  it("throws 404 when the project is missing or owned by another organization", async () => {
    const owned = project("org_a");
    const lookup = {
      async getProject() {
        return owned;
      },
    };
    const missing = {
      async getProject() {
        return null;
      },
    };

    await expect(requireProjectAccess({ organizationId: "org_b" }, owned.id, lookup)).rejects.toMatchObject({
      code: "NOT_FOUND",
      httpStatus: 404,
      message: "Project not found.",
    });
    await expect(requireProjectAccess({ organizationId: "org_b" }, owned.id, missing)).rejects.toMatchObject({
      code: "NOT_FOUND",
      httpStatus: 404,
    });
    await expect(requireProjectAccess({ organizationId: "org_b" }, owned.id, lookup)).rejects.toThrow("Project not found.");
  });

  it("does not put the other organization's project name in the 404", async () => {
    const owned = project("org_a");
    const error = await requireProjectAccess({ organizationId: "org_b" }, owned.id, {
      async getProject() {
        return owned;
      },
    }).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "NOT_FOUND", message: "Project not found." });
    expect(String((error as { message?: string }).message)).not.toContain(owned.name);
  });

  it("hides a document that the organization filter does not return", async () => {
    const calls: string[] = [];
    await expect(requireDocumentAccess({ organizationId: "org_b" }, "doc_a", {
      async getDocument(organizationId, documentId) {
        calls.push(`${organizationId}:${documentId}`);
        return null;
      },
    })).rejects.toMatchObject({ code: "NOT_FOUND", httpStatus: 404, message: "Document not found." });
    expect(calls).toEqual(["org_b:doc_a"]);
  });

  it("returns a document the organization filter resolved", async () => {
    const document = {
      id: "doc_a",
      projectId: "project_a",
      title: "Drainage",
      documentType: null,
      createdAt: now,
      updatedAt: now,
      project: { id: "project_a", name: "North River Bridge" },
      revisions: [],
    } satisfies DocumentDetail;
    await expect(requireDocumentAccess({ organizationId: "org_a" }, document.id, {
      async getDocument() {
        return document;
      },
    })).resolves.toBe(document);
  });

  it("hides a revision that the organization filter does not return", async () => {
    await expect(requireRevisionAccess({ organizationId: "org_b" }, "rev_a", {
      async getRevision() {
        return null;
      },
    })).rejects.toMatchObject({ code: "NOT_FOUND", httpStatus: 404, message: "Revision not found." });
  });

  it("returns a revision the organization filter resolved", async () => {
    const revision = {
      id: "rev_a",
      documentId: "doc_a",
      revisionLabel: "A",
      revisionOrder: 1,
      originalFilename: "a.pdf",
      mimeType: "application/pdf",
      byteSize: 10,
      sha256: "ab",
      storageKey: "revisions/a.pdf",
      status: "PROCESSED",
      failureCode: null,
      failureMessage: null,
      createdAt: now,
      document: {
        id: "doc_a",
        projectId: "project_a",
        title: "Drainage",
        documentType: null,
        createdAt: now,
        updatedAt: now,
        project: { id: "project_a", name: "North River Bridge" },
      },
      pages: [],
    } satisfies RevisionDetail;
    await expect(requireRevisionAccess({ organizationId: "org_a" }, revision.id, {
      async getRevision() {
        return revision;
      },
    })).resolves.toBe(revision);
  });
});
