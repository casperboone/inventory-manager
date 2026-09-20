import { AuthService } from "./auth-service";
import { HttpClient } from "./http-client";

// A logged-in supplier session shared by all requests (e.g. image fetches), so
// we don't log in again for every request.
const globalForSession = globalThis as unknown as {
  supplierSession?: Promise<HttpClient>;
};

export function getSupplierSession(): Promise<HttpClient> {
  if (!globalForSession.supplierSession) {
    const http = new HttpClient();
    const session = new AuthService(http).authenticate().then(() => http);
    globalForSession.supplierSession = session;
    // Don't keep a failed login around; the next call retries.
    session.catch(() => resetSupplierSession(session));
  }
  return globalForSession.supplierSession;
}

// Takes the session that turned out to be stale, so a session established in
// the meantime isn't thrown away.
export function resetSupplierSession(stale: Promise<HttpClient>) {
  if (globalForSession.supplierSession === stale) {
    globalForSession.supplierSession = undefined;
  }
}

// An expired session gets redirected (and followed) to the login page.
export function isLoginRedirect(response: Response) {
  return new URL(response.url).pathname.toLowerCase().startsWith("/login");
}
