type Browser = {
  close(): Promise<void>;
  newPage(options: { viewport: { width: number; height: number } }): Promise<Page>;
};

type Locator = {
  click(): Promise<void>;
  count(): Promise<number>;
  innerText(): Promise<string>;
};

type Page = {
  goto(url: string, options: { waitUntil: "domcontentloaded"; timeout: number }): Promise<void>;
  locator(selector: string): Locator;
  evaluate<T>(fn: () => T): Promise<T>;
  waitForSelector(selector: string, options: { state: "visible"; timeout: number }): Promise<void>;
};

type PlaywrightModule = {
  chromium: {
    launch(options: { headless: boolean }): Promise<Browser>;
  };
};

const DEFAULT_URL = "http://127.0.0.1:3001/mobile-companion";
const targetUrl = process.env.KINETIC_MOBILE_COMPANION_URL ?? DEFAULT_URL;

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function loadPlaywright(): Promise<PlaywrightModule> {
  try {
    const dynamicImport = new Function("specifier", "return import(specifier)") as (
      specifier: string,
    ) => Promise<PlaywrightModule>;
    return await dynamicImport("playwright");
  } catch {
    throw new Error(
      "Playwright is required for this optional browser smoke. Install it in frontend or run this on an environment that already has the playwright package.",
    );
  }
}

async function assertServerReachable() {
  let response: Response;
  try {
    response = await fetch(targetUrl, { method: "GET" });
  } catch {
    throw new Error(
      `Could not reach ${targetUrl}. Start the frontend first, for example: npm run dev -- --hostname 127.0.0.1 --port 3001`,
    );
  }
  expect(response.ok, `Expected ${targetUrl} to return 2xx, got ${response.status}`);
}

function testId(id: string) {
  return `[data-testid="${id}"]:visible`;
}

async function click(page: Page, id: string) {
  const locator = page.locator(testId(id));
  const count = await locator.count();
  expect(count === 1, `Expected one visible ${id}, got ${count}`);
  await locator.click();
}

async function read(page: Page, id: string) {
  const locator = page.locator(testId(id));
  const count = await locator.count();
  expect(count === 1, `Expected one visible ${id}, got ${count}`);
  return (await locator.innerText()).trim();
}

async function expectText(page: Page, id: string, expected: string) {
  const actual = await read(page, id);
  expect(actual === expected, `Expected ${id} to be "${expected}", got "${actual}"`);
}

async function expectContains(page: Page, id: string, expected: string) {
  const actual = await read(page, id);
  expect(actual.includes(expected), `Expected ${id} to contain "${expected}", got "${actual}"`);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() =>
    Array.from(document.querySelectorAll("main *"))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          text: (element.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 80),
          width: rect.width,
          scrollWidth: element.scrollWidth,
        };
      })
      .filter((entry) => entry.width > 0 && entry.scrollWidth - entry.width > 1)
      .slice(0, 10),
  );
  expect(
    overflow.length === 0,
    `Expected no horizontal overflow in mobile prototype, found ${JSON.stringify(overflow)}`,
  );
}

async function main() {
  await assertServerReachable();
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.waitForSelector(testId("mobile-companion-root"), {
      state: "visible",
      timeout: 15_000,
    });
    await page.waitForSelector(testId("mobile-decision-title"), {
      state: "visible",
      timeout: 15_000,
    });

    await expectText(page, "mobile-readiness-label", "Ready");
    await expectText(page, "mobile-health-pill", "Health synced 8:12 AM");
    await expectText(page, "mobile-calendar-pill", "Calendar clear until 11:30 AM");
    await expectText(page, "mobile-decision-title", "Tempo intervals");
    await expectText(page, "mobile-primary-action", "Run the planned session");
    await expectNoHorizontalOverflow(page);

    await click(page, "mobile-health-stale");
    await expectText(page, "mobile-readiness-label", "Caution");
    await expectText(page, "mobile-health-pill", "Health last synced yesterday");
    await expectText(page, "mobile-decision-title", "Short aerobic run");

    await click(page, "mobile-health-denied");
    await expectText(page, "mobile-readiness-label", "Unknown");
    await expectText(page, "mobile-health-pill", "Health permission needed");
    await expectText(page, "mobile-decision-title", "Manual check-in first");
    await expectText(page, "mobile-primary-action", "Log readiness");

    await click(page, "mobile-calendar-conflict");
    await expectText(page, "mobile-decision-title", "Manual check-in first");
    await expectText(page, "mobile-primary-action", "Log readiness");

    await click(page, "mobile-health-synced");
    await expectText(page, "mobile-decision-title", "Scale to 30 min easy");
    await expectText(page, "mobile-primary-action", "Apply safe adjustment");

    await click(page, "mobile-calendar-stale");
    await expectText(page, "mobile-decision-title", "Confirm schedule first");
    await expectText(page, "mobile-primary-action", "Review schedule");

    await click(page, "mobile-intake-preview");
    await expectText(page, "mobile-intake-status", "AI parsed a review-only schedule draft");
    await click(page, "mobile-intake-validate");
    await expectText(page, "mobile-intake-status", "Draft applied after deterministic validation");

    await click(page, "mobile-checkin-accept");
    await expectText(page, "mobile-checkin-status", "Workout accepted for today");
    await click(page, "mobile-checkin-complete");
    await expectText(page, "mobile-checkin-status", "Completed and ready for review");
    await click(page, "mobile-checkin-skip");
    await expectText(page, "mobile-checkin-status", "Skipped without changing the plan");
    await click(page, "mobile-checkin-reset");
    await expectText(page, "mobile-checkin-status", "No action saved yet");

    await click(page, "mobile-notification-toggle");
    await expectContains(page, "mobile-notification-toggle", "Quiet reminder on");

    console.log("OK - mobile companion browser smoke covers readiness, calendar, intake, and check-in states");
  } finally {
    await browser.close();
  }
}

void main();
