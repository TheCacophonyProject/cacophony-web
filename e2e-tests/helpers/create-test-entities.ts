import { LatLng } from "@shared/api/common";
import {
    TestDeviceHandle,
    TestProjectHandle,
    TestUserHandle,
} from "@shared/client/types";
import { TestApi, TestApiImpl } from "@shared/client";
import { testLocation } from "@/helpers/location-helpers";
import {expect, test} from "@playwright/test";
import {FileFixtures} from "@/helpers/upload-tests";

export interface ProjectBundle {
    userHandles: TestUserHandle[];
    projectHandle: TestProjectHandle;
    deviceHandles: TestDeviceHandle[];
    locationBase: LatLng;
    context?: FileFixtures;
    getAdmin: () => TestUserHandle;
    getOwner: () => TestUserHandle;
    getTestSuperUser: () => TestUserHandle;
    getNonAdmin: () => TestUserHandle | null;
    api: (userOrDevice: TestUserHandle | TestDeviceHandle) => TestApi;
}

const getTestName = (str: string) =>
    `${str}-${Math.floor(Number.MAX_SAFE_INTEGER * Math.random()).toString(36)}`;

// const getTestFixture = async (fileName: string): Promise<ArrayBuffer> => {
//     return new Promise((resolve) => {
//         cy.fixture(fileName, "binary").then(async (fileBinary: string) => {
//             // File in binary format gets converted to blob so it can be sent as Form data
//             const blob = Cypress.Blob.binaryStringToBlob(fileBinary);
//             const arrayBuffer = await blob.arrayBuffer();
//             resolve(arrayBuffer);
//         });
//     });
// };
//
// const getTestFixtures = async (
//     fixtures: string[],
// ): Promise<Record<string, ArrayBuffer>> => {
//     const loadedFixtures = {};
//     for (const fixture of fixtures) {
//         loadedFixtures[fixture] = await getTestFixture(fixture);
//     }
//     return loadedFixtures;
// };

export const createSuperAdminUser = async (
    userName: string,
    email: string,
    password: string,
): Promise<TestUserHandle | null> => {
    const userHandle = getTestName(`cy_user-${userName}`);
    const userResponse = await TestApiImpl.Users.login(email, password);
    expect(userResponse.success, "login super admin user").toBe(true);
    if (userResponse.success) {
        TestApiImpl.registerCredentials(userHandle, {
            userData: userResponse.result.userData,
            refreshToken: userResponse.result.refreshToken,
            apiToken: userResponse.result.token,
        });
        const userId = userResponse.result.userData.id;
        console.log(`Logged in test super admin user ${userHandle} with id ${userId}`);
        return {
            testId: userHandle,
            id: userId,
            type: "user",
        };
    }
    return null;
};

export const createUser = async (
    userName: string,
): Promise<TestUserHandle> => {
    const userHandle = getTestName(`cy_user-${userName}`);
    return await test.step(`Create user '${userHandle}'`, async () => {
        const userResponse = await TestApiImpl.Users.register(
            userHandle,
            "password",
            `${userHandle}@api-test.cacophony.org.nz`,
            3,
        );
        expect(userResponse.success, "create user succeeded").toBe(true);
        if (userResponse.success) {
            TestApiImpl.registerCredentials(userHandle, {
                userData: userResponse.result.userData,
                refreshToken: userResponse.result.refreshToken,
                apiToken: userResponse.result.token,
            });
            const userId = userResponse.result.userData.id;
            return {
                testId: userHandle,
                id: userId,
                type: "user",
            };
        }
        throw new Error("Failed to create user");
    });
};

export const createProject = async (
    projectName: string,
    userHandle: TestUserHandle,
): Promise<TestProjectHandle> => {
    const projectHandle = getTestName(`cy_project-${projectName}`);
    return await test.step(`Create project '${projectHandle}'`, async () => {
        const projectResponse = await TestApiImpl.Projects.withAuth(
            userHandle.testId,
        ).addNewProject(projectHandle);
        expect(projectResponse.success, "create project succeeded").toBe(true);
        if (projectResponse.success) {
            const projectId = projectResponse.result.groupId;
            // Do we need some way of keeping track of the project id?
            //projectCredentials.set(projectHandle, projectId);
            //console.log(`Created project ${projectHandle} with id ${projectId}`);
            return {
                testId: projectHandle,
                id: projectId,
                type: "project",
            };
        }
        throw new Error("Failed to create project");
    });
};

export const addDeviceToProject = async (
    deviceName: string,
    projectHandle: TestProjectHandle,
): Promise<TestDeviceHandle> => {
    const deviceHandle = getTestName(`cy_device-${deviceName}`);
    return await test.step(`Create device '${deviceHandle}'`, async () => {
        const deviceResponse = await TestApiImpl.Devices.registerDevice(
            projectHandle.testId,
            deviceHandle,
            "password",
        );
        expect(deviceResponse.success, "create device").toBe(true);
        if (deviceResponse.success) {
            TestApiImpl.registerCredentials(deviceHandle, deviceResponse.result);
            const deviceId = deviceResponse.result.id;
            return {
                id: deviceId,
                testId: deviceHandle,
                type: "device",
            };
        }
        throw new Error("Failed to create device");
    });
};

export const createProjectWithUserAndDevice = async (options?: {
    nameBase?: string;
    locationBase?: LatLng;
}): Promise<ProjectBundle> => {
    const nameBase = (options && options.nameBase) || "Test";
    const locationBase =
        (options && options.locationBase) || testLocation(-42.0, 172.0, 5.0);

    console.log("HERE");
    // const superUserLoginCredentials: {
    //     name: string;
    //     password: string;
    //     email: string;
    // } = Cypress.env("testCreds")["superuser"]; // FIXME: This should be a test fixture?
    const userHandle = await createUser(nameBase);
    // const testSuperAdminHandle = await createSuperAdminUser(
    //     superUserLoginCredentials.name,
    //     superUserLoginCredentials.email,
    //     superUserLoginCredentials.password,
    // );
    const projectHandle = await createProject(nameBase, userHandle);
    const deviceHandle = await addDeviceToProject(nameBase, projectHandle);
    return {
        userHandles: [userHandle],
        projectHandle,
        locationBase,
        deviceHandles: [deviceHandle],
        getAdmin: (): TestUserHandle => {
            return userHandle;
        },
        getOwner: (): TestUserHandle => {
            return userHandle;
        },
        getTestSuperUser: (): TestUserHandle => {
            return {
                testId: "foo",
                type: "user",
                id: 123
            }
            //return testSuperAdminHandle;
        },
        getNonAdmin: (): TestUserHandle | null => {
            // There may not be non-admin users.
            return null;
        },
        api: (user: TestUserHandle | TestDeviceHandle = userHandle) => {
            return TestApiImpl.withAuth(user.testId);
        },
    };
};
