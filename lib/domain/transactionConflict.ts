import { Prisma } from "@prisma/client";

const SERIALIZATION_ATTEMPTS = 5;

export function serializationAttempts() {
  return SERIALIZATION_ATTEMPTS;
}

export function isSerializationConflict(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return true;
  if (error && typeof error === "object" && "code" in error && error.code === "P2034") return true;
  const cause = errorCause(error);
  if (!cause) return false;
  return cause.kind === "TransactionWriteConflict" || cause.originalCode === "40001";
}

export function uniqueConstraintTargets(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return stringList(error.meta?.target);
  }
  const cause = errorCause(error);
  if (!cause || cause.kind !== "UniqueConstraintViolation") return null;
  const constraint = cause.constraint;
  if (!constraint) return [];
  if ("fields" in constraint) return stringList(constraint.fields);
  if ("index" in constraint && typeof constraint.index === "string") return [constraint.index];
  return [];
}

function errorCause(error: unknown) {
  if (!error || typeof error !== "object" || !("cause" in error)) return null;
  const cause = error.cause;
  if (!cause || typeof cause !== "object") return null;
  return cause as {
    kind?: string;
    originalCode?: string;
    constraint?: { fields?: unknown; index?: unknown };
  };
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
