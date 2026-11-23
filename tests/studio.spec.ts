import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const base = process.env.APP_URL || "http://127.0.0.1:5173";

test("studio renders and explains the local signal chain", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto(base);
  await page.getByRole("heading", { name: "Your sound. Pureform." }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1100);
  await page.screenshot({
    path: "test-results/studio-desktop.png",
    fullPage: true,
  });
  await expect(
    page.getByRole("button", { name: "Export master" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "The signal chain", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Measure first" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/studio-mobile.png",
    fullPage: true,
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  expect(errors).toEqual([]);
});

test("demo masters locally, plays, responds to controls, and exports a 24-bit 48 kHz WAV", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto(base);
  await page.getByRole("button", { name: /Try a demo track/ }).click();
  const exportButton = page.getByRole("button", { name: "Export master" });
  await expect(exportButton).toBeEnabled({ timeout: 60000 });
  await expect(
    page.getByText("Your master is ready", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await page.getByRole("button", { name: "Play audio", exact: true }).click();
  await page.waitForTimeout(1300);
  await expect(
    page.getByRole("button", { name: "Pause playback", exact: true }),
  ).toBeVisible();
  expect(
    await page.locator(".playback-time>span").first().textContent(),
  ).not.toBe("00:00");
  await page.getByRole("button", { name: "Original", exact: true }).click();
  await page.getByRole("button", { name: "Master", exact: true }).click();
  await page.getByRole("switch", { name: /Level match/ }).click();
  await expect(page.getByRole("switch", { name: /Level match/ })).toBeChecked();
  await page
    .getByRole("button", { name: "Pause playback", exact: true })
    .click();
  await page.getByRole("slider", { name: "WARMTH", exact: true }).focus();
  await page.keyboard.press("ArrowUp");
  await expect(
    page.getByRole("slider", { name: "WARMTH", exact: true }),
  ).toHaveAttribute("aria-valuenow", "26");
  await expect(exportButton).toBeEnabled({ timeout: 60000 });
  await page.getByRole("button", { name: "Custom", exact: true }).click();
  await page.getByRole("option", { name: /Warm & full/ }).click();
  await expect(
    page.getByRole("slider", { name: "WARMTH", exact: true }),
  ).toHaveAttribute("aria-valuenow", "55");
  await expect(exportButton).toBeEnabled({ timeout: 60000 });
  await page.screenshot({
    path: "test-results/studio-mastered.png",
    fullPage: true,
  });
  const downloadEvent = page.waitForEvent("download");
  await exportButton.click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toContain("Pureform Master.wav");
  await download.saveAs("test-results/master.wav");
  const data = await readFile("test-results/master.wav");
  expect(data.toString("ascii", 0, 4)).toBe("RIFF");
  expect(data.toString("ascii", 8, 12)).toBe("WAVE");
  expect(data.readUInt16LE(20)).toBe(1);
  expect(data.readUInt16LE(22)).toBe(2);
  expect(data.readUInt32LE(24)).toBe(48000);
  expect(data.readUInt16LE(34)).toBe(24);
  expect(data.readUInt32LE(40)).toBe(24 * 48000 * 2 * 3);
  let peak = 0;
  for (let i = 44; i < data.length; i += 3)
    peak = Math.max(peak, Math.abs(data.readIntLE(i, 3) / 8388607));
  expect(20 * Math.log10(peak)).toBeLessThanOrEqual(-0.99);
  const reference = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-i",
      "test-results/master.wav",
      "-af",
      "ebur128=peak=true",
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8" },
  );
  if (!reference.error) {
    const truePeak = reference.stderr.match(/Peak:\s+(-?[\d.]+) dBFS/);
    expect(truePeak).not.toBeNull();
    expect(Number(truePeak?.[1])).toBeLessThanOrEqual(-1);
  }
  await expect(exportButton).toBeEnabled();
  const againEvent = page.waitForEvent("download");
  await exportButton.click();
  await (await againEvent).saveAs("test-results/master-again.wav");
  expect(data.equals(await readFile("test-results/master-again.wav"))).toBe(
    true,
  );
  expect(errors).toEqual([]);
});

test("invalid input has a useful error without an upload", async ({ page }) => {
  await page.goto(base);
  await page.getByLabel("Choose an audio file").setInputFiles({
    name: "not-a-mix.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not audio"),
  });
  await expect(page.getByRole("alert")).toContainText("Choose a WAV, FLAC");
  await expect(
    page.getByRole("button", { name: "Export master" }),
  ).toBeDisabled();
});
