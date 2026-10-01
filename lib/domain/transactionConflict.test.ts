import { describe, expect, it } from "vitest";
import { isSerializationConflict, uniqueConstraintTargets } from "./transactionConflict";

describe("transaction conflicts", () => {
  it("recognizes adapter write conflicts without treating them as logged failures", () => {
    const error = new Error("TransactionWriteConflict");
    error.cause = { kind: "TransactionWriteConflict", originalCode: "40001", originalMessage: "could not serialize access" };
    expect(isSerializationConflict(error)).toBe(true);
    expect(isSerializationConflict({ code: "P2034" })).toBe(true);
    expect(isSerializationConflict(new Error("connection reset"))).toBe(false);
  });

  it("reads unique targets from Prisma and the pg adapter", () => {
    expect(uniqueConstraintTargets({
      cause: { kind: "UniqueConstraintViolation", constraint: { fields: ["sha256"] } },
    })).toEqual(["sha256"]);
    expect(uniqueConstraintTargets({
      cause: { kind: "TransactionWriteConflict" },
    })).toBeNull();
  });
});
