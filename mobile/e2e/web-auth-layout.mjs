/** Browser regression checks for auth geometry, keyboard use and password entry.
 * Run after `expo export --platform web`. All API responses are synthetic.
 * CHROME_PATH overrides the browser; E2E_SCREENSHOT_DIR optionally saves previews.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const port = Number(process.env.E2E_APP_PORT ?? 8093);
const origin = `http://localhost:${port}`;
const screenshots = process.env.E2E_SCREENSHOT_DIR;
const chrome = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
let server;
let browser;

async function capture(page, name) {
  if (!screenshots) return;
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({ path: path.join(screenshots, `${name}.png`), fullPage: true });
}

async function checkBounds(page) {
  // Inspect visible controls, including controls inside RN's scroll container.
  const outside = await page.locator('input, [role="button"], [role="tab"]').evaluateAll((nodes) =>
    nodes.filter((node) => {
      const box = node.getBoundingClientRect();
      return box.width > 0 && box.height > 0 &&
        (box.left < -1 || box.right > window.innerWidth + 1);
    }).map((node) => node.getAttribute("aria-label") ?? node.textContent)
  );
  assert.deepEqual(outside, [], "interactive controls must fit horizontally");
}

try {
  const occupied = await fetch(origin, { signal: AbortSignal.timeout(1000) })
    .then(() => true).catch(() => false);
  assert.equal(occupied, false, `port ${port} is already in use`);
  server = spawn(process.execPath,
    ["node_modules/serve/build/main.js", "dist", "-l", String(port), "--single"],
    { stdio: "ignore", windowsHide: true });
  let ready = false;
  for (let attempt = 0; attempt < 40 && !ready; attempt++) {
    ready = await fetch(origin).then((response) => response.ok).catch(() => false);
    if (!ready) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(ready, "static app server started");
  browser = await chromium.launch({ executablePath: chrome, headless: true });

  for (const width of [1440, 1040, 768, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: width < 400 ? 740 : 1000 } });
    // No traffic may leave the test. Only our static app and mocked API exist.
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      if (url.hostname === "localhost" && url.port === "8000") {
        const token = `test.${Buffer.from(JSON.stringify({ sub: "synthetic", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test`;
        return route.fulfill({ contentType: "application/json", body: JSON.stringify(
          url.pathname === "/auth/login" ? { access_token: token, token_type: "bearer" } : []
        ) });
      }
      return route.abort();
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin);
    const email = page.getByRole("textbox", { name: "Email", exact: true });
    const password = page.getByLabel("Password", { exact: true });
    await email.waitFor();
    await page.evaluate(() => document.fonts.ready);
    await checkBounds(page);
    if (width >= 1040) {
      const brand = await page.getByText("Your health companion", { exact: true }).boundingBox();
      const form = await email.boundingBox();
      assert.ok(brand.x + brand.width < form.x, "desktop brand is beside the form");
    } else {
      assert.equal(await page.getByText("Your health companion", { exact: true }).count(), 0);
    }
    assert.equal(await page.getByLabel("Person holding a small round object").count(), 0);
    await capture(page, `sign-in-${width}`);

    await page.getByRole("button", { name: "Log in", exact: true }).click();
    assert.equal(await email.getAttribute("aria-invalid"), "true");
    assert.ok(await email.evaluate((node) =>
      document.getElementById(node.getAttribute("aria-describedby"))?.textContent
    ), "validation explanation is associated with the input in the browser");
    assert.equal(await email.evaluate((node) => node === document.activeElement), true,
      "invalid submit focuses the first invalid field");
    await email.fill("synthetic@example.com");
    assert.equal(await email.getAttribute("aria-invalid"), "false");
    await email.press("Enter");
    assert.equal(await password.evaluate((node) => node === document.activeElement), true,
      "Enter advances from email to password");
    await password.fill("synthetic-password-123");
    assert.equal(await password.getAttribute("type"), "password");
    await page.getByRole("button", { name: "Show password", exact: true }).click();
    assert.equal(await password.evaluate((node) => node.type), "text");
    assert.equal(await password.inputValue(), "synthetic-password-123");
    await page.getByRole("button", { name: "Hide password", exact: true }).click();
    assert.equal(await password.getAttribute("type"), "password");

    // Sign-up uses the same layout and must also fit at every width.
    await page.getByRole("button", { name: "Need an account? Sign up", exact: true }).click();
    await page.getByText("Create account", { exact: true }).waitFor();
    await checkBounds(page);
    await capture(page, `sign-up-${width}`);
    await page.getByRole("button", { name: "Already have an account? Log in", exact: true }).click();
    await email.fill("synthetic@example.com");
    await password.fill("synthetic-password-123");
    await password.press("Enter");
    await page.getByText("Hi there", { exact: true }).waitFor();
    await page.getByText("No reminder times set", { exact: true }).waitFor();
    await checkBounds(page);
    assert.ok(await page.getByText("Medications", { exact: true }).evaluate((node) =>
      node.scrollWidth <= node.clientWidth + 1
    ), "the full Medications tab label fits");
    assert.equal(await page.getByLabel("Person holding a small round object").count(), 0);
    await capture(page, `today-${width}`);
    assert.deepEqual(errors, [], "no browser runtime errors");
    console.log(`PASS ${width}px: auth layout, keyboard, password visibility, navigation and home`);
    await context.close();
  }
} finally {
  await browser?.close();
  server?.kill();
}
