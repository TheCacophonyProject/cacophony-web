import { test as base } from '@playwright/test';
import { readFile } from 'node:fs/promises';

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
};

export const test = base.extend<FileFixtures>({
    startupCptv: async ({page}, use) => {
        const file = await readFile("./file-fixtures/startup-status.cptv");
        await use(file.buffer as ArrayBuffer);
    },
    shutdownCptv: async ({page}, use) => {
        const file = await readFile("./file-fixtures/shutdown-status.cptv");
        await use(file.buffer as ArrayBuffer);
    },
    smallCptv: async ({page}, use) => {
        const file = await readFile("./file-fixtures/small.cptv");
        await use(file.buffer as ArrayBuffer);
    },
    testLowPowerCptv: async ({page}, use) => {
        // TODO
        const file = await readFile("./file-fixtures/small.cptv");
        await use(file.buffer as ArrayBuffer);
    },
    testHighPowerCptv: async ({page}, use) => {
        // TODO
        const file = await readFile("./file-fixtures/small.cptv");
        await use(file.buffer as ArrayBuffer);
    },
    oneFrameCptv: async ({page}, use) => {
        const file = await readFile("./file-fixtures/oneframe.cptv");
        await use(file.buffer as ArrayBuffer);
    },

    legacyAudio: async ({page}, use) => {
        const file = await readFile("./file-fixtures/60sec-audio.m4a");
        await use(file.buffer as ArrayBuffer);
    },
    standardAudio: async ({page}, use) => {
        const file = await readFile("./file-fixtures/audio-60s-tc2.m4a");
        await use(file.buffer as ArrayBuffer);
    },
    testAudio: async ({page}, use) => {
        const file = await readFile("./file-fixtures/audio-test-recording-tc2.m4a");
        await use(file.buffer as ArrayBuffer);
    },

    zeroSizedFile: async ({page}, use) => {
        const file = await readFile("./file-fixtures/zero-sized");
        await use(file.buffer as ArrayBuffer);
    },
    corruptFile: async ({page}, use) => {
        const file = await readFile("./file-fixtures/invalid");
        await use(file.buffer as ArrayBuffer);
    },
});

export { expect } from '@playwright/test';