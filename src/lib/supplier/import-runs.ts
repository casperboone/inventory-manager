import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { supplierImports, type SupplierImport } from "@/db/schema";
import { logger } from "@/lib/logger";

// The catalog and the documents are logged the same way but run independently:
// each is its own request, and one kind doesn't block the other.
export type ImportKind = SupplierImport["kind"];

export const IMPORT_KIND_LABELS: Record<ImportKind, string> = {
  catalog: "Catalog",
  documents: "Document",
};

// An import still "running" after this long is assumed to have crashed.
const STALE_IMPORT_MS = 15 * 60 * 1000;

function staleBefore() {
  return new Date(Date.now() - STALE_IMPORT_MS);
}

// A run the platform killed never gets to finish itself, and only the next run
// marks it as failed, so everything that reads the log has to see through it.
export function isRunActive(run: SupplierImport) {
  return run.status === "running" && run.startedAt >= staleBefore();
}

type RunResult = Partial<
  Omit<
    SupplierImport,
    "id" | "kind" | "status" | "startedAt" | "finishedAt" | "error"
  >
>;

export async function startImportRun(kind: ImportKind) {
  await db
    .update(supplierImports)
    .set({ status: "failed", error: "Timed out", finishedAt: new Date() })
    .where(
      and(
        eq(supplierImports.kind, kind),
        eq(supplierImports.status, "running"),
        lt(supplierImports.startedAt, staleBefore())
      )
    );

  const running = await db.query.supplierImports.findFirst({
    where: and(
      eq(supplierImports.kind, kind),
      eq(supplierImports.status, "running")
    ),
  });
  if (running) {
    throw new Error(
      `A ${IMPORT_KIND_LABELS[kind].toLowerCase()} import is already running.`
    );
  }

  const [run] = await db
    .insert(supplierImports)
    .values({ kind, startedAt: new Date() })
    .returning({ id: supplierImports.id });
  return run;
}

export async function finishImportRun(id: number, result: RunResult) {
  await db
    .update(supplierImports)
    .set({ status: "succeeded", finishedAt: new Date(), ...result })
    .where(eq(supplierImports.id, id));
}

export async function failImportRun(
  id: number,
  error: unknown,
  result: RunResult = {}
) {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`Import #${id} failed: ${message}`);
  await db
    .update(supplierImports)
    .set({
      status: "failed",
      finishedAt: new Date(),
      error: message,
      ...result,
    })
    .where(eq(supplierImports.id, id));
}
