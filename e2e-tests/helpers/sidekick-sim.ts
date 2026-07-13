import { DeviceId, LatLng, type ProjectId, RecordingId, UserId } from "@shared/api/common";
import { TestApiImpl } from "@typedefs/client";
import { DeviceSim, EventStoredOnDevice, RecordingStoredOnDevice } from "@/helpers/device-sim";
import { expect } from "@playwright/test";
import { uploadRecording } from "@/helpers/recording-uploads";
import { JwtToken, TestUserHandle } from "@shared/client/types";
import { test } from "@/helpers/upload-tests";
import { ApiDeviceResponse } from "@shared/api/device";
import { latLngApproxDistance } from "./location-helpers";

export interface EventStoredInSidekick extends EventStoredOnDevice {
  deviceId: DeviceId;
}

export interface RecordingStoredInSidekick extends RecordingStoredOnDevice {
  deviceId: DeviceId;
}

interface QueuedLocationUpdate {
  location: LatLng;
  atTime: Date;
  name: string;
  deviceId: DeviceId;
}

interface QueuedReferenceImageUpdate {
  location: LatLng;
  photo: ArrayBuffer;
  atTime: Date;
  deviceId: DeviceId;
}

// NOTE: For the purposes of testing, this Sidekick 'simulation' only ever connects to a single device.
export class SidekickSim {
  private readonly userHandle: TestUserHandle;
  private isOffline: boolean = false;
  private isHostingHotspot: boolean = false;
  private connectedDeviceSim: DeviceSim | null = null;
  private locationUpdates: QueuedLocationUpdate[] = [];
  private recordings: RecordingStoredInSidekick[] = [];
  private events: EventStoredInSidekick[] = [];
  private referencePhotoUpdates: QueuedReferenceImageUpdate[] = [];

  constructor(userHandle: TestUserHandle) {
    this.userHandle = userHandle;
  }

  public addLocation(location: LatLng, name: string, atTime: Date) {
    if (!this.connectedDeviceSim) {
      throw new Error("Can't create a location unless connected to a device");
    }
    // Store a location at a given time for later sync
    // Maybe there's only ever one location?
    this.locationUpdates.push({
      location: { ...location },
      atTime,
      name,
      deviceId: this.connectedDeviceSim.getId(),
    });

    // Update the immediate location on the device.
    this.connectedDeviceSim.updateLocation(location, atTime);
  }

  public hostHotspot() {
    this.isHostingHotspot = true;
    this.isOffline = false;
  }
  public disconnectHotspot() {
    this.isHostingHotspot = false;
    this.isOffline = false;
  }

  public addReferencePhoto(deviceReferenceImage: ArrayBuffer, atTime: Date) {
    if (!this.connectedDeviceSim) {
      throw new Error("Can't add a reference image unless connected to a device");
    }
    // Add a reference photo at the current pending location.
    if (this.locationUpdates.length === 0) {
      throw new Error("Can't add a reference photo, without first setting a location");
    }
    this.referencePhotoUpdates.push({
      photo: deviceReferenceImage,
      atTime,
      location: { ...this.locationUpdates[this.locationUpdates.length - 1].location },
      deviceId: this.connectedDeviceSim.getId(),
    });
    //
  }

  public connectToDevice(deviceSim: DeviceSim) {
    deviceSim.connectWithSidekick(this);
    this.connectedDeviceSim = deviceSim;
    this.isOffline = !this.isHostingHotspot;
    // Do we want to get the current device location when we connect?
  }

  public disconnectFromDevice() {
    if (!this.connectedDeviceSim) {
      throw new Error("Can't disconnect from device, not connected in the first place");
    }
    this.connectedDeviceSim.disconnectFromSidekick();
    this.connectedDeviceSim = null;
    this.isOffline = false;
  }

  private async uploadLocationUpdates() {
    if (this.locationUpdates.length !== 0) {
      return await test.step("Upload location updates from sidekick", async () => {
        while (this.locationUpdates.length > 0) {
          const locationUpdate = this.locationUpdates.shift() as QueuedLocationUpdate;
          // Work out which project device is part of
          const deviceForUpdate = (await TestApiImpl.Devices.withAuth(
            this.userHandle.testId,
          ).getDeviceById(locationUpdate.deviceId)) as ApiDeviceResponse;
          expect(deviceForUpdate, "device exists").toBeTruthy();

          const existingLocations = await TestApiImpl.Projects.withAuth(
            this.userHandle.testId,
          ).getLocationsForProject(deviceForUpdate.groupId);

          // Check if any existing location matches to within some tolerance.

          // FIXME: Sidekick currently matches any locations within a 130m radius!
          //  We want to match within 30m.  We also want sidekick to reject locations with low accuracies when
          //  getting the location from the phone GPS

          let matchedExistingLocation;
          if (existingLocations && existingLocations.length > 0) {
            // TODO: When matching stations, it would be good if we could also factor in the accuracy of the GPS
            //  when we're considering matches.
            const candidateMatches = existingLocations
              .map((existingLocation) => ({
                d: latLngApproxDistance(existingLocation.location, locationUpdate.location),
                l: existingLocation,
              }))
              .filter((existingLocation) => existingLocation.d <= 0)
              .sort((a, b) => {
                return a.d - b.d;
              });
            if (candidateMatches.length > 0) {
              matchedExistingLocation = candidateMatches[0].l;
            }
          }
          if (matchedExistingLocation) {
            // Sidekick updates the existing location with the new name, fromDateTime
            if (locationUpdate.atTime < new Date(matchedExistingLocation.activeAt)) {
              const updateLocationResponse = await TestApiImpl.Locations.withAuth(
                this.userHandle.testId,
              ).changeLocationNameAndFromDateTime(
                matchedExistingLocation.id,
                locationUpdate.name,
                locationUpdate.atTime,
              );
              expect(updateLocationResponse.success, "location updated").toBe(true);
            } else {
              const updateLocationResponse = await TestApiImpl.Locations.withAuth(
                this.userHandle.testId,
              ).changeLocationName(matchedExistingLocation.id, locationUpdate.name);
              expect(updateLocationResponse.success, "location updated").toBe(true);
            }
          } else {
            // Sidekick creates a new named location
            const locationResponse = await TestApiImpl.Locations.withAuth(
              this.userHandle.testId,
            ).createNewLocationForProject(
              deviceForUpdate.groupId,
              locationUpdate.name,
              locationUpdate.location,
              false,
              locationUpdate.atTime,
            );
            expect(locationResponse, "location created").toBeTruthy();
          }
          console.log(`Update device location at ${locationUpdate.atTime}`);
          const result = await TestApiImpl.Devices.withAuth(
            this.userHandle.testId,
          ).updateDeviceLocation(
            locationUpdate.deviceId,
            locationUpdate.location,
            locationUpdate.atTime, // FIXME: Implement this in sidekick
          );
          expect(result.success).toBe(true);
          if (result.success) {
            expect(result.result.location).toStrictEqual(locationUpdate.location);
          }
        }
      });
    }
  }

  private async uploadReferencePhotos() {
    if (this.referencePhotoUpdates.length !== 0) {
      return await test.step("Upload reference photos from sidekick", async () => {
        while (this.referencePhotoUpdates.length > 0) {
          const referencePhoto = this.referencePhotoUpdates.shift() as QueuedReferenceImageUpdate;
          {
            // Current behaviour: update the device settings/location each time we upload a reference image.
            await TestApiImpl.Devices.withAuth(this.userHandle.testId).updateDeviceLocation(
              referencePhoto.deviceId,
              referencePhoto.location,
            );
          }
          {
            // FIXME: Currently sidekick does *not* include the date the reference image was added, it just defaults to upload time.
            const referenceImage = referencePhoto.photo;
            const response = await TestApiImpl.Devices.withAuth(
              this.userHandle.testId,
            ).addReferenceImageForDeviceAtTime(
              referencePhoto.deviceId,
              referenceImage,
              referencePhoto.atTime, // FIXME: Make sidekick match this behaviour - currently it doesn't send time
            );
            expect(response.success).toBe(true);
            expect(response.result).toMatchObject({
              size: referenceImage.byteLength,
            });
          }
        }
      });
    }
  }

  public async syncWithApi() {
    if (this.isOffline) {
      throw new Error("No internet connection available, can't sync with API");
    }
    // NOTE: This is the order in which sidekick currently attempts to upload items,
    // although it also tries to update the device location for each time it uploads
    // a reference image too - but it doesn't currently add the date for the reference image
    // to apply from.
    await this.uploadLocationUpdates();
    await this.uploadReferencePhotos();
    await this.uploadEvents();
    await this.uploadRecordings();
  }

  public async makeTestThermalRecording(recording: ArrayBuffer, atTime: Date) {
    if (!this.connectedDeviceSim) {
      throw new Error("Can't make test recording unless connected to a device");
    }
    await this.connectedDeviceSim.makeThermalRecording(recording, atTime);
  }

  public async makeTestAudioRecording(recording: ArrayBuffer, atTime: Date) {
    if (!this.connectedDeviceSim) {
      throw new Error("Can't make test recording unless connected to a device");
    }
    await this.connectedDeviceSim.makeAudioRecording(recording, atTime);
  }

  // public offloadLatestRecordingFromDevice() {
  //   throw new Error("Not implemented in sidekick currently");
  //   if (!this.connectedDeviceSim) {
  //     throw new Error("Can't offload latest recording unless connected to a device");
  //   }
  //   // Sidekick doesn't actually have this at the moment, you can only offload all recordings and events
  //   const recording = this.connectedDeviceSim.offloadRecordingsToSidekick(true);
  //   this.recordings.push(...recording);
  // }

  private offloadEventsFromDevice() {
    if (!this.connectedDeviceSim) {
      throw new Error("Can't offload events unless connected to a device");
    }
    this.events.push(...this.connectedDeviceSim.offloadEventsToSidekick());
  }

  private offloadRecordingsFromDevice() {
    if (!this.connectedDeviceSim) {
      throw new Error("Can't recordings events unless connected to a device");
    }
    this.recordings.push(...this.connectedDeviceSim.offloadRecordingsToSidekick());
  }

  public userRequestsOffloadFromDevice() {
    this.offloadEventsFromDevice();
    this.offloadRecordingsFromDevice();
  }

  private async uploadEvents() {
    if (this.events.length !== 0) {
      await test.step("Upload device events from sidekick", async () => {
        while (this.events.length > 0) {
          const event = this.events.shift() as EventStoredInSidekick;
          const response = await TestApiImpl.Devices.withAuth(
            this.userHandle.testId,
          ).submitEventsOnBehalfOfDevice(event.deviceId, {
            dateTimes: [event.atTime.toISOString()],
            description: event.event,
          });
          expect(response.success).toBe(true);
        }
      });
    }
  }

  private async uploadRecordings(): Promise<RecordingId[]> {
    const ids: RecordingId[] = [];
    if (this.recordings.length !== 0) {
      await test.step("Upload recordings from sidekick", async () => {
        for (const recording of this.recordings) {
          // Offload sequentially
          const recordingId = await uploadRecording(this.userHandle, {
            type: recording.type,
            file: recording.file,
            deviceId: recording.deviceId,
            location: recording.location,
            recordingDateTime: recording.recordingDateTime,
          });
          ids.push(recordingId);
        }
      });
    }
    return ids;
  }

  public async changeDeviceProject(
    authToken: JwtToken<UserId>,
    targetProjectId: ProjectId,
    fromDateTime?: Date,
    newDeviceName?: string,
  ) {
    if (!this.connectedDeviceSim) {
      throw new Error("Can't change device project, must connect to a device first");
    }
    if (this.isOffline) {
      throw new Error("Can't change device project, must have an internet connection");
    }
    return await this.connectedDeviceSim.reRegisterInProject(
      authToken,
      targetProjectId,
      fromDateTime,
      newDeviceName,
    );
  }
}
