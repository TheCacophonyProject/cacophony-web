import { test as base } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { restoreNodeFetch, shimPlaywrightFetch } from "./shim-playright-fetch";

export type FileFixtures = {
  // Thermal recordings
  smallCptv: ArrayBuffer;
  testLowPowerCptv: ArrayBuffer;
  testHighPowerCptv: ArrayBuffer;
  startupCptv: ArrayBuffer;
  shutdownCptv: ArrayBuffer;
  oneFrameCptv: ArrayBuffer;

  // Audio/bird recordings
  legacyAudio: ArrayBuffer; // Audio file without tc2 audio header metadata
  standardAudio: ArrayBuffer;
  testAudio: ArrayBuffer;

  // Invalid files
  zeroSizedFile: ArrayBuffer;
  corruptFile: ArrayBuffer;

  // TODO: Worth having a corrupt CPTV which is actually a real one, just truncated
  deviceReferenceImage: ArrayBuffer;
};
// TODO: maybe include mime type?

export const test = base.extend<FileFixtures & { globalHooks: void }>({
  // Overriding built-in page fixture
  page: async ({ baseURL, page }, use) => {
    // Automatically navigate to the base url before the test blocks execute
    if (baseURL) {
      await page.goto(baseURL);
    }

    // Hand the pre-navigated page off to your test case
    await use(page);
  },

  // For every test, swap nodes' fetch impl with playwrights, so that requests show up properly in the playwright UI.
  globalHooks: [
    async ({ request }, use) => {
      // Runs before each test
      await shimPlaywrightFetch({ request });
      // Passes control over to the actual test block
      await use();

      // Runs after each test
      await restoreNodeFetch();
    },
    { auto: true },
  ], // 'auto: true' forces this to run for every test automatically

  startupCptv: async ({}, use) => {
    const file = await readFile("./file-fixtures/startup-status.cptv");
    await use(file.buffer as ArrayBuffer);
  },
  shutdownCptv: async ({}, use) => {
    const file = await readFile("./file-fixtures/shutdown-status.cptv");
    await use(file.buffer as ArrayBuffer);
  },
  smallCptv: async ({}, use) => {
    const file = await readFile("./file-fixtures/small.cptv");
    await use(file.buffer as ArrayBuffer);
  },
  testLowPowerCptv: async ({}, use) => {
    // TODO
    const file = await readFile("./file-fixtures/small.cptv");
    await use(file.buffer as ArrayBuffer);
  },
  testHighPowerCptv: async ({}, use) => {
    // TODO
    const file = await readFile("./file-fixtures/small.cptv");
    await use(file.buffer as ArrayBuffer);
  },
  oneFrameCptv: async ({}, use) => {
    const file = await readFile("./file-fixtures/oneframe.cptv");
    await use(file.buffer as ArrayBuffer);
  },

  legacyAudio: async ({}, use) => {
    const file = await readFile("./file-fixtures/60sec-audio.m4a");
    await use(file.buffer as ArrayBuffer);
  },
  standardAudio: async ({}, use) => {
    const file = await readFile("./file-fixtures/audio-60s-tc2.m4a");
    await use(file.buffer as ArrayBuffer);
  },
  testAudio: async ({}, use) => {
    const file = await readFile("./file-fixtures/audio-test-recording-tc2.m4a");
    await use(file.buffer as ArrayBuffer);
  },

  zeroSizedFile: async ({}, use) => {
    const file = await readFile("./file-fixtures/zero-sized");
    await use(file.buffer as ArrayBuffer);
  },
  corruptFile: async ({}, use) => {
    const file = await readFile("./file-fixtures/invalid");
    await use(file.buffer as ArrayBuffer);
  },
  deviceReferenceImage: async ({}, use) => {
    const file = await readFile("./file-fixtures/reference-image.jpeg");
    await use(file.buffer as ArrayBuffer);
  },
});

export { expect } from "@playwright/test";
