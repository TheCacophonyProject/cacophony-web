// When we upload a recording, lastest thermal recording time etc should be adjusted.
// If we delete a recording, it should also be adjusted.
// If it's the last recording in a location, we should delete the location.
import { TestHandle } from "@shared/client/types";
import { LatLng, RecordingId } from "@typedefs/api/common";
import { RecordingType } from "@shared/api/consts";
import { TestApi } from "@shared/client";
// Probably create this once for tests and re-export?

// TODO: We need to init the credentials resolver per "session".

// TODO: Need to work out the ergonomics of calling the same API with different user handles in sequence.
// I guess we just need to have a different resolver per credential?
interface ProjectBundle {
  userHandles: TestHandle[],
  projectHandle: TestHandle,
  deviceHandles: TestHandle[],
}

const getTestName = (str: string) => `${str}-${Math.floor((Number.MAX_SAFE_INTEGER * Math.random())).toString(36)}`;

const createUser = async (userName: string): Promise<TestHandle> => {
  const userHandle = getTestName(`user-${userName}`);
  const userResponse = await TestApi.Users.register(userHandle, "password", `${userHandle}@api-test.cacophony.org.nz`, 3);
  expect(userResponse.success).to.be.true;
  if (userResponse.success) {
    TestApi.registerCredentials(userHandle, {
      refreshingToken: null,
      refreshToken: userResponse.result.refreshToken,
      apiToken: userResponse.result.token,
    });
    cy.log(`Created user ${userHandle}`);
  }
  return userHandle;
};

const createProject = async (projectName: string, userHandle: TestHandle): Promise<TestHandle> => {
  const projectHandle = getTestName(`project-${projectName}`);
  const projectResponse = await TestApi.Projects.withAuth(userHandle).addNewProject(projectHandle);
  expect(projectResponse.success).to.be.true;
  if (projectResponse.success) {
    const projectId = projectResponse.result.groupId;
    // Do we need some way of keeping track of the project id?
    //projectCredentials.set(projectHandle, projectId);
    cy.log(`Created project ${projectHandle} with id ${projectId}`);
  }
  return projectHandle;
};

const addDeviceToProject = async (projectHandle: TestHandle, deviceName: string): Promise<TestHandle> => {
  const deviceHandle = getTestName(`device-${deviceName}`);
  const deviceResponse = await TestApi.Devices.registerDevice(projectHandle, deviceHandle, "password");
  if (deviceResponse.success) {
    TestApi.registerCredentials(deviceHandle, deviceResponse.result);
    cy.log(`Created device ${deviceHandle}`);
  }
  return deviceHandle;
};

const uploadRecording = async (userHandle: TestHandle, recording: Blob): Promise<TestHandle> => {
  return "";
};

const uploadRecordingFromDeviceForProject = async (options: { project: ProjectBundle; location: LatLng; deviceHandle?: TestHandle, isTestRecording?: boolean, type: RecordingType, recordingDateTime: Date }): Promise<RecordingId> => {
  const deviceToUploadFrom: TestHandle = options.deviceHandle || options.project.deviceHandles[0];
  return 1;
};

const uploadThermalRecordingFromDeviceForProject = async (options: { project: ProjectBundle; location: LatLng; deviceHandle?: TestHandle, recordingDateTime: Date }): Promise<RecordingId> => {
  return uploadRecordingFromDeviceForProject({...options, type: RecordingType.ThermalRaw });
};

const uploadThermalTestRecordingFromDeviceForProject = async (options: { project: ProjectBundle; location: LatLng; deviceHandle?: TestHandle, recordingDateTime: Date }): Promise<RecordingId> => {
  return uploadRecordingFromDeviceForProject({...options, type: RecordingType.ThermalRaw, isTestRecording: true });
};

const uploadAudioRecordingFromDeviceForProject = async (options: { project: ProjectBundle; location: LatLng; deviceHandle?: TestHandle, isTestRecording?: true, recordingDateTime: Date }): Promise<RecordingId> => {
  return uploadRecordingFromDeviceForProject({...options, type: RecordingType.Audio });
};

const uploadAudioTestRecordingFromDeviceForProject = async (options: { project: ProjectBundle; location: LatLng; deviceHandle?: TestHandle, recordingDateTime: Date }): Promise<RecordingId> => {
  return uploadRecordingFromDeviceForProject({...options, type: RecordingType.Audio, isTestRecording: true });
};



const createProjectWithUserAndDevice = async (projectName: string = "Test"): Promise<ProjectBundle> => {
  const userHandle = await createUser(projectName);
  const projectHandle = await createProject(projectName, userHandle);
  const deviceHandle = await addDeviceToProject(projectHandle, projectName);
  return {
    userHandles:  [userHandle],
    projectHandle,
    deviceHandles: [deviceHandle],
  };
};

describe("Activity bookkeeping", () => {
  let project: ProjectBundle;
  before(async () => {
    project = await createProjectWithUserAndDevice();

    //const users = await API.Users.withAuth(project.userHandles[0]).list();
    //cy.log(JSON.stringify(users));
    // Add recording for project at time with duration
    // const recording = await uploadThermalTestRecordingFromDeviceForProject({
    //   project,
    //   location: { lat: 0, lng: 0 }, // TODO: New test location function
    //   recordingDateTime: new Date(),
    // });

    // Now query some things.
  });

  it("Test description", () => {
    cy.log("Do test");
  });
  // Create a group
  // Create a user
  // Add a device
  // Upload a recording of test length: Check latest recording time


  // Hmm, we can just use fetch inside cypress tests, and we could have shared
  // API client definitions.
});
