// Stands in for "@/db" during tests. `.env` points at the live database, so a
// test that reaches for it should fail instead of reading or writing real data.
export const db = new Proxy(
  {},
  {
    get() {
      throw new Error("Tests must not touch the database.");
    },
  },
) as typeof import("@/db/index").db;
