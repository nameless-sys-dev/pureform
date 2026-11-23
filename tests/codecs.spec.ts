import { test, expect } from "@playwright/test";

const base = process.env.APP_URL || "http://127.0.0.1:5173";

for (const filename of [
  "mix.wav",
  "mix.flac",
  "mix-aac.m4a",
  "mix-alac.m4a",
  "mix.mp3",
]) {
  test(`imports and masters ${filename} without uploading audio`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    const writes: string[] = [];
    page.on("request", (request) => {
      if (!["GET", "HEAD"].includes(request.method()))
        writes.push(request.url());
    });
    await page.goto(base);
    await page
      .getByLabel("Choose an audio file")
      .setInputFiles(`tests/fixtures/${filename}`);
    await expect(
      page.getByRole("button", { name: "Export master" }),
    ).toBeEnabled({ timeout: 60000 });
    await expect(page.locator(".waveform-file")).toContainText(filename);
    await expect(
      page.getByText("48 KHZ / STEREO", { exact: true }),
    ).toBeVisible();
    expect(writes).toEqual([]);
  });
}

test("self-hosted WASM fallback works when the native decoder does not", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.addInitScript(() => {
    const original = AudioContext.prototype.decodeAudioData;
    let first = true;
    AudioContext.prototype.decodeAudioData = function (
      ...args: Parameters<typeof original>
    ) {
      if (first) {
        first = false;
        return Promise.reject(
          new DOMException("Test fallback", "EncodingError"),
        );
      }
      return original.apply(this, args);
    };
  });
  const codecRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/codecs/")) codecRequests.push(request.url());
  });
  await page.goto(base);
  await page
    .getByLabel("Choose an audio file")
    .setInputFiles("tests/fixtures/mix-alac.m4a");
  await expect(page.getByRole("button", { name: "Export master" })).toBeEnabled(
    { timeout: 60000 },
  );
  expect(codecRequests.some((url) => url.endsWith("ffmpeg-core.wasm"))).toBe(
    true,
  );
  expect(
    codecRequests.every((url) => new URL(url).origin === new URL(base).origin),
  ).toBe(true);
});
