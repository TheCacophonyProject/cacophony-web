import { EventDescription } from "@typedefs/api/event";
import { RecordingType } from "@typedefs/api/consts";
import { DeviceId, LatLng, ProjectId, RecordingId, UserId } from "@shared/api/common";
import {
  uploadAudioRecordingFromDevice,
  uploadThermalRecordingFromDevice,
} from "./recording-uploads";
import { JwtToken, TestDeviceHandle } from "@shared/client/types";
import { TestApiImpl } from "@shared/client";
import { expect } from "@playwright/test";
import {
  EventStoredInSidekick,
  RecordingStoredInSidekick,
  SidekickSim,
} from "@/helpers/sidekick-sim";
import { getDeviceTestName } from "@/helpers/create-test-entities";
import { test } from "@/helpers/upload-tests";
import { addSeconds } from "./date-helpers";
import { ApiDeviceHistorySettings, DeviceAction } from "@shared/api/device";

export interface EventStoredOnDevice {
  event: EventDescription;
  atTime: Date;
  deviceId: DeviceId;
}

export interface RecordingStoredOnDevice {
  type: RecordingType;
  file: ArrayBuffer;
  recordingDateTime: Date;
  location: LatLng;
}

export class DeviceSim {
  // Represents an offline device that can start a hotspot to sync with sidekick.
  // Queue up recordings and events to be later retrieved by sidekick
  // Maybe this device can also go online - when not connected to sidekick via hotspot - and
  // also offload events and recordings.
  private deviceHandle: TestDeviceHandle;
  private isOffline: boolean = false;
  private readonly hasModem: boolean = false;
  private connectedSidekickSim: SidekickSim | null = null;
  private events: EventStoredOnDevice[] = [];
  private recordings: RecordingStoredOnDevice[] = [];
  private location?: LatLng;
  private settings?: ApiDeviceHistorySettings = {};

  constructor(deviceHandle: TestDeviceHandle, withModem = true) {
    this.deviceHandle = deviceHandle;
    this.isOffline = !withModem;
    this.hasModem = withModem;
  }

  public addEvent(event: EventDescription, atTime: Date): void {
    this.events.push({ event, atTime, deviceId: this.deviceHandle.id });
  }

  public async makeThermalRecording(
    file: ArrayBuffer,
    recordingDateTime: Date,
  ): Promise<void> {
    if (!this.location) {
      throw new Error("Can't make a recording with no location set on device");
    }
    this.recordings.push({
      type: RecordingType.ThermalRaw,
      file,
      recordingDateTime,
      location: { ...this.location },
    });
    if (!this.isOffline) {
      // Upload the recording immediately if online
      await this.uploadRecordings(addSeconds(recordingDateTime, 15));
      // Because we're starting the modem, opportunistically upload events
      await this.uploadEvents(addSeconds(recordingDateTime, 16));
    }
  }
  public async makeAudioRecording(
    file: ArrayBuffer,
    recordingDateTime: Date,
  ): Promise<void> {
    if (!this.location) {
      throw new Error("Can't make a recording with no location set on device");
    }
    this.recordings.push({
      type: RecordingType.Audio,
      file,
      recordingDateTime,
      location: { ...this.location },
    });
    if (!this.isOffline) {
      // Upload the recording immediately if online
      await this.uploadRecordings(addSeconds(recordingDateTime, 15));
      // Because we're starting the modem, opportunistically upload events
      await this.uploadEvents(addSeconds(recordingDateTime, 16));
    }
  }

  public async syncSettings() {
    const settings = await TestApiImpl.Devices.withAuth(
      this.deviceHandle.testId,
    ).updateDeviceSettings(this.deviceHandle.id, this.settings);
    if (settings.success && settings.result.settings) {
      this.settings = settings.result.settings;
      return this.settings;
    }
    return null;
  }

  public async trapActivation(
    eventUUID: string,
    classification: string,
    atTime: Date,
    thumbnail?: ArrayBuffer,
  ): Promise<void> {
    // TODO: Device tells API that it caught something!
    // Thumbnail can be added to the event later as a separate request, using the same UUID to patch it.
    await TestApiImpl.Devices.createDeviceActionRequest(this.deviceHandle.id, eventUUID, atTime, classification);
  }

  public updateLocation(location: LatLng, atTime: Date): void {
    this.location = { ...location };
    this.addEvent(
      {
        type: "config",
        details: JSON.stringify({
          device: {
            // TODO: We should make sure this config event belongs to the device we're updating!
            //  Test renaming a device that has stuff on it
            id: this.deviceHandle.id,
            updated: atTime.toISOString(),
          },
          location: {
            updated: atTime.toISOString(),
            accuracy: 22.5,
            altitude: 47,
            latitude: location.lat,
            longitude: location.lng,
            timestamp: atTime.toISOString(),
            // TODO: We should really surface accuracy in the API!
          },
        }),
      },
      new Date(atTime),
    );
  }

  public async uploadRecordings(
    atTime: Date = new Date(),
  ): Promise<(RecordingId | null)[]> {
    if (this.recordings.length !== 0) {
      return await test.step("Upload recordings from device", async () => {
        const ids: RecordingId[] = [];
        while (this.recordings.length > 0) {
          const recording = this.recordings.shift() as RecordingStoredOnDevice;
          // Offload sequentially
          if (recording.type === RecordingType.Audio) {
            const recordingId = await uploadAudioRecordingFromDevice({
              file: recording.file,
              location: recording.location,
              deviceHandle: this.deviceHandle,
              recordingDateTime: recording.recordingDateTime,
              uploadTime: atTime,
            });
            ids.push(recordingId);
          } else if (recording.type === RecordingType.ThermalRaw) {
            const recordingId = await uploadThermalRecordingFromDevice({
              file: recording.file,
              location: recording.location,
              deviceHandle: this.deviceHandle,
              recordingDateTime: recording.recordingDateTime,
              uploadTime: atTime,
            });
            ids.push(recordingId);
          }
        }
        return ids;
      });
    }
    return [];
  }

  public async uploadEvents(atTime?: Date) {
    if (this.events.length !== 0) {
      await test.step("Upload events from device", async () => {
        const eventsByPayload = new Map<string, EventStoredOnDevice[]>();
        for (const event of this.events) {
          const canonicalPayload = JSON.stringify(
            JSON.parse(JSON.stringify(event.event)),
          );
          if (!eventsByPayload.has(canonicalPayload)) {
            eventsByPayload.set(canonicalPayload, []);
          }
          eventsByPayload.get(canonicalPayload)!.push(event);
        }
        while (this.events.length > 0) {
          this.events.shift();
        }
        // Batch upload events with the same payload.
        for (const [type, events] of eventsByPayload) {
          const dateTimes = events.map((e) => e.atTime.toISOString());
          const response = await TestApiImpl.Devices.withAuth(
            this.deviceHandle.testId,
          ).submitEventsFromDevice(
            {
              dateTimes: dateTimes,
              description: events[0].event,
            },
            atTime,
          );
          expect(response.success).toBe(true);
        }
      });
    }
  }

  public offloadEventsToSidekick(): EventStoredInSidekick[] {
    // NOTE: Offloading events to Sidekick doesn't delete them from the device, and they will upload to the
    // API when possible.
    return this.events.map((event) => ({
      ...event,
      deviceId: this.deviceHandle.id,
    })) as EventStoredInSidekick[];
  }

  public offloadRecordingsToSidekick(
    latestOnly = false,
  ): RecordingStoredInSidekick[] {
    if (latestOnly) {
      throw new Error("Offload latest not implemented in sidekick currently");
      if (this.recordings.length === 0) {
        return [];
      }
      return [
        {
          ...this.recordings[this.recordings.length - 1],
          deviceId: this.deviceHandle.id,
        },
      ];
    }
    return this.recordings.map((recording) => ({
      ...recording,
      deviceId: this.deviceHandle.id,
    }));
  }

  public connectWithSidekick(sidekick: SidekickSim) {
    this.connectedSidekickSim = sidekick;

    // NOTE: Apparently the device internet connection *is* available when hosting a hotspot for sidekick;
    //  it's just not available to the connected phone.
  }

  public disconnectFromSidekick() {
    if (!this.connectedSidekickSim) {
      throw new Error(
        "Can't disconnect from sidekick, not connected in the first place",
      );
    }
    this.connectedSidekickSim = null;
    this.isOffline = !this.hasModem;
  }

  public async syncWithApi(atTime?: Date) {
    if (this.isOffline) {
      throw new Error("No internet connection available, can't sync with API");
    }

    // Uploading recordings is likely to happen first
    await this.uploadRecordings(atTime);
    // Event uploads happen opportunistically when there is a modem connection, or every 30 mins?
    await this.uploadEvents(atTime);
  }

  public getId(): DeviceId {
    return this.deviceHandle.id;
  }

  public connectToWifi() {
    if (this.connectedSidekickSim) {
      throw new Error("Can't connect to wifi while connected to sidekick");
    }
    this.isOffline = false;
  }

  public disconnectFromWifi() {
    this.isOffline = !this.hasModem;
  }

  public async reRegisterInProject(
    userAuthToken: JwtToken<UserId>,
    projectNameOrId: string | ProjectId,
    fromDateTime?: Date,
    newDeviceName?: string,
    newDevicePassword: string = "password",
  ): Promise<TestDeviceHandle> {
    return await test.step(`Re-register device ${newDeviceName} into project ${projectNameOrId}`, async () => {
      const deviceCredsResponse = await TestApiImpl.Devices.withAuth(
        this.deviceHandle.testId,
      ).reRegisterDeviceWithAdminAuthorization(
        userAuthToken,
        projectNameOrId,
        fromDateTime,
        newDeviceName,
        newDevicePassword,
      );

      expect(deviceCredsResponse.success, "create device").toBe(true);
      if (deviceCredsResponse.success) {
        const newDeviceHandle =
          (newDeviceName && getDeviceTestName(newDeviceName)) ||
          getDeviceTestName("ReRegistered");
        TestApiImpl.registerCredentials(
          newDeviceHandle,
          deviceCredsResponse.result,
        );
        const deviceId = deviceCredsResponse.result.id;
        this.deviceHandle = {
          id: deviceId,
          testId: newDeviceHandle,
          type: "device",
        };
        return this.deviceHandle;
      }
      throw new Error(`Failed to re-register device with ${projectNameOrId}`);
    });
  }
}
