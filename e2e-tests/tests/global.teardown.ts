import { clearMailServerLog } from "@/helpers/email-utils";
import { test as teardown } from "@playwright/test";

teardown("clear mail-server", async () => {
  await clearMailServerLog();
});
