import { existsSync } from "node:fs";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import type { VkChannelConfig } from "@multipost/core";
import { ConnectorError } from "./types";

type PlaywrightModule = typeof import("playwright");
type PlaywrightPage = import("playwright").Page;
type PlaywrightLocator = import("playwright").Locator;

type PublishViaPlaywrightInput = {
  config: VkChannelConfig;
  message: string;
  mediaAbsolutePaths: string[];
};

function readPlaywrightEnv() {
  return {
    storageStatePath:
      process.env.VK_PLAYWRIGHT_STORAGE_STATE_PATH ??
      path.resolve(process.cwd(), ".data", "vk-playwright-storage-state.json"),
    login: process.env.VK_PLAYWRIGHT_LOGIN,
    password: process.env.VK_PLAYWRIGHT_PASSWORD,
    headless: process.env.VK_PLAYWRIGHT_HEADLESS !== "false",
    userAgent:
      process.env.VK_PLAYWRIGHT_USER_AGENT ??
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
  };
}

async function loadPlaywright(): Promise<PlaywrightModule> {
  try {
    return await import(/* webpackIgnore: true */ "playwright");
  } catch (error) {
    throw new ConnectorError("Playwright is not installed. Run `pnpm add playwright --filter @multipost/connectors`.", {
      code: "PLAYWRIGHT_NOT_INSTALLED",
      details: error
    });
  }
}

async function isCaptchaGate(page: PlaywrightPage): Promise<boolean> {
  const url = page.url().toLowerCase();
  if (url.includes("captcha") || url.includes("authcheck")) {
    return true;
  }

  const title = (await page.title().catch(() => "")).toLowerCase();
  if (title.includes("не робот") || title.includes("robot")) {
    return true;
  }

  const captchaTextVisible = await page
    .locator("text=Проверяем, что вы не робот, text=verify you are a human, text=are not a robot")
    .first()
    .isVisible()
    .catch(() => false);

  return captchaTextVisible;
}

async function isAuthenticated(page: PlaywrightPage): Promise<boolean> {
  await page.goto("https://vk.com/", {
    waitUntil: "domcontentloaded"
  });

  if (await isCaptchaGate(page)) {
    return false;
  }

  const loginInput = page.locator('input[name="login"], input[type="email"], input[type="tel"]').first();
  return !(await loginInput.isVisible().catch(() => false));
}

async function createDebugSnapshot(page: PlaywrightPage, label: string) {
  try {
    const debugDir = path.resolve(process.cwd(), ".data", "vk-playwright-debug");
    await mkdir(debugDir, { recursive: true });

    const safeLabel = label.replace(/[^a-zA-Z0-9_-]+/g, "-");
    const stamp = Date.now();
    const screenshotPath = path.join(debugDir, `${stamp}-${safeLabel}.png`);
    const htmlPath = path.join(debugDir, `${stamp}-${safeLabel}.html`);

    await page.screenshot({
      path: screenshotPath,
      fullPage: true
    });
    await writeFile(htmlPath, await page.content(), "utf8");

    return {
      screenshotPath,
      htmlPath,
      currentUrl: page.url()
    };
  } catch (error) {
    return {
      currentUrl: page.url(),
      snapshotError: error
    };
  }
}

async function ensureAuth(
  page: PlaywrightPage,
  params: {
    login?: string;
    password?: string;
    storageStatePath: string;
  }
) {
  if (await isAuthenticated(page)) {
    return;
  }

  if (await isCaptchaGate(page)) {
    throw new ConnectorError(
      `VK Playwright остановлен проверкой 'вы не робот'. Откройте ${page.url()} и пройдите подтверждение. Затем нажмите «Проверить снова».`,
      {
        code: "PLAYWRIGHT_CAPTCHA_REQUIRED",
        details: {
          currentUrl: page.url()
        }
      }
    );
  }

  if (!params.login || !params.password) {
    throw new ConnectorError(
      "VK Playwright не авторизован. Укажите VK_PLAYWRIGHT_LOGIN и VK_PLAYWRIGHT_PASSWORD, затем повторите публикацию.",
      {
        code: "PLAYWRIGHT_AUTH_REQUIRED"
      }
    );
  }

  await page.goto("https://vk.com/", {
    waitUntil: "domcontentloaded"
  });

  const loginInput = page.locator('input[name="login"], input[type="email"], input[type="tel"]').first();
  await loginInput.fill(params.login);
  await page.locator('button:has-text("Продолжить"), button:has-text("Войти"), button[type="submit"]').first().click();

  const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
  await passwordInput.waitFor({
    state: "visible",
    timeout: 20_000
  });
  await passwordInput.fill(params.password);
  await page.locator('button:has-text("Войти"), button[type="submit"]').first().click();

  await page.waitForURL(/vk\.com\/(feed|id|im|club|public|wall)/, {
    timeout: 30_000
  });

  await mkdir(path.dirname(params.storageStatePath), {
    recursive: true
  });
  await page.context().storageState({
    path: params.storageStatePath
  });
}

async function findFirstVisibleLocator(page: PlaywrightPage, selectors: string[]): Promise<PlaywrightLocator | null> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) {
      return locator;
    }
  }

  return null;
}

async function findComposer(page: PlaywrightPage): Promise<PlaywrightLocator | null> {
  const directComposer = await findFirstVisibleLocator(page, [
    'div[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"][data-placeholder]',
    '.public_wall_text[contenteditable="true"]',
    '[id*="post_field"] div[contenteditable="true"]',
    '[data-testid*="post"] div[contenteditable="true"]',
    'div[contenteditable="true"][aria-multiline="true"]'
  ]);

  if (directComposer) {
    return directComposer;
  }

  const anyEditable = page.locator('div[contenteditable="true"]');
  const editableCount = Math.min(await anyEditable.count(), 12);
  for (let index = 0; index < editableCount; index += 1) {
    const candidate = anyEditable.nth(index);
    if (!(await candidate.isVisible().catch(() => false))) {
      continue;
    }

    const box = await candidate.boundingBox().catch(() => null);
    if (box && box.width >= 260 && box.height >= 20) {
      return candidate;
    }
  }

  return null;
}

async function openComposer(page: PlaywrightPage): Promise<PlaywrightLocator> {
  const existing = await findComposer(page);
  if (existing) {
    return existing;
  }

  const triggerSelectors = [
    'button:has-text("Новая запись")',
    'a:has-text("Новая запись")',
    'button:has-text("Что у вас нового")',
    'button:has-text("Написать")',
    '[aria-label*="Новая запись"]',
    '[aria-label*="Что у вас нового"]',
    '[data-testid*="create_post"]',
    '[data-testid*="post_create"]'
  ];

  for (const selector of triggerSelectors) {
    const trigger = page.locator(selector).first();
    const isVisible = await trigger.isVisible().catch(() => false);
    if (!isVisible) {
      continue;
    }

    await trigger.click({ timeout: 5_000 }).catch(() => undefined);
    await page.waitForTimeout(700);

    const composer = await findComposer(page);
    if (composer) {
      return composer;
    }
  }

  const debug = await createDebugSnapshot(page, "composer-not-found");
  const debugHint =
    typeof debug === "object" && debug && "screenshotPath" in debug
      ? ` Debug: ${String((debug as { screenshotPath?: string }).screenshotPath ?? "")}`
      : "";
  throw new ConnectorError(`Не удалось найти поле ввода поста во VK через Playwright.${debugHint}`, {
    code: "PLAYWRIGHT_COMPOSER_NOT_FOUND",
    details: debug
  });
}

async function attachMediaFiles(page: PlaywrightPage, files: string[]): Promise<void> {
  if (files.length === 0) {
    return;
  }

  const triggerSelectors = [
    'button:has-text("Фото/видео")',
    'button:has-text("Фото")',
    'button:has-text("Видео")',
    '[aria-label*="Фото"]',
    '[aria-label*="Видео"]',
    '[data-testid*="attach_photo"]',
    '[data-testid*="attach_media"]'
  ];

  for (const selector of triggerSelectors) {
    const trigger = page.locator(selector).first();
    const isVisible = await trigger.isVisible().catch(() => false);
    if (!isVisible) {
      continue;
    }

    const chooserPromise = page.waitForEvent("filechooser", { timeout: 3_000 }).catch(() => null);
    await trigger.click({ timeout: 5_000 }).catch(() => undefined);
    const chooser = await chooserPromise;
    if (chooser) {
      await chooser.setFiles(files);
      await page.waitForTimeout(1_500);
      return;
    }
  }

  const fileInputSelectors = [
    'input[type="file"][accept*="image"]',
    'input[type="file"][accept*="video"]',
    '[id*="post_field"] input[type="file"]',
    '[data-testid*="post"] input[type="file"]',
    'input[type="file"]'
  ];

  for (const selector of fileInputSelectors) {
    const input = page.locator(selector).first();
    const count = await input.count().catch(() => 0);
    if (count === 0) {
      continue;
    }

    try {
      await input.setInputFiles(files);
      await page.waitForTimeout(1_500);
      return;
    } catch {
      // continue with next selector
    }
  }

  const debug = await createDebugSnapshot(page, "media-attach-failed");
  const debugHint =
    typeof debug === "object" && debug && "screenshotPath" in debug
      ? ` Debug: ${String((debug as { screenshotPath?: string }).screenshotPath ?? "")}`
      : "";
  throw new ConnectorError(`Не удалось прикрепить медиа во VK через Playwright.${debugHint}`, {
    code: "PLAYWRIGHT_MEDIA_ATTACH_FAILED",
    details: {
      files,
      ...debug
    }
  });
}

async function openCommunityPage(page: PlaywrightPage, groupId: number) {
  const candidates = [`https://vk.com/public${groupId}`, `https://vk.com/club${groupId}`, `https://vk.com/wall-${groupId}`];

  for (const url of candidates) {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(700);

    if (await isCaptchaGate(page)) {
      throw new ConnectorError(
        `VK Playwright остановлен проверкой 'вы не робот'. Откройте ${page.url()} и пройдите подтверждение. Затем нажмите «Проверить снова».`,
        {
          code: "PLAYWRIGHT_CAPTCHA_REQUIRED",
          details: {
            currentUrl: page.url()
          }
        }
      );
    }

    const loginInput = page.locator('input[name="login"], input[type="email"], input[type="tel"]').first();
    if (await loginInput.isVisible().catch(() => false)) {
      throw new ConnectorError("VK Playwright не авторизован. Укажите VK_PLAYWRIGHT_LOGIN и VK_PLAYWRIGHT_PASSWORD.", {
        code: "PLAYWRIGHT_AUTH_REQUIRED"
      });
    }

    const composer = await findComposer(page);
    if (composer) {
      return;
    }
  }
}

async function publishPostViaUi(input: PublishViaPlaywrightInput) {
  const playwright = await loadPlaywright();
  const params = readPlaywrightEnv();
  const browser = await playwright.chromium.launch({
    headless: params.headless,
    args: ["--disable-blink-features=AutomationControlled"],
    ignoreDefaultArgs: ["--enable-automation"]
  });

  try {
    const context = await browser.newContext({
      storageState: existsSync(params.storageStatePath) ? params.storageStatePath : undefined,
      userAgent: params.userAgent,
      locale: "ru-RU",
      timezoneId: "Europe/Moscow",
      viewport: {
        width: 1366,
        height: 900
      }
    });
    const page = await context.newPage();
    const selectAllShortcut = process.platform === "darwin" ? "Meta+A" : "Control+A";

    await ensureAuth(page, params);
    await openCommunityPage(page, input.config.groupId);

    const composer = await openComposer(page);
    await composer.click({ timeout: 10_000 });
    await page.keyboard.press(selectAllShortcut).catch(() => undefined);
    await page.keyboard.type(input.message || " ");

    if (input.mediaAbsolutePaths.length > 0) {
      await attachMediaFiles(page, input.mediaAbsolutePaths);
    }

    const publishButton = await findFirstVisibleLocator(page, [
      'button:has-text("Опубликовать")',
      'button:has-text("Опубликовать запись")',
      'button:has-text("Отправить")',
      'button:has-text("Поделиться")',
      '.post_field_submit',
      '[data-testid*="publish"]',
      '[data-testid*="submit"]'
    ]);

    if (!publishButton) {
      const debug = await createDebugSnapshot(page, "publish-button-not-found");
      const debugHint =
        typeof debug === "object" && debug && "screenshotPath" in debug
          ? ` Debug: ${String((debug as { screenshotPath?: string }).screenshotPath ?? "")}`
          : "";
      throw new ConnectorError(`Не удалось найти кнопку публикации во VK через Playwright.${debugHint}`, {
        code: "PLAYWRIGHT_PUBLISH_BUTTON_NOT_FOUND",
        details: debug
      });
    }

    await publishButton.click({ timeout: 10_000 });
    await page.waitForTimeout(2_500);

    await context.storageState({
      path: params.storageStatePath
    });

    return {
      ok: true,
      pageUrl: page.url()
    };
  } finally {
    await browser.close();
  }
}

export async function publishVkViaPlaywright(input: PublishViaPlaywrightInput) {
  return publishPostViaUi(input);
}

export async function testVkViaPlaywright(input: { config: VkChannelConfig; message: string }) {
  return publishPostViaUi({
    config: input.config,
    message: input.message,
    mediaAbsolutePaths: []
  });
}
