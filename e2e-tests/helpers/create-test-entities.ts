import { LatLng } from "@shared/api/common";
import { TestDeviceHandle, TestProjectHandle, TestUserHandle } from "@shared/client/types";
import { TestApi, TestApiImpl } from "@shared/client";
import { testLocation } from "@/helpers/location-helpers";
import { expect, test } from "@playwright/test";
import { FileFixtures } from "@/helpers/upload-tests";
import { getEmail } from "@/helpers/browse-helpers";

export interface ProjectBundle {
  userHandles: TestUserHandle[];
  projectHandle: TestProjectHandle;
  deviceHandles: TestDeviceHandle[];
  locationBase: LatLng;
  context?: FileFixtures;
  getAdminUser: () => TestUserHandle;
  getOwner: () => TestUserHandle;
  getDevice: () => TestDeviceHandle;
  getTestSuperUser: () => Promise<TestUserHandle>;
  getNonAdmin: () => TestUserHandle | null;
  api: (userOrDevice?: TestUserHandle | TestDeviceHandle) => TestApi;
}

export const getTestName = (str: string) =>
  `${str}-${Math.floor(Number.MAX_SAFE_INTEGER * Math.random()).toString(36)}`;

export const getDeviceTestName = (str: string) => getTestName(`cy_device-${str}`);
export const getUserTestName = (str: string) => getTestName(`cy_user-${str}`);
export const getProjectTestName = (str: string) => getTestName(`cy_project-${str}`);

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
export const loginSuperAdminUser = async (
  userName: string,
  email: string,
  password: string,
): Promise<TestUserHandle> => {
  const testId = `cy_user-${userName}`;

  const userResponse = await TestApiImpl.Users.login(email, password);
  expect(userResponse.success, "login super admin user").toBe(true);
  if (userResponse.success) {
    TestApiImpl.registerCredentials(testId, {
      userData: userResponse.result.userData,
      refreshToken: userResponse.result.refreshToken,
      apiToken: userResponse.result.token,
    });
    const userId = userResponse.result.userData.id;
    return {
      testId,
      id: userId,
      type: "user",
    };
  }
  throw new Error("Failed to create super user");
};

export const createUser = async (userName: string): Promise<TestUserHandle> => {
  const userHandle = getUserTestName(userName);
  return await test.step(`Create user '${userHandle}'`, async () => {
    const userResponse = await TestApiImpl.Users.register(
      userHandle,
      "password",
      getEmail(userHandle),
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

export const addUserToProject = (
  project: ProjectBundle,
  user: TestUserHandle,
  asAdmin: boolean = false,
): Promise<void> => {
  return test.step(`Add user ${user.testId} to project ${project.projectHandle.testId}`, async () => {
    const inviteResponse = await TestApiImpl.Projects.withAuth(
      project.getAdminUser().testId,
    ).inviteSomeoneToProject(project.projectHandle.id, getEmail(user.testId), asAdmin);
    expect(inviteResponse.success, "invite user succeeded").toBe(true);
    const acceptInviteResponse = await TestApiImpl.Users.withAuth(
      user.testId,
    ).acceptProjectInvitation(project.projectHandle.id);
    expect(acceptInviteResponse.success, "accept invite succeeded").toBe(true);
  });
};

export const createProject = async (
  projectName: string,
  userHandle: TestUserHandle,
): Promise<TestProjectHandle> => {
  const projectHandle = getProjectTestName(projectName);
  return await test.step(`Create project '${projectHandle}'`, async () => {
    const projectResponse = await TestApiImpl.Projects.withAuth(userHandle.testId).addNewProject(
      projectHandle,
    );
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
  initialDateTime?: Date,
  useExplicitDeviceName: boolean = false,
): Promise<TestDeviceHandle> => {
  const uniqueHandle = getDeviceTestName(deviceName);
  const deviceHandle = useExplicitDeviceName ? deviceName : uniqueHandle;
  return await test.step(`Create device '${deviceHandle}'`, async () => {
    const deviceResponse = await TestApiImpl.Devices.registerDevice(
      projectHandle.testId,
      deviceHandle,
      "password",
      initialDateTime,
    );
    expect(deviceResponse.success, "create device").toBe(true);
    if (deviceResponse.success) {
      TestApiImpl.registerCredentials(uniqueHandle, deviceResponse.result);
      const deviceId = deviceResponse.result.id;
      return {
        id: deviceId,
        testId: uniqueHandle,
        type: "device",
      };
    }
    throw new Error("Failed to create device");
  });
};

export const createProjectWithUserAndDevice = async (options?: {
  nameBase?: string;
  initialDateTime?: Date;
  locationBase?: LatLng;
}): Promise<ProjectBundle> => {
  const nameBase = (options && options.nameBase) || "Test";
  const locationBase = (options && options.locationBase) || testLocation(-42.0, 172.0, 5.0);
  const userHandle = await createUser(nameBase);
  const projectHandle = await createProject(nameBase, userHandle);
  const deviceHandle = await addDeviceToProject(
    nameBase,
    projectHandle,
    options && options.initialDateTime,
  );
  const deviceHandles = [deviceHandle];
  const userHandles = [userHandle];
  return {
    userHandles,
    projectHandle,
    locationBase,
    deviceHandles,
    getAdminUser: (): TestUserHandle => {
      return userHandle;
    },
    getOwner: (): TestUserHandle => {
      return userHandle;
    },
    getDevice: (): TestDeviceHandle => {
      if (deviceHandles.length > 1) {
        console.warn("More than one device in this project, returning the first one");
      }
      return deviceHandles[0];
    },
    getTestSuperUser: async (): Promise<TestUserHandle> => {
      return await loginSuperAdminUser("admin_test", "admin@email.com", "admin_test");
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
