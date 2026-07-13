import { test } from "@/helpers/upload-tests";
import { createProjectWithUserAndDevice } from "@/helpers/create-test-entities";

test(`Bulk recording queries work`, async () => {
  const project = await createProjectWithUserAndDevice();
  const AdminUser = project.api();
  await AdminUser.Recordings.getAllRecordingsForProjectBetweenTimes(project.projectHandle.id, {});
});
