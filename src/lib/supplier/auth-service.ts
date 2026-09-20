import { logger } from "@/lib/logger";
import { supplierConfig } from "./config";
import { HttpClient } from "./http-client";

export class AuthService {
  constructor(private readonly httpClient: HttpClient) {}

  async authenticate(): Promise<void> {
    logger.info("Authentication started with clean session.");

    const loginPageResponse = await this.httpClient.get("/Login", {
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      referer: `${supplierConfig.baseUrl}/Login`,
    });

    if (!loginPageResponse.ok) {
      logger.error(
        `Failed to load login page. Status ${loginPageResponse.status}.`
      );
      throw new Error(
        `Could not load login page. Status ${loginPageResponse.status}.`
      );
    }

    const loginPageHtml = await loginPageResponse.text();
    const requestVerificationToken =
      this.extractRequestVerificationToken(loginPageHtml);

    logger.info("Login page loaded and verification token extracted.");

    const payload = new URLSearchParams();
    payload.set("__RequestVerificationToken", requestVerificationToken);
    payload.set("returnUrl", "");
    payload.set("Login.UserName", supplierConfig.username);
    payload.set("Login.Password", supplierConfig.password);
    payload.set("X-Requested-With", "XMLHttpRequest");

    const loginResponse = await this.httpClient.postForm("/Login", payload, {
      accept: "*/*",
      origin: supplierConfig.baseUrl,
      referer: `${supplierConfig.baseUrl}/Login`,
      "x-requested-with": "XMLHttpRequest",
    });

    logger.info(`Login response received with status ${loginResponse.status}.`);

    if (!loginResponse.ok) {
      logger.error(`Login failed with status ${loginResponse.status}.`);
      throw new Error(`Login failed with status ${loginResponse.status}.`);
    }

    if (!this.httpClient.hasCookie(".ASPXAUTH")) {
      logger.error("Login response did not return .ASPXAUTH cookie.");
      throw new Error("Login did not establish an authenticated session.");
    }

    logger.info("Authentication succeeded and session cookie is available.");
  }

  private extractRequestVerificationToken(html: string): string {
    const match = html.match(
      /name=["']__RequestVerificationToken["'][^>]*value=["']([^"']+)["']/i
    );

    if (!match?.[1]) {
      logger.error("Could not find __RequestVerificationToken on login page.");
      throw new Error("Could not extract login request verification token.");
    }

    return match[1];
  }
}
