const SERIALIZATION_ATTEMPTS = 5;

export function serializationAttempts() {
  return SERIALIZATION_ATTEMPTS;
}

export function isSerializationConflict(error: unknown) {
  return findSerializationConflict(error, 0);
}

function findSerializationConflict(error: unknown, depth: number): boolean {
  if (!error || typeof error !== "object" || depth > 5) return false;
  if ("code" in error && error.code === "P2034") return true;
  if ("kind" in error && error.kind === "TransactionWriteConflict") return true;
  if ("originalCode" in error && error.originalCode === "40001") return true;
  if ("code" in error && error.code === "P2010" && "message" in error && typeof error.message === "string") {
    if (error.message.includes("40001") || error.message.includes("could not serialize")) return true;
  }
  if ("cause" in error && findSerializationConflict(error.cause, depth + 1)) return true;
  if ("meta" in error && error.meta && typeof error.meta === "object" && "driverAdapterError" in error.meta) {
    return findSerializationConflict(error.meta.driverAdapterError, depth + 1);
  }
  return false;
}

export function uniqueConstraintTargets(error: unknown) {
  if (error && typeof error === "object" && "code" in error && error.code === "P2002" && "meta" in error) {
    const meta = error.meta;
    if (meta && typeof meta === "object" && "target" in meta) return stringList(meta.target);
    return [];
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
