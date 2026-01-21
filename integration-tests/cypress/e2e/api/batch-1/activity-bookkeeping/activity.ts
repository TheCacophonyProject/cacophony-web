// When we upload a recording, lastest thermal recording time etc should be adjusted.
// If we delete a recording, it should also be adjusted.
// If it's the last recording in a location, we should delete the location.
import {TestDeviceHandle, TestEntityHandle, TestProjectHandle, TestUserHandle} from "@shared/client/types";
import { LatLng, RecordingId } from "@typedefs/api/common";
import { RecordingType } from "@shared/api/consts";
import { TestApi } from "@shared/client";
import project from "@shared/client/Project";
import {ApiRecordingUploadData} from "@shared/api/recording";
// Probably create this once for tests and re-export?

// TODO: We need to init the credentials resolver per "session".

// TODO: Need to work out the ergonomics of calling the same API with different user handles in sequence.
// I guess we just need to have a different resolver per credential?
interface ProjectBundle {
  userHandles: TestUserHandle[],
  projectHandle: TestProjectHandle,
  deviceHandles: TestDeviceHandle[],
  locationBase: LatLng,
  testFixtures: Record<string, ArrayBuffer>
}

const getTestName = (str: string) => `${str}-${Math.floor((Number.MAX_SAFE_INTEGER * Math.random())).toString(36)}`;

const createUser = async (userName: string): Promise<TestUserHandle | null> => {
  const userHandle = getTestName(`user-${userName}`);
  const userResponse = await TestApi.Users.register(userHandle, "password", `${userHandle}@api-test.cacophony.org.nz`, 3);
  expect(userResponse.success, "create user").to.be.true;
  if (userResponse.success) {
    TestApi.registerCredentials(userHandle, {
      userData: userResponse.result.userData,
      refreshToken: userResponse.result.refreshToken,
      apiToken: userResponse.result.token,
    });
    const userId = userResponse.result.userData.id;
    cy.log(`Created user ${userHandle} with id ${userId}`);
    return {
      testId: userHandle,
      id: userId,
      type: "user",
    };
  }
  return null;
};

const createProject = async (projectName: string, userHandle: TestUserHandle): Promise<TestProjectHandle | null> => {
  const projectHandle = getTestName(`project-${projectName}`);
  const projectResponse = await TestApi.Projects.withAuth(userHandle.testId).addNewProject(projectHandle);
  expect(projectResponse.success, "create project").to.be.true;
  if (projectResponse.success) {
    const projectId = projectResponse.result.groupId;
    // Do we need some way of keeping track of the project id?
    //projectCredentials.set(projectHandle, projectId);
    cy.log(`Created project ${projectHandle} with id ${projectId}`);
    return {
      testId: projectHandle,
      id: projectResponse.result.groupId,
      type: "project",
    };
  }
  return null;
};

const addDeviceToProject = async (deviceName: string, projectHandle: TestProjectHandle): Promise<TestDeviceHandle | null> => {
  const deviceHandle = getTestName(`device-${deviceName}`);
  const deviceResponse = await TestApi.Devices.registerDevice(projectHandle.testId, deviceHandle, "password");
  expect(deviceResponse.success, "create device").to.be.true;
  if (deviceResponse.success) {
    TestApi.registerCredentials(deviceHandle, deviceResponse.result);
    const deviceId = deviceResponse.result.id;
    cy.log(`Created device ${deviceHandle} with id ${deviceId}`);
    return {
      id: deviceId,
      testId: deviceHandle,
      type: "device",
    };
  }
  return null;
};

const extForUploadFileType = (type: RecordingType) => {
   switch (type) {
     case RecordingType.Audio:
       return ".m4a";
     case RecordingType.InfraredVideo:
       return ".mp4";
     case RecordingType.ThermalRaw:
     default:
       return ".cptv";
   }
};

const getMimeTypeFromFileName = (fileName: string): string => {
  const ext = fileName.split(".").pop();
  let mimeType = "application/octet-stream";
  switch (ext) {
    case "mp4":
      mimeType = "video/mp4";
      break;
    case "m4a":
      mimeType = "audio/mp4";
      break;
    case "mp3":
      mimeType = "audio/mpeg";
      break;
    case "cptv":
      mimeType = "application/x-cptv";
      break;
    case "webp":
      mimeType = "image/webp";
      break;
    case "jpg":
    case "jpeg":
      mimeType = "image/jpeg";
      break;
    case "ogg":
      mimeType = "audio/ogg";
      break;
    case "wav":
      mimeType = "audio/wav";
      break;
  }
  return mimeType;
};

const getTestFixture = async (fileName: string): Promise<ArrayBuffer> => {
  return new Promise((resolve) => {
      cy.fixture(fileName, "binary").then(async (fileBinary: string) => {
        // File in binary format gets converted to blob so it can be sent as Form data
        const blob = Cypress.Blob.binaryStringToBlob(
            fileBinary,
            getMimeTypeFromFileName(fileName),
        );
        const arrayBuffer = await blob.arrayBuffer();
        resolve(arrayBuffer);
      });
  });
};

const uploadRecording = async (uploaderHandle: TestEntityHandle, recordingOptions: { project: ProjectBundle; location?: LatLng; deviceHandle?: TestDeviceHandle, isTestRecording?: boolean, type: RecordingType, recordingDateTime: Date }): Promise<RecordingId | null> => {
  expect(["user", "device"], "uploader must be device or user").to.include(uploaderHandle.type);
  const deviceId = uploaderHandle.id;
  const rawFile = recordingOptions.project["oneframe.cptv"] as ArrayBuffer;
  const rawFileName = `filename.${extForUploadFileType(recordingOptions.type)}`;
  // TODO: Maybe we could fuzz a location based on locationBase if there's no supplied location
  const location = recordingOptions.location ?? recordingOptions.project.locationBase;
  let upload;

  // TODO: Add recording type to metadata: test, startup, shutdown.

  const data: ApiRecordingUploadData = {
    location,
    type: recordingOptions.type,
    recordingDateTime: recordingOptions.recordingDateTime,
  };
  if (recordingOptions && recordingOptions.isTestRecording) {
    data.additionalMetadata = {"test": true};
  }
  if (uploaderHandle.type === "device") {
    upload = TestApi.Recordings.withAuth(uploaderHandle.testId).uploadRecordingFromDevice({
      location,
      type: recordingOptions.type,
      recordingDateTime: recordingOptions.recordingDateTime,
    }, rawFile, rawFileName);
  } else if (uploaderHandle.type === "user") {
    upload = TestApi.Recordings.withAuth(uploaderHandle.testId).uploadRecordingOnBehalfOfDevice(deviceId, data, rawFile, rawFileName);
  }
  const response = await upload;
  expect(response.success, "uploaded recording").to.be.true;
  if (response.success) {
    return response.result.recordingId;
  } else {
    console.error("Failed to upload recording", response);
  }
  return null;
};

const uploadRecordingFromDeviceForProject = async (options: { project: ProjectBundle; location?: LatLng; deviceHandle?: TestDeviceHandle, isTestRecording?: boolean, type: RecordingType, recordingDateTime: Date }): Promise<RecordingId | null> => {
  // Use the first device in the project bundle, or the specified device.
  const deviceToUploadFrom: TestDeviceHandle = options.deviceHandle || options.project.deviceHandles[0];
  console.log("deviceToUploadFrom", deviceToUploadFrom);
  return uploadRecording(deviceToUploadFrom, options);
};

const uploadThermalRecordingFromDeviceForProject = async (options: { project: ProjectBundle; location?: LatLng; deviceHandle?: TestDeviceHandle, recordingDateTime: Date }): Promise<RecordingId> => {
  return uploadRecordingFromDeviceForProject({...options, type: RecordingType.ThermalRaw });
};

const uploadThermalTestRecordingFromDeviceForProject = async (options: { project: ProjectBundle; location?: LatLng; deviceHandle?: TestDeviceHandle, recordingDateTime: Date }): Promise<RecordingId> => {
  return uploadRecordingFromDeviceForProject({...options, type: RecordingType.ThermalRaw, isTestRecording: true });
};

const uploadAudioRecordingFromDeviceForProject = async (options: { project: ProjectBundle; location?: LatLng; deviceHandle?: TestDeviceHandle, isTestRecording?: true, recordingDateTime: Date }): Promise<RecordingId> => {
  return uploadRecordingFromDeviceForProject({...options, type: RecordingType.Audio });
};

const uploadAudioTestRecordingFromDeviceForProject = async (options: { project: ProjectBundle; location?: LatLng; deviceHandle?: TestDeviceHandle, recordingDateTime: Date }): Promise<RecordingId> => {
  return uploadRecordingFromDeviceForProject({...options, type: RecordingType.Audio, isTestRecording: true });
};

const testLocation = (lat: number, lng: number, fudgeFactor: number = 1.0): LatLng => {
  return {
    lat: lat + ((Math.random() - 0.5) * fudgeFactor),
    lng: lng + ((Math.random() - 0.5) * fudgeFactor),
  };
};

// Flipped Lat/long
const invalidTestLocation = () => testLocation(170, 45);
const validTestLocation = () => testLocation(-45, 170);
const nullTestLocation = () => testLocation(0, 0, 0);

const createProjectWithUserAndDevice = async (options?: { nameBase?: string, locationBase?: LatLng, testFixtures?: string[] }): Promise<ProjectBundle> => {
  const testFixtures = await getTestFixtures(["oneframe.cptv", "invalid.cptv", ...(options?.testFixtures ?? [])]);
  const nameBase = (options && options.nameBase) || "Test";
  const locationBase = (options && options.locationBase) || testLocation(-42.0, 172.0, 5.0);

  const userHandle = await createUser(nameBase);
  const projectHandle = await createProject(nameBase, userHandle);
  const deviceHandle = await addDeviceToProject(nameBase, projectHandle);
  return {
    userHandles:  [userHandle],
    projectHandle,
    locationBase,
    deviceHandles: [deviceHandle],
    testFixtures,
  };
};

const getTestFixtures = async (fixtures: string[]): Promise<Record<string, ArrayBuffer>> => {
  const loadedFixtures = {};
  for (const fixture of fixtures) {
    loadedFixtures[fixture] = await getTestFixture(fixture);
  }
  return loadedFixtures;
};

describe("Activity bookkeeping", () => {
  before(async () => {

  });

  // eslint-disable-next-line cypress/no-async-tests
  it("Test description", async () => {
    // For whatever reason, fixtures need to be loaded up front.  Once we've made one async function, Cypress
    // no longer wants to load these.
    // The goal of this is to make sure we keep our stats in sync when we add and delete recordings from devices.
    // This is important, since it lets us know the ranges that we can search within for locations, the whole project
    // and individual devices.
    const project = await createProjectWithUserAndDevice();

    console.log("Project", project);
    // What status to return when a project is brand new with no devices?

    // When a project is created, there is no activity, and all date range fields should be blank.

    // If a test recording is made, it should count as activity.

    // Test with uploading recordings both from device and on behalf of device using user/project settings.
    const recording = await uploadThermalTestRecordingFromDeviceForProject({
      project,
      recordingDateTime: new Date(),
    });
    // When recordings are deleted, the book-keeping should be updated to reflect that.



    // If a regular recording is made, it should also count as activity.
    // We should be able to filter out test recordings if we want?
    // Test recordings should not contribute to visits.
    // We shouldn't do ML on test recordings?
    console.log("Record result", recording);

    cy.log("Do test");
  });
  // Create a group
  // Create a user
  // Add a device
  // Upload a recording of test length: Check latest recording time
});
