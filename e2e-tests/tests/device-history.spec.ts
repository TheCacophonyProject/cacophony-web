import {test} from "@/helpers/upload-tests"
import {createProjectWithUserAndDevice} from "@/helpers/create-test-entities";
import {expect} from "@playwright/test";
import { SidekickSim } from "@/helpers/sidekick-sim";

test.beforeEach(async ({ request }) => {
    const nodeFetch = global.fetch;

    // // TODO: Shim playwright fetch impl to match regular browser impl
    //
    // // TODO: Make Client API recompile on changes.
    // // TODO: Eventually pull types and client api shim out into a separate package, for sharing with Sidekick.
    //
    // const playwrightFetch = async (input: string | URL | Request, init?: RequestInit,
    // ): Promise<Response> => {
    //     // TODO
    //     const apiResponse = await request.fetch(input, init);
    //     return apiResponse as Response;
    // };
    //
    //
    //
    // @ts-ignore
    global.fetch = request.fetch.bind(request);
    //global.fetch = playwrightFetch;

    // @ts-ignore
    global.nodeFetch = nodeFetch;
});

test.afterEach(async () => {
    // @ts-ignore
    global.fetch = global.nodeFetch;
});

test(`When setting up a new device (without modem) and setting a new location via sidekick - with internet connectivity - 
            device location and history location should be immediately updated via sidekick.`, async () => {
    const project = await createProjectWithUserAndDevice();
    const AdminUser = project.api();
    const device = project.deviceHandles[0];

    // Sidekick adds a new location
    await AdminUser.Projects.createLocation(project.projectHandle.id, {
        name: "test location",
        ...project.locationBase
    });

    // Hmm, maybe device location isn't actually updated
    // Sidekick adds a reference image?

    // When we set a location on the device from sidekick, if sidekick has connectivity we also try to set
    // the location in the API via the /api/v1/devices/${deviceId}/settings API.  This should also create a
    // new DeviceHistory entry at that location and carry forward existing settings.
    // At the same time, the config on the device is updated, and at a later time there will be a "config" event
    // with the updated location.

    // FIXME: Does sidekick call this later for offline devices?
    //   If so, that means that the Device.location current location can be set to an old stale location.
    const result = await AdminUser.Devices.updateDeviceLocation(device.id, project.locationBase);
    expect(result.success).toBe(true);
    if (result.success) {
        expect(result.result.location).toStrictEqual(project.locationBase);
    }
    const deviceInApi = await AdminUser.Devices.getDeviceById(device.id);
    expect(deviceInApi).toBeDefined();
    if (deviceInApi) {
        expect(deviceInApi.location).toStrictEqual(project.locationBase);
    }
    // Some time later, make sure the config event is handled correctly when uploaded.
});

test(`When setting up a new device via sidekick, with a modem, when sidekick has internet connectivity, ensure only one of them syncs with API`, async () => {
    // If sidekick is connected to bushnet hotspot from the device, and the device has internet connectivity via modem - is that active
    // when sidekick is configuring it?
    // TODO.
});

test(`When setting up a new device and setting a new location via sidekick - without internet connectivity - 
            device location and history location should be updated, backdated to the correct time.`, async () => {



    // Create a device
    const project = await createProjectWithUserAndDevice();
    const AdminUser = project.api();
    const device = project.deviceHandles[0];
    const sideKickSim = new SidekickSim();

    // Set a location via sidekick (simulating offline state)
    const initialLocation = { ...project.locationBase, name: "Initial Offline Location" };
    const initialTimestamp = new Date("2026-05-01T10:00:00Z");

    sideKickSim.setLocation(initialLocation);
    // Queue location update locally without immediate API sync
    await AdminUser.Devices.queueLocationUpdate(device.id, initialLocation, initialTimestamp);

    // Don't immediately sync when connectivity is available

    // Return to the device 1 week later and offload recordings and events

    // Move the device, take a test recording

    // Later when back in connectivity, offload recordings and events. These may not be uploaded in chronological order.
    // Sidekick syncs location settings too at this point

    // The device location should be that of the latest location, both in history and in the Device model.
    // The earlier device location should be captured.

    // Stations/Locations for both locations should exist, with the fromDateTime being accurate for each.


    /*
        AI suggestion - maybe an okay starting point?
        // Set a location via sidekick (simulating offline state)
        const initialLocation = { ...project.locationBase, name: "Initial Offline Location" };
        const initialTimestamp = new Date("2026-05-01T10:00:00Z");

        // Queue location update locally without immediate API sync
        await AdminUser.Devices.queueLocationUpdate(device.id, initialLocation, initialTimestamp);

        // Return to the device 1 week later and offload recordings and events
        const oneWeekLater = new Date(initialTimestamp.getTime() + 7 * 24 * 60 * 60 * 1000);

        // Move the device, take a test recording
        const newLocation = { ...project.locationBase, name: "New Offline Location" };
        const moveTimestamp = new Date(oneWeekLater.getTime() + 2 * 60 * 60 * 1000);

        await AdminUser.Devices.queueLocationUpdate(device.id, newLocation, moveTimestamp);

        // Simulate a recording event at the new location
        const testRecording = { deviceId: device.id, timestamp: moveTimestamp, durationMs: 5000 };
        await AdminUser.Recordings.queueRecording(testRecording);

        // Later when back in connectivity, offload recordings and events.
        // These may not be uploaded in chronological order. Sidekick syncs location settings too at this point.
        const syncPayload = {
            locations: [
                { location: newLocation, timestamp: moveTimestamp },
                { location: initialLocation, timestamp: initialTimestamp } // Deliberately out of order to test sorting/backdating
            ],
            recordings: [testRecording]
        };

        await AdminUser.Devices.syncOfflineData(device.id, syncPayload);

        // The device location should be that of the latest location, both in history and in the Device model.
        const updatedDevice = await AdminUser.Devices.getDeviceById(device.id);
        expect(updatedDevice).toBeDefined();
        if (updatedDevice) {
            expect(updatedDevice.location.name).toBe(newLocation.name);
        }

        // The earlier device location should be captured.
        const history = await AdminUser.Devices.getDeviceHistory(device.id);
        expect(history.length).toBeGreaterThanOrEqual(2);

        const initialEntry = history.find(h => h.location.name === initialLocation.name);
        const newEntry = history.find(h => h.location.name === newLocation.name);

        expect(initialEntry).toBeDefined();
        if (initialEntry) {
            expect(new Date(initialEntry.fromDateTime).toISOString()).toBe(initialTimestamp.toISOString());
        }

        expect(newEntry).toBeDefined();
        if (newEntry) {
            expect(new Date(newEntry.fromDateTime).toISOString()).toBe(moveTimestamp.toISOString());
        }

        // Stations/Locations for both locations should exist, with the fromDateTime being accurate for each.
        const projectLocations = await AdminUser.Projects.getLocations(project.projectHandle.id);
        const initialStation = projectLocations.find(l => l.name === initialLocation.name);
        const newStation = projectLocations.find(l => l.name === newLocation.name);

        expect(initialStation).toBeDefined();
        expect(newStation).toBeDefined();

        if (initialStation && newStation) {
            // Verify chronological ordering of station effective dates
            expect(initialStation.fromDateTime).toBeLessThan(newStation.fromDateTime);
        }
     */
});

/*
// Add reference image, which will be at "current device location".  What if the device location isn't set at upload time?
    // FIXME: Currently Sidekick doesn't use the stored "fromDateTime" when uploading reference images.
    console.log(deviceReferenceImage instanceof ArrayBuffer, deviceReferenceImage.byteLength);
    const referenceImage = await AdminUser.Devices.updateReferenceImageForDeviceAtCurrentLocation(device.id, Buffer.from(deviceReferenceImage) as unknown as ArrayBuffer);
    console.log("Added reference image", referenceImage);
 */

test("An initial reference image set via sidekick before a Station entity is created should be carried forwards in settings once the Station/location exists", async () => {
    // Create device
    // Add device to project
    // Set a location for a device
    // Take a reference photo for the device in this location
    // Make a recording in this location

    // How do we simulate this all happening out of order when sidekick syncs up if this was all happening offline?
});

test("Device config events carrying location information should carry forward device history settings info", async () => {

});
