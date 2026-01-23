// When we upload a recording, lastest thermal recording time etc should be adjusted.
// If we delete a recording, it should also be adjusted.
// If it's the last recording in a location, we should delete the location.
import {TestDeviceHandle, TestEntityHandle, TestProjectHandle, TestUserHandle} from "@shared/client/types";
import {LatLng, RecordingId} from "@typedefs/api/common";
import {RecordingType} from "@shared/api/consts";
import {TestApi} from "@shared/client";
import {ApiRecordingResponse, ApiRecordingUploadData, ApiThermalRecordingResponse} from "@typedefs/api/recording";
import {ApiGroupResponse as ApiProjectResponse} from "@typedefs/api/group";
import {ApiStationResponse as ApiLocationResponse} from "@shared/api/station";
import {ApiDeviceResponse} from "@shared/api/device";
// Probably create this once for tests and re-export?

// TODO: We need to init the credentials resolver per "session".

// TODO: Need to work out the ergonomics of calling the same API with different user handles in sequence.
// I guess we just need to have a different resolver per credential?
interface ProjectBundle {
  userHandles: TestUserHandle[],
  projectHandle: TestProjectHandle,
  deviceHandles: TestDeviceHandle[],
  locationBase: LatLng,
  testFixtures: Record<string, ArrayBuffer>,
  getAdmin: () => TestUserHandle,
  getOwner: () => TestUserHandle,
  getNonAdmin: () => TestUserHandle | null,
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

const getTestFixture = async (fileName: string): Promise<ArrayBuffer> => {
  return new Promise((resolve) => {
      cy.fixture(fileName, "binary").then(async (fileBinary: string) => {
        // File in binary format gets converted to blob so it can be sent as Form data
        const blob = Cypress.Blob.binaryStringToBlob(fileBinary);
        const arrayBuffer = await blob.arrayBuffer();
        resolve(arrayBuffer);
      });
  });
};

const uploadRecording = async (uploaderHandle: TestEntityHandle, recordingOptions: { project: ProjectBundle; location?: LatLng; deviceHandle?: TestDeviceHandle, recordingType?: "test" | "startup" | "shutdown", type: RecordingType, recordingDateTime: Date }): Promise<RecordingId | null> => {
  expect(["user", "device"], "uploader must be device or user").to.include(uploaderHandle.type);
  const deviceId = uploaderHandle.id;
  const rawFile = recordingOptions.project.testFixtures["oneframe.cptv"];
  const rawFileName = `filename.${extForUploadFileType(recordingOptions.type)}`;
  // TODO: Maybe we could fuzz a location based on locationBase if there's no supplied location
  const location = recordingOptions.location ?? recordingOptions.project.locationBase;
  let upload;
  const data: ApiRecordingUploadData = {
    location,
    type: recordingOptions.type,
    recordingDateTime: recordingOptions.recordingDateTime,
  };
  if (recordingOptions && recordingOptions.recordingType) {
    data.status = recordingOptions.recordingType;
    data.duration = 2;
  }
  if (uploaderHandle.type === "device") {
    upload = TestApi.Recordings.withAuth(uploaderHandle.testId).uploadRecordingFromDevice(data, rawFile, rawFileName);
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

const uploadRecordingFromDeviceForProject = async (options: { project: ProjectBundle; location?: LatLng; deviceHandle?: TestDeviceHandle, recordingType?: "test" | "startup" | "shutdown", type: RecordingType, recordingDateTime: Date }): Promise<RecordingId | null> => {
  // Use the first device in the project bundle, or the specified device.
  const deviceToUploadFrom: TestDeviceHandle = options.deviceHandle || options.project.deviceHandles[0];
  return uploadRecording(deviceToUploadFrom, options);
};

const uploadThermalRecordingFromDeviceForProject = async (options: { project: ProjectBundle; location?: LatLng; deviceHandle?: TestDeviceHandle, recordingDateTime: Date }): Promise<RecordingId> => {
  return uploadRecordingFromDeviceForProject({...options, type: RecordingType.ThermalRaw });
};

const uploadThermalTestRecordingFromDeviceForProject = async (options: { project: ProjectBundle; location?: LatLng; deviceHandle?: TestDeviceHandle, recordingDateTime: Date }): Promise<RecordingId> => {
  return uploadRecordingFromDeviceForProject({...options, type: RecordingType.ThermalRaw, recordingType: "test" });
};

const uploadThermalStartupRecordingFromDeviceForProject = async (options: { project: ProjectBundle; location?: LatLng; deviceHandle?: TestDeviceHandle, recordingDateTime: Date }): Promise<RecordingId> => {
  return uploadRecordingFromDeviceForProject({...options, type: RecordingType.ThermalRaw, recordingType: "startup" });
};

const uploadThermalShutdownRecordingFromDeviceForProject = async (options: { project: ProjectBundle; location?: LatLng; deviceHandle?: TestDeviceHandle, recordingDateTime: Date }): Promise<RecordingId> => {
  return uploadRecordingFromDeviceForProject({...options, type: RecordingType.ThermalRaw, recordingType: "shutdown" });
};

const uploadAudioRecordingFromDeviceForProject = async (options: { project: ProjectBundle; location?: LatLng; deviceHandle?: TestDeviceHandle, isTestRecording?: true, recordingDateTime: Date }): Promise<RecordingId> => {
  return uploadRecordingFromDeviceForProject({...options, type: RecordingType.Audio });
};

const uploadAudioTestRecordingFromDeviceForProject = async (options: { project: ProjectBundle; location?: LatLng; deviceHandle?: TestDeviceHandle, recordingDateTime: Date }): Promise<RecordingId> => {
  return uploadRecordingFromDeviceForProject({...options, type: RecordingType.Audio, recordingType: "test" });
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
  const testFixtures = await getTestFixtures(["oneframe.cptv", "invalid.cptv", "small.cptv", "bird_1.cptv", ...(options?.testFixtures ?? [])]);
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
    getAdmin: (): TestUserHandle => {
      return userHandle;
    },
    getOwner: (): TestUserHandle => {
      return userHandle;
    },
    getNonAdmin: (): TestUserHandle | null => {
      // There may not be non-admin users.
      return null;
    },
  };
};

const getTestFixtures = async (fixtures: string[]): Promise<Record<string, ArrayBuffer>> => {
  const loadedFixtures = {};
  for (const fixture of fixtures) {
    loadedFixtures[fixture] = await getTestFixture(fixture);
  }
  return loadedFixtures;
};

const addDays = (startDate: Date, days: number) => {
  const result = new Date(startDate);
  result.setDate(result.getDate() + days);
  return result;
};

const spreadDays = (startDate: Date, days: number): Date[] => {
  if (addDays(startDate, days).getTime() > new Date().getTime()) {
    // NOTE: We don't allow recordings with far future dates, so we always need to make sure our startDate
    //  for generating these test dates is sufficiently far in the past.
    throw new Error(`Cannot generate dates in the future: ${startDate.toISOString()} + ${days} days`);
  }
  const dates = [];
  for (let i = 0; i < days; i++) {
    dates.push(addDays(startDate, i));
  }
  return dates;
};

const checkActivity = async (projectBundle: ProjectBundle, requestTime: Date, uploader: "device" | "user", recording: ApiRecordingResponse): Promise<[ApiProjectResponse, ApiDeviceResponse, ApiLocationResponse]> => {
  // Check that there is expected activity in project.
  const [project, device, location] = await Promise.all([
    TestApi.Projects.withAuth(projectBundle.getAdmin().testId).getProjectById(projectBundle.projectHandle.id),
    TestApi.Devices.withAuth(projectBundle.getAdmin().testId).getDeviceById(recording.deviceId),
    TestApi.Locations.withAuth(projectBundle.getAdmin().testId).getLocationById(recording.stationId),
  ]) as [ApiProjectResponse, ApiDeviceResponse, ApiLocationResponse];

  expect(project, "project exists").to.not.be.false;
  expect(device, "device exists").to.not.be.false;
  expect(location, "location exists").to.not.be.false;

  // Project activity checks
  if (recording.type === RecordingType.ThermalRaw) {
    expect(Object.keys(project)).to.include("lastThermalRecordingTime");
    expect(project.lastThermalRecordingTime, "project last thermal recording time").to.equal(recording.recordingDateTime);
  } else if (recording.type === RecordingType.Audio) {
    expect(Object.keys(project)).to.include("lastAudioRecordingTime");
    expect(project.lastAudioRecordingTime, "project last audio recording time").to.equal(recording.recordingDateTime);
  }

  // Device activity checks
  expect(device.lastRecordingTime, "device last recording time").to.equal(recording.recordingDateTime);
  if (uploader === "device") {
    expect(new Date(device.lastConnectionTime), "device last connection time > request time").to.be.greaterThan(requestTime);
    expect(new Date(device.lastConnectionTime), "device last connection time < now").to.be.lessThan(new Date());
  }

  // Location activity checks
  if (recording.type === RecordingType.ThermalRaw) {
    expect(location.lastThermalRecordingTime, "location last thermal recording time").to.equal(recording.recordingDateTime);
  } else if (recording.type === RecordingType.Audio) {
    expect(location.lastAudioRecordingTime, "location last audio recording time").to.equal(recording.recordingDateTime);
  }
  if (uploader === "device") {
    if (recording.type === RecordingType.ThermalRaw) {
      expect(new Date(location.lastActiveThermalTime), "location last active thermal time > request time").to.be.greaterThan(requestTime);
      expect(new Date(location.lastActiveThermalTime), "location last active thermal time < now").to.be.lessThan(new Date());
    } else if (recording.type === RecordingType.Audio) {
      expect(new Date(location.lastActiveAudioTime), "location last active audio time > request time").to.be.greaterThan(requestTime);
      expect(new Date(location.lastActiveAudioTime), "location last active audio time < now").to.be.lessThan(new Date());
    }
  }
  return [project, device, location];
};

describe("Activity bookkeeping", () => {
  before(async () => {

  });

  // TODO: Create some tc2-fixtures for test recording, startup recording, shutdown recording.

  it("Device is able to upload a test recording, and have it marked as such", async () => {
    // Upload a test recording, and then check that the returned recording metadata has it marked as test.
    const project = await createProjectWithUserAndDevice();
    const requestTime = new Date();
    const recordingId = await uploadThermalTestRecordingFromDeviceForProject({
      project,
      recordingDateTime: new Date(),
    });
    const uploadedRecording = await TestApi.Recordings.withAuth(project.getAdmin().testId).getRecordingById(recordingId) as ApiThermalRecordingResponse;
    expect(uploadedRecording.additionalMetadata.status, "recording is a test recording").to.equal("test");

    await checkActivity(project, requestTime, "device", uploadedRecording);
  });

  it("Device is able to upload a startup recording, and have it marked as such", async () => {
    // Upload a test recording, and then check that the returned recording metadata has it marked as test.
    const project = await createProjectWithUserAndDevice();
    const requestTime = new Date();
    const recordingId = await uploadThermalStartupRecordingFromDeviceForProject({
      project,
      recordingDateTime: new Date(),
    });
    const uploadedRecording = await TestApi.Recordings.withAuth(project.getAdmin().testId).getRecordingById(recordingId) as ApiThermalRecordingResponse;
    expect(uploadedRecording.additionalMetadata.status).to.equal("startup");

    await checkActivity(project, requestTime, "device", uploadedRecording);
  });

  it("Device is able to upload a shutdown recording, and have it marked as such", async () => {
    // Upload a test recording, and then check that the returned recording metadata has it marked as test.
    const project = await createProjectWithUserAndDevice();
    const requestTime = new Date();
    const recordingId = await uploadThermalShutdownRecordingFromDeviceForProject({
      project,
      recordingDateTime: new Date(),
    });
    const uploadedRecording = await TestApi.Recordings.withAuth(project.getAdmin().testId).getRecordingById(recordingId) as ApiThermalRecordingResponse;
    expect(uploadedRecording.additionalMetadata.status).to.equal("shutdown");

    await checkActivity(project, requestTime, "device", uploadedRecording);
  });

  it("Can upload multiple recordings from device with same location, and with dates after the project creation date, ensuring correct book-keeping", async () => {
    const project = await createProjectWithUserAndDevice();
    const startDate = new Date("2026-01-10T20:07:06.292Z");
    const dates = spreadDays(startDate, 3);
    const recordingUploads = [];
    const requestTime = new Date();
    for (const date of dates) {
      recordingUploads.push(
        uploadThermalRecordingFromDeviceForProject({
          project,
          location: testLocation(-42, 170, 0),
          recordingDateTime: date,
        }),
      );
    }
    // NOTE: Recording Ids that come back may not be in ascending sequence.  However, the last recordingId should correspond to the latest date.
    const recordingIds = await Promise.all(recordingUploads);
    const uploadedRecording = await TestApi.Recordings.withAuth(project.getAdmin().testId).getRecordingById(recordingIds[recordingIds.length - 1]) as ApiThermalRecordingResponse;
    expect(uploadedRecording.recordingDateTime, "recording date is latest").to.be.equal(dates[dates.length - 1].toISOString());
    await checkActivity(project, requestTime, "device", uploadedRecording);

    const allRecordings = await Promise.all(recordingIds.map(recordingId => TestApi.Recordings.withAuth(project.getAdmin().testId).getRecordingById(recordingId) as unknown as ApiThermalRecordingResponse));
    const expectedLocationIds = recordingIds.map(_ => uploadedRecording.stationId);
    const expectedLocations = recordingIds.map(_ => uploadedRecording.location);
    expect(allRecordings.map(r => r.location), "recording locations match").to.deep.equal(expectedLocations);
    expect(allRecordings.map(r => r.stationId), "recording stations match").to.deep.equal(expectedLocationIds);


  });

  it("Ensure there are no race conditions for device kind when uploading multiple different recording types in quick succession", async () => {
    const project = await createProjectWithUserAndDevice();
    const startDate = new Date("2026-01-10T20:07:06.292Z");
    const dates = spreadDays(startDate, 3);
    const requestTime = new Date();
    const recordingUploads = dates.map((date) => {
      return uploadThermalRecordingFromDeviceForProject({
        project,
        recordingDateTime: date,
      });
    });
    const recordingIds = await Promise.all(recordingUploads);
    const uploadedRecording = await TestApi.Recordings.withAuth(project.getAdmin().testId).getRecordingById(recordingIds[recordingIds.length - 1]) as ApiThermalRecordingResponse;
    await checkActivity(project, requestTime, "device", uploadedRecording);
    // TODO: When doing this on behalf of device vs with device, make sure lastConnectionTime does the right thing
    // TODO: Also sanity check uploading events both as device and on behalf.
    // TODO: Streamline deviceType checks, now that we know that all new devices are hybrid devices.
  });

  it("Ensure that location book-keeping is updated correctly when uploading recordings", () => {

  });

  it("Ensure that only one DeviceHistory entry is made when a series of recordings in the same location are uploaded for a device", () => {

  });

  it("Uploading a recording on behalf of a device with a later time than the lastConnectionTime should null out lastConnectionTime, implying that the device is not 'offline'", () => {

  });


  // TODO: DeviceHistory sanity checking

  // Create a group
  // Create a user
  // Add a device
  // Upload a recording of test length: Check latest recording time
});
