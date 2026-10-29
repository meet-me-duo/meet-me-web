import { expect, test } from "@playwright/test";

// Synthetic account responses only. The operations API remains authoritative.
for (const allowed of [undefined, false, true]) {
  test(`admin entry follows the server capability (${allowed}) and preserves API authorization`, async ({ page }) => {
    let operationsRequests = 0;
    await page.route("**/api/auth/refresh", route => route.fulfill({ json: {
      accessToken: "synthetic-admin-entry-access",
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
      account: {
        id: "11111111-2222-4333-8444-555555555555", displayName: "합성 회원",
        ...(allowed === undefined ? {} : { capabilities: { canViewOperations: allowed } }),
      },
    } }));
    await page.route("**/api/operations/**", route => {
      operationsRequests++;
      return route.fulfill({ status: 403, json: { code: "OPERATOR_FORBIDDEN" } });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "합성 회원 계정 메뉴" }).click();
    const entry = page.getByRole("link", { name: "어드민 페이지" });
    expect(operationsRequests).toBe(0);
    if (allowed === true) {
      await expect(entry).toBeVisible();
      await expect(entry).toHaveAttribute("href", "/operations");
      await page.getByRole("link", { name: "계정 보안" }).focus();
      await page.keyboard.press("Tab");
      await expect(entry).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/operations$/);
      await expect(page.getByText("운영 조회 권한이 없습니다.")).toBeVisible();
      await expect(page.getByRole("button", { name: "합성 회원 계정 메뉴" })).toHaveAttribute("aria-expanded", "false");
      expect(operationsRequests).toBe(1);
    } else {
      await expect(entry).toHaveCount(0);
    }
  });
}
