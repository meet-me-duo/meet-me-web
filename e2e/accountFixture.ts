import { expect, type BrowserContext, type Page, type Route } from "@playwright/test";

/** Synthetic service auth only; production OAuth and cookie security use the separate native harness. */
export async function fulfillAccountRefresh(route: Route, displayName: string | null): Promise<boolean> {
  if (new URL(route.request().url()).pathname !== "/api/auth/refresh") return false;
  expect(new URL(route.request().url()).origin).toBe(new URL(route.request().frame().url()).origin);
  expect(route.request().method()).toBe("POST");
  if (displayName === null) {
    await route.fulfill({ status: 401, json: { code: "AUTH_REFRESH_INVALID" } });
  } else {
    let browserNow: number;
    try {
      browserNow = await route.request().frame().evaluate(() => Date.now());
    } catch (error) {
      // Immediate reloads can destroy the document that issued this intercepted refresh.
      // Cancel only that obsolete request; the new document makes its own refresh.
      if (!(error instanceof Error) || !error.message.includes("Execution context was destroyed")) throw error;
      await route.abort("aborted");
      return true;
    }
    await route.fulfill({ json: {
      accessToken: "synthetic-host-service-access",
      expiresAt: new Date(browserNow + 900_000).toISOString(),
      account: { id: "11111111-2222-4333-8444-555555555555", displayName },
    } });
  }
  return true;
}

export async function installAccountRefresh(target: Page | BrowserContext, displayName: string | null) {
  await target.route("**/api/auth/refresh", async route => { await fulfillAccountRefresh(route, displayName); });
}
