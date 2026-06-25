import { test, expect } from "@playwright/test";

// Smoke placeholder — verifies the Playwright harness is wired.
// Full E2E auth + tenant-isolation tests land in WU5.
test("Playwright harness is configured", async () => {
  // This test does not require a running server; it just asserts the harness boots.
  expect(true).toBe(true);
});
