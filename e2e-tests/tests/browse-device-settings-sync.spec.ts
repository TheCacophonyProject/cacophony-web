import { test } from "@/helpers/upload-tests";

test("Settings sync between device and browse works correctly", async () => {
  // TODO - This seems like page tests, and then simulating a device picking up the settings?
  //  Also changing settings via sidekick, device syncing, and having browse reflect those settings.
  // TODO: It would be good if when you change a setting in browse, when settings are synced, and then change it back again,
  //  it reverts back to showing that the device is synced, rather than unsynced
});
