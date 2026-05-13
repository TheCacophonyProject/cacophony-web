import {test} from "@/helpers/upload-tests"
import {createProjectWithUserAndDevice} from "@/helpers/create-test-entities";
//import type {Request, RequestInit, Response} from "node/web-globals/fetch";

test.beforeEach(async ({ request }) => {
    const nodeFetch = global.fetch;

    // TODO: Shim playwright fetch impl to match regular browser impl

    // TODO: Make Client API recompile on changes.
    // TODO: Eventually pull types and client api shim out into a separate package, for sharing with Sidekick.

    const playwrightFetch = async (input: string | URL | Request, init?: RequestInit,
    ): Promise<Response> => {
        // TODO
        const apiResponse = await request.fetch(input, init);
        return apiResponse as Response;
    };



    // @ts-ignore
    //global.fetch = request.fetch.bind(request);
    global.fetch = playwrightFetch;
    global.nodeFetch = nodeFetch;
});

test.afterEach(async () => {
    global.fetch = global.nodeFetch;
});

test.only(`When setting up a new device and setting a new location via sidekick - with internet connectivity - 
            device location and history location should be updated.`, async () => {
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

    await AdminUser.Devices.updateDeviceLocation(device.id, project.locationBase);
});

test(`When setting up a new device and setting a new location via sidekick - without internet connectivity - 
            device location and history location should be updated, backdated to the correct time.`, async () => {

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