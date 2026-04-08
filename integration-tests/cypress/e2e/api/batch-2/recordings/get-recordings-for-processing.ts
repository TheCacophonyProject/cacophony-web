import { createProjectWithUserAndDevice } from "@/helpers/create-test-entities";
import { uploadThermalRecordingFromDeviceForProject } from "@/helpers/recording-uploads";
import { ApiRecordingResponse } from "@shared/api/recording";
import {
  HttpStatusCode,
  RecordingProcessingState,
  RecordingType,
} from "@shared/api/consts";
import { testRunDockerCommand } from "@commands/server";
import { TestApiImpl } from "@shared/client";
import { JwtToken } from "@shared/client/types";
import { RecordingId } from "@shared/api/common";

describe("Get recordings for processing", () => {
  beforeEach(async () => {
    if (Cypress.env("running_in_a_dev_environment") === true) {
      await testRunDockerCommand(
        "sudo -u postgres psql -d cacophonytest -f /app/api/scripts/deleteTestData.sql",
        { failOnNonZeroExit: false },
      );
    }
  });

  // eslint-disable-next-line cypress/no-async-tests
  it("Can get recordings for processing in multiple states with one API call", async () => {
    const project = await createProjectWithUserAndDevice();
    const AdminUser = project.api();
    const SuperAdminUser = project.api(project.getTestSuperUser());

    // Upload recordings and ensure that they are in the correct initial processing states
    const [recA, recB] = await Promise.all([
      uploadThermalRecordingFromDeviceForProject({
        project,
        recordingDateTime: new Date(),
      }),
      uploadThermalRecordingFromDeviceForProject({
        project,
        recordingDateTime: new Date(),
        // NOTE: Adding supplied metadata_source should put this recording into "analyse" state.
        metadata: {
          algorithm: { name: "testAlgorithm" },
          metadata_source: "test",
        },
      }),
    ]);
    const recordingA = (await AdminUser.Recordings.getRecordingById(
      recA,
    )) as ApiRecordingResponse;
    const recordingB = (await AdminUser.Recordings.getRecordingById(
      recB,
    )) as ApiRecordingResponse;
    expect(
      recordingA.processingState,
      "recording is in `trackAndAnalyse` state upon upload",
    ).to.equal(RecordingProcessingState.TrackAndAnalyse);
    expect(
      recordingB.processingState,
      "recording is in `analyse` state upon upload",
    ).to.equal(RecordingProcessingState.Analyse);
    // Two subsequent calls to Processing.get should return both recordings.
    const processing1 =
      await SuperAdminUser.Recordings.getOneRecordingForProcessing(
        RecordingType.ThermalRaw,
        [
          RecordingProcessingState.TrackAndAnalyse,
          RecordingProcessingState.AnalyseThermal,
        ],
      );
    const processing2 =
      await SuperAdminUser.Recordings.getOneRecordingForProcessing(
        RecordingType.ThermalRaw,
        [
          RecordingProcessingState.TrackAndAnalyse,
          RecordingProcessingState.AnalyseThermal,
        ],
      );
    // The third call should return nothing to process
    const processing3 =
      await SuperAdminUser.Recordings.getOneRecordingForProcessing(
        RecordingType.ThermalRaw,
        [
          RecordingProcessingState.TrackAndAnalyse,
          RecordingProcessingState.AnalyseThermal,
        ],
      );
    expect(processing3.status).to.equal(HttpStatusCode.OkNoContent);
    const rec1 = processing1.result as {
      recording: ApiRecordingResponse;
      rawJWT: JwtToken<RecordingId>;
    };
    const rec2 = processing2.result as {
      recording: ApiRecordingResponse;
      rawJWT: JwtToken<RecordingId>;
    };
    expect(
      rec1.recording.processingState,
      "prioritise 'analyse' state",
    ).to.equal(RecordingProcessingState.AnalyseThermal);
    expect(rec2.recording.processingState).to.equal(
      RecordingProcessingState.TrackAndAnalyse,
    );

    cy.log("Check that we can download a file via signedUrl endpoint");
    const recordingBinaryResponse =
      await TestApiImpl.Recordings.getRecordingWithSignedUrl(rec1.rawJWT);
    expect(recordingBinaryResponse.success, "Got recording with signed url").to
      .be.true;
    expect(recordingBinaryResponse.result).to.be.a("Blob");
  });

  it("Test priorities for processing queue", async () => {
    // TODO:
    return;
  });
});
