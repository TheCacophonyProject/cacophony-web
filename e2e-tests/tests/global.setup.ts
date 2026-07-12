import { startMailServerStub } from "@/helpers/email-utils";
import { test as setup } from "@playwright/test";

setup("startup mail-server stub", async () => {
  const result = await startMailServerStub();
  console.log(result);
});
