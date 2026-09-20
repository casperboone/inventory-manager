import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  libsql?: ReturnType<typeof createClient>;
};

// Reuse the client across hot reloads in development.
const client =
  globalForDb.libsql ??
  createClient({
    url: process.env.DATABASE_URL ?? "file:./data/app.db",
    authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
  });

if (process.env.NODE_ENV !== "production") globalForDb.libsql = client;

export const db = drizzle(client, { schema });
