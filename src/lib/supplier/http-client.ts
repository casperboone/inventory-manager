import { supplierConfig } from "./config";

export class HttpClient {
  private readonly cookies = new Map<string, string>();

  async get(
    path: string,
    headers: Record<string, string> = {}
  ): Promise<Response> {
    return this.request(path, {
      method: "GET",
      headers,
    });
  }

  async postForm(
    path: string,
    payload: URLSearchParams,
    headers: Record<string, string> = {}
  ): Promise<Response> {
    return this.request(path, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        ...headers,
      },
      body: payload.toString(),
    });
  }

  hasCookie(name: string): boolean {
    return this.cookies.has(name);
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers ?? {});

    if (!headers.has("user-agent")) {
      headers.set("user-agent", supplierConfig.userAgent);
    }

    const cookieHeader = this.getCookieHeader();
    if (cookieHeader && !headers.has("cookie")) {
      headers.set("cookie", cookieHeader);
    }

    const response = await fetch(`${supplierConfig.baseUrl}${path}`, {
      ...init,
      headers,
      redirect: "follow",
      cache: "no-store",
    });

    this.storeCookies(response);
    return response;
  }

  private getCookieHeader(): string {
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  private storeCookies(response: Response): void {
    for (const setCookieHeader of this.getSetCookieHeaders(response)) {
      const firstSegment = setCookieHeader.split(";")[0];
      const separator = firstSegment.indexOf("=");

      if (separator <= 0) {
        continue;
      }

      const name = firstSegment.slice(0, separator).trim();
      const value = firstSegment.slice(separator + 1).trim();

      if (!name) {
        continue;
      }

      this.cookies.set(name, value);
    }
  }

  private getSetCookieHeaders(response: Response): string[] {
    const extendedHeaders = response.headers as Headers & {
      getSetCookie?: () => string[];
    };

    if (typeof extendedHeaders.getSetCookie === "function") {
      return extendedHeaders.getSetCookie();
    }

    const combined = response.headers.get("set-cookie");
    if (!combined) {
      return [];
    }

    return combined.split(/,(?=\s*[^;,\s]+=)/g);
  }
}
