import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// The simplest protection that works everywhere: HTTP basic auth with one
// shared password from the environment. Without APP_PASSWORD (local
// development) the app stays open.
export function proxy(request: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    const decoded = atob(header.slice(6));
    const given = decoded.slice(decoded.indexOf(":") + 1);
    if (matches(given, password)) return NextResponse.next();
  }

  return new NextResponse("Log in to continue.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Inventory Manager", charset="UTF-8"',
    },
  });
}

// Compares without leaking the answer through how long it takes.
function matches(given: string, expected: string) {
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) {
    diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
