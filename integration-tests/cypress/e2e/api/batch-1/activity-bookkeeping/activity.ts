// When we upload a recording, lastest thermal recording time etc should be adjusted.
// If we delete a recording, it should also be adjusted.
// If it's the last recording in a location, we should delete the location.
import { DeviceType, RecordingType } from "@shared/api/consts";
import {
  ApiRecordingResponse,
  ApiThermalRecordingResponse,
} from "@typedefs/api/recording";
import { ApiGroupResponse as ApiProjectResponse } from "@typedefs/api/group";
import { ApiStationResponse as ApiLocationResponse } from "@shared/api/station";
import { ApiDeviceHistory, ApiDeviceResponse } from "@shared/api/device";
import { createProjectWithUserAndDevice } from "@/helpers/create-test-entities";
import {
  uploadAudioRecordingFromDeviceForProject,
  uploadThermalRecordingFromDeviceForProject,
} from "@/helpers/recording-uploads";
import { spreadDays } from "@/helpers/date-helpers";
import { spreadLocations, testLocation } from "@/helpers/location-helpers";
import { checkActivity } from "@/helpers/activity-book-keeping-checks";

const arrayZip = <A, B>(a: A[], b: B[]) =>
  a.map((k, i) => ({ left: k, right: b[i] }));

describe("Activity bookkeeping", () => {
  // TODO: Create some tc2-fixtures for test recording.

  // The purpose of this book-keeping is to narrow the search range for recording activity search in browse.
  // To help search scope stay small, and to make search faster, keep track of the earliest and latest
  // times for recordings of each type (thermal video, audio), for each Location, Device, and Project.

  // At the `Project` level, it's possible to derive the earliest time by looking at the earliest `fromDateTime` in
  // the `DeviceHistory` table for any device in the project.  This doesn't tell you the media type at that time, so
  // it may be necessary to handle this differently, either with book-keeping on the Project entry itself,
  // or by querying the `Recordings` table for the earliest recording of each type.

  // At the `Location` level, it's possible to derive the earliest time by looking at the `activeAt` field, but
  // this may not be accurate if the location was manually created (does this actually ever happen?).
  // It also doesn't tell us what the media type was for that earliest time, and again, we'd have to
  // query the `Recordings` table.

  // At the `Device` level, we can get the earliest recording time by looking at the `DeviceHistory` table, and
  // checking for the earliest `fromDateTime` where the `setBy` field is 'automatic'.  But again, this doesn't
  // tell us the media type, so we'd have to query the `Recordings` table for that information.

  // It might be better to have symmetry of the `lastThermalRecordingTime` and `lastAudioRecordingTime` with new
  // `earliestThermalRecordingTime` and `earliestAudioRecordingTime` fields on `Project`, `Device` and `Location`.
  // The reason for the current asymmetry is that a lot of this code predates the existence of a hybrid audio/thermal
  // device, so we were sure that each device was either a thermal camera or a standalone bird-monitor.

  // Then, the main purpose of the `DeviceHistory` table is to determine what `Project` a (physical) device
  // belonged to at a given time, and what `Location` it had at a given time.  Also to track changes over time
  // for `Device` settings.

  it(
    `Can upload multiple recordings from device with same location, 
  and with dates after the project creation date, ensuring correct book-keeping`,
    { retries: 3 },
    async () => {
      const project = await createProjectWithUserAndDevice();
      const AdminUser = project.api();
      const startDate = new Date("2026-01-10T20:07:06.292Z");
      const dates = spreadDays(startDate, 3);
      const recordingUploads = [];
      for (const date of dates) {
        recordingUploads.push(
          uploadThermalRecordingFromDeviceForProject({
            project,
            location: testLocation(-42, 170, 0),
            recordingDateTime: date,
          }),
        );
      }
      // NOTE: Recording Ids that come back may not be in ascending sequence.
      //  However, the last recordingId should correspond to the latest date.
      const recordingIds = await Promise.all(recordingUploads);
      const uploadedRecording = (await AdminUser.Recordings.getRecordingById(
        recordingIds[recordingIds.length - 1],
      )) as ApiThermalRecordingResponse;
      expect(
        uploadedRecording.recordingDateTime,
        "recording date is latest",
      ).to.be.equal(dates[dates.length - 1].toISOString());
      const requestTime = new Date();
      await checkActivity(project, requestTime, "device", uploadedRecording);

      const uploadedRecordings = await Promise.all(
        recordingIds.map(
          (recordingId) =>
            AdminUser.Recordings.getRecordingById(
              recordingId,
            ) as unknown as ApiThermalRecordingResponse,
        ),
      );
      const expectedLocationIds = recordingIds.map(
        (_) => uploadedRecording.stationId,
      );
      const expectedLocations = recordingIds.map(
        (_) => uploadedRecording.location,
      );
      expect(
        uploadedRecordings.map((r) => r.location),
        "recording locations match",
      ).to.deep.equal(expectedLocations);
      expect(
        uploadedRecordings.map((r) => r.stationId),
        "recording stations match",
      ).to.deep.equal(expectedLocationIds);
    },
  );

  it.skip(
    `Can upload multiple huge recordings from device with same location, 
  and with dates after the project creation date, ensuring correct book-keeping`,
    { retries: 3 },
    async () => {
      const project = await createProjectWithUserAndDevice();
      const AdminUser = project.api();
      const startDate = new Date("2026-01-10T20:07:06.292Z");
      const dates = spreadDays(startDate, 30);
      const recordingUploads = [];
      const requestTime = new Date();
      for (const date of dates) {
        recordingUploads.push(
          uploadThermalRecordingFromDeviceForProject({
            project,
            recordingType: "huge-file",
            location: testLocation(-42, 170, 0),
            recordingDateTime: date,
          }),
        );
      }
      // NOTE: Recording Ids that come back may not be in ascending sequence.
      //  However, the last recordingId should correspond to the latest date.
      const recordingIds = await Promise.all(recordingUploads);
      const uploadedRecording = (await AdminUser.Recordings.getRecordingById(
        recordingIds[recordingIds.length - 1],
      )) as ApiThermalRecordingResponse;
      expect(
        uploadedRecording.recordingDateTime,
        "recording date is latest",
      ).to.be.equal(dates[dates.length - 1].toISOString());
      await checkActivity(project, requestTime, "device", uploadedRecording);

      const uploadedRecordings = await Promise.all(
        recordingIds.map(
          (recordingId) =>
            AdminUser.Recordings.getRecordingById(
              recordingId,
            ) as unknown as ApiThermalRecordingResponse,
        ),
      );
      const expectedLocationIds = recordingIds.map(
        (_) => uploadedRecording.stationId,
      );
      const expectedLocations = recordingIds.map(
        (_) => uploadedRecording.location,
      );
      expect(
        uploadedRecordings.map((r) => r.location),
        "recording locations match",
      ).to.deep.equal(expectedLocations);
      expect(
        uploadedRecordings.map((r) => r.stationId),
        "recording stations match",
      ).to.deep.equal(expectedLocationIds);
    },
  );

  it(
    `Ensure there are no race conditions for device kind when 
  uploading multiple different recording types in quick succession`,
    { retries: 3 },
    async () => {
      const project = await createProjectWithUserAndDevice();
      const AdminUser = project.api();
      const startDate = new Date("2026-01-10T20:07:06.292Z");
      const dates = spreadDays(startDate, 3);
      const recordingTypes = [
        RecordingType.ThermalRaw,
        RecordingType.Audio,
        RecordingType.ThermalRaw,
      ];
      const requestTime = new Date();
      const recordingUploads = arrayZip(dates, recordingTypes).map(
        ({ left: date, right: recordingType }) => {
          if (recordingType === RecordingType.Audio) {
            return uploadAudioRecordingFromDeviceForProject({
              project,
              recordingDateTime: date,
            });
          } else {
            return uploadThermalRecordingFromDeviceForProject({
              project,
              recordingDateTime: date,
            });
          }
        },
      );
      const recordingIds = await Promise.all(recordingUploads);
      const uploadedRecordings = (await Promise.all(
        recordingIds.map((id) => AdminUser.Recordings.getRecordingById(id)),
      )) as ApiRecordingResponse[];
      expect(
        uploadedRecordings.map((recording) => recording.type),
        "uploaded recording types are correct",
      ).to.deep.equal(recordingTypes);
      const [_project, device, _location] = await checkActivity(
        project,
        requestTime,
        "device",
        uploadedRecordings[uploadedRecordings.length - 1],
      );
      expect(device.type, "device type was updated correctly").to.equal(
        DeviceType.Hybrid,
      );
      expect(
        device.location,
        "device location was updated correctly",
      ).to.deep.equal(uploadedRecordings[0].location);
      // TODO: Also sanity check uploading events both as device and on behalf.
    },
  );

  it(
    "Ensure that location book-keeping is updated correctly when uploading recordings",
    { retries: 3 },
    async () => {
      // Upload a bunch of recordings from the same device with different locations.
      // Make sure the device location is always updated to the location of the most recent recording.
      const project = await createProjectWithUserAndDevice();
      const AdminUser = project.api();
      const startDate = new Date("2026-01-10T20:07:06.292Z");
      const dates = spreadDays(startDate, 3);
      const locations = spreadLocations({ lat: -42.0, lng: 172 }, 3);
      const recordingUploads = arrayZip(dates, locations).map(
        ({ left: date, right: location }) => {
          return uploadThermalRecordingFromDeviceForProject({
            project,
            location,
            recordingDateTime: date,
          });
        },
      );
      const recordingIds = await Promise.all(recordingUploads);
      const uploadedRecordings = (await Promise.all(
        recordingIds.map((id) => AdminUser.Recordings.getRecordingById(id)),
      )) as ApiRecordingResponse[];
      expect(
        uploadedRecordings.map((recording) => recording.location),
        "uploaded recording locations are correct",
      ).to.deep.equal(locations);
      const requestTime = new Date();
      const [_project, device, location] = await checkActivity(
        project,
        requestTime,
        "device",
        uploadedRecordings[uploadedRecordings.length - 1],
      );
      expect(
        device.location,
        "device location was updated correctly",
      ).to.deep.equal(
        uploadedRecordings[uploadedRecordings.length - 1].location,
      );
      expect(
        device.location,
        "device location matches latest station",
      ).to.deep.equal(location.location);
    },
  );

  it(
    `Ensure that only one DeviceHistory entry is made when 
  a series of recordings in the same location are uploaded for a device`,
    { retries: 3 },
    async () => {
      const project = await createProjectWithUserAndDevice();
      const AdminUser = project.api();
      const startDate = new Date("2026-01-10T20:07:06.292Z");
      const dates = spreadDays(startDate, 3);
      const recordingUploads = dates.map((date) =>
        uploadThermalRecordingFromDeviceForProject({
          project,
          recordingDateTime: date,
        }),
      );
      const _recordingIds = await Promise.all(recordingUploads);
      const deviceHistory = await AdminUser.Devices.getDeviceHistoryInTest(
        project.deviceHandles[0].id,
      );
      expect(deviceHistory, "got device history").to.not.equal(false);
      const automaticallySetLocationHistory = (
        deviceHistory as ApiDeviceHistory[]
      ).filter((history) => history.setBy === "automatic");
      expect(
        automaticallySetLocationHistory.length,
        "only one DeviceHistory entry is made",
      ).to.equal(1);
    },
  );

  it(
    `Ensure that multiple device history entries are created for a series of recordings in different
   locations from a given device`,
    { retries: 3 },
    async () => {
      const project = await createProjectWithUserAndDevice();
      const AdminUser = project.api();
      const startDate = new Date("2026-01-10T20:07:06.292Z");
      const dates = spreadDays(startDate, 3);
      const locations = spreadLocations({ lat: -42.0, lng: 172 }, 3);
      const recordingUploads = arrayZip(dates, locations).map(
        ({ left: date, right: location }) => {
          return uploadThermalRecordingFromDeviceForProject({
            project,
            location,
            recordingDateTime: date,
          });
        },
      );
      const _recordingIds = await Promise.all(recordingUploads);
      const deviceHistory = await AdminUser.Devices.getDeviceHistoryInTest(
        project.deviceHandles[0].id,
      );
      expect(deviceHistory, "got device history").to.not.equal(false);
      const automaticallySetLocationHistory = (
        deviceHistory as ApiDeviceHistory[]
      ).filter((history) => history.setBy === "automatic");
      expect(
        automaticallySetLocationHistory.length,
        "three DeviceHistory entries are made",
      ).to.equal(3);
    },
  );

  it(`Uploading a recording on behalf of a device with a later time than the lastConnectionTime should null out 
  lastConnectionTime, implying that the device is not unpowered, but instead is expected to be 'offline'`, async () => {
    // TODO: When doing this on behalf of device vs with device, make sure lastConnectionTime does the right thing
    //  (which is it get's nulled out if uploads are later than the latest recording time?)
    return;
  });

  it(
    `Deleting a set of recordings for a device should adjust the last***RecordingTimes accordingly. 
  Undeleting should restore the original times.`,
    { retries: 3 },
    async () => {
      // FIXME: There's a rare race condition here.

      // Upload a series of five thermal recordings spread over time from the same location, for a new device in a new project.
      // Delete the last two recordings, and expect that the various lastRecordingTime values are adjusted accordingly for
      // the device, the project, and the location.
      const project = await createProjectWithUserAndDevice();
      const AdminUser = project.api();

      // Use a fixed location to ensure we stay on the same Station/Location.
      const fixedLocation = testLocation(-42, 170, 0);

      // Generate 5 recording times far enough in the past to avoid "future" rejects.
      const startDate = new Date("2026-01-10T20:07:06.292Z");
      const dates = spreadDays(startDate, 5);

      const recordingIds = await Promise.all(
        dates.map((recordingDateTime) =>
          uploadThermalRecordingFromDeviceForProject({
            project,
            location: fixedLocation,
            recordingDateTime,
          }),
        ),
      );

      // Last recording should have the latest date.
      const lastUploaded = (await AdminUser.Recordings.getRecordingById(
        recordingIds[recordingIds.length - 1],
      )) as ApiThermalRecordingResponse;

      expect(
        lastUploaded.recordingDateTime,
        "last uploaded recording is latest",
      ).to.equal(dates[4].toISOString());

      // Deleting the last two recordings should roll back "last***RecordingTime" times to the 3rd recording.
      await Promise.all([
        AdminUser.Recordings.deleteRecording(recordingIds[3]),
        AdminUser.Recordings.deleteRecording(recordingIds[4]),
      ]);

      {
        const [updatedProject, updatedDevice, updatedLocation] =
          (await Promise.all([
            AdminUser.Projects.getProjectById(project.projectHandle.id),
            AdminUser.Devices.getDeviceById(project.deviceHandles[0].id),
            AdminUser.Locations.getLocationById(lastUploaded.stationId!),
          ])) as [ApiProjectResponse, ApiDeviceResponse, ApiLocationResponse];

        const expectedLast = dates[2].toISOString();

        expect(
          updatedDevice.lastThermalRecordingTime,
          "device lastRecordingTime rolled back",
        ).to.equal(expectedLast);

        expect(
          updatedProject.lastThermalRecordingTime,
          "project lastThermalRecordingTime rolled back",
        ).to.equal(expectedLast);

        expect(
          updatedLocation.lastThermalRecordingTime,
          "location lastThermalRecordingTime rolled back",
        ).to.equal(expectedLast);
      }

      // NOTE: I don't think that we need to rollback device history when recordings are deleted or undeleted,
      //  so long as we don't remove locations with no recordings left automatically.
      // TODO: We could potentially automatically retire locations with no recordings left, so they don't appear in UI?
      await Promise.all([
        AdminUser.Recordings.undeleteRecording(recordingIds[3]),
        AdminUser.Recordings.undeleteRecording(recordingIds[4]),
      ]);
      {
        const [updatedProject, updatedDevice, updatedLocation] =
          (await Promise.all([
            AdminUser.Projects.getProjectById(project.projectHandle.id),
            AdminUser.Devices.getDeviceById(project.deviceHandles[0].id),
            AdminUser.Locations.getLocationById(lastUploaded.stationId!),
          ])) as [ApiProjectResponse, ApiDeviceResponse, ApiLocationResponse];

        const expectedLast = dates[4].toISOString();

        expect(
          updatedDevice.lastThermalRecordingTime,
          "device lastRecordingTime rolled back",
        ).to.equal(expectedLast);

        expect(
          updatedProject.lastThermalRecordingTime,
          "project lastThermalRecordingTime rolled back",
        ).to.equal(expectedLast);

        expect(
          updatedLocation.lastThermalRecordingTime,
          "location lastThermalRecordingTime rolled back",
        ).to.equal(expectedLast);
      }
    },
  );

  it(`Bulk deleting a set of recordings for a device should adjust the 
  associated recording times, bulk undeleting should restore.`, async () => {
    return;
  });

  it(`Bulk deleting a set of recordings for multiple devices across multiple locations should adjust the 
  associated recording times, bulk undeleting should restore.`, async () => {
    // TODO: Maybe disallow bulk deletion/undeletion of recordings *across* projects as a super-user.
    return;
  });

  // TODO:
  //  When a device gets moved to another project, can it ever retain the same device Id?
  //  If it has been moved, and old recordings get uploaded to its old project after the fact, it should not
  //  automatically "reactivate" the device.
});
