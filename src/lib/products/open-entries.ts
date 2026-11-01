import { asc, desc } from "drizzle-orm";
import { db } from "@/db";
import { supplierOpenEntries } from "@/db/schema";

// What we still owe the supplier, as their bookkeeping sees it. Invoices are
// positive, credit notes negative; the amounts include VAT.
export type OpenEntry = {
  documentNo: string;
  documentType: "invoice" | "creditmemo";
  documentDate: Date | null;
  description: string | null;
  orderNo: string | null;
  amount: number | null;
  remainingAmount: number | null;
  dueDate: Date | null;
  paymentDiscountDate: Date | null;
  // Positive once the due date has passed; null when there is no due date.
  daysOverdue: number | null;
};

const DAY = 24 * 60 * 60 * 1000;

function daysOverdue(dueDate: Date | null, remaining: number | null) {
  if (!dueDate || !remaining || remaining <= 0) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.floor((today.getTime() - dueDate.getTime()) / DAY);
  return days > 0 ? days : null;
}

export async function getOpenEntries(): Promise<{
  entries: OpenEntry[];
  // Everything still open adds up to this, credit notes included.
  outstanding: number;
  overdue: number;
  refreshedAt: Date | null;
}> {
  const rows = await db
    .select()
    .from(supplierOpenEntries)
    // Oldest first: what has been waiting longest matters most.
    .orderBy(asc(supplierOpenEntries.dueDate), desc(supplierOpenEntries.documentNo));

  const entries = rows.map((row) => ({
    documentNo: row.documentNo,
    documentType: row.documentType,
    documentDate: row.documentDate,
    description: row.description,
    orderNo: row.orderNo,
    amount: row.amount,
    remainingAmount: row.remainingAmount,
    dueDate: row.dueDate,
    paymentDiscountDate: row.paymentDiscountDate,
    daysOverdue: daysOverdue(row.dueDate, row.remainingAmount),
  }));

  return {
    entries,
    outstanding: entries.reduce(
      (sum, entry) => sum + (entry.remainingAmount ?? 0),
      0
    ),
    overdue: entries.reduce(
      (sum, entry) =>
        entry.daysOverdue ? sum + (entry.remainingAmount ?? 0) : sum,
      0
    ),
    refreshedAt: rows[0]?.refreshedAt ?? null,
  };
}
