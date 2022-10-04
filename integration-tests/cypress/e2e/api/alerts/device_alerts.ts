/// <reference path="../../../support/index.d.ts" />
import { checkResponse } from "@commands/server";
import { getNewIdentity } from "@commands/names";
import { ApiAlertCondition } from "@typedefs/api/alerts";
import { createExpectedAlert } from "@commands/api/alerts";
import { createExpectedEvent } from "@commands/api/events";

import { HttpStatusCode, RecordingProcessingState } from "@typedefs/api/consts";

// All recordings should be one hour old, so that alerts trigger.
const oneHourAgo = new Date(new Date().setHours(new Date().getHours() - 1));

describe("Devices alerts", () => {
  const POSSUM_ALERT: ApiAlertCondition[] = [
    { tag: "possum", automatic: true },
  ];

  it("Cannot create alert without access permissions", () => {
    const usera = getNewIdentity("alice");
    const userb = getNewIdentity("bob");

    cy.apiUserAdd(userb.name);
    cy.testCreateUserGroupAndDevice(usera.name, usera.group, usera.camera);

    //attempt to create alert for camera that is not ours
    cy.apiDeviceAlertAdd(
      userb.name,
      "alert1",
      POSSUM_ALERT,
      usera.camera,
      null,
      HttpStatusCode.Forbidden
    ).then((response: any) => {
      checkResponse(response, HttpStatusCode.Forbidden);
    });
  });

  it("Cannot create alert with invalid condition", () => {
    const BAD_POSSUM_ALERT: ApiAlertCondition[] = [
      { bad_tag: "any", automatic: true },
    ] as unknown as ApiAlertCondition[];
    const usera = getNewIdentity("anna");
    cy.testCreateUserGroupAndDevice(usera.name, usera.group, usera.camera);

    //attempt to create alert with invalid data
    cy.apiDeviceAlertAdd(
      usera.name,
      "alert1",
      BAD_POSSUM_ALERT,
      usera.camera,
      null,
      HttpStatusCode.Unprocessable
    ).then((response: any) => {
      checkResponse(response, HttpStatusCode.Unprocessable);
    });
  });

  it("Can create alert and has no events by default", () => {
    const usera = getNewIdentity("alfred");
    cy.testCreateUserGroupAndDevice(usera.name, usera.group, usera.camera);

    // create alert
    cy.apiDeviceAlertAdd(
      usera.name,
      "alert1",
      POSSUM_ALERT,
      usera.camera,
      0,
      HttpStatusCode.Ok
    ).then(() => {
      // crete an example alert to compare against
      const emptyExpectedAlert = createExpectedAlert(
        "alert1",
        0,
        POSSUM_ALERT,
        false,
        usera.name
      );

      //check we created an alert wth no last alerted time
      cy.apiDeviceAlertCheck(usera.name, usera.camera, emptyExpectedAlert);

      //check we have no events
      cy.testEventsCheckAgainstExpected(usera.name, usera.camera, null, 0);
    });
  });

  it("Can receive an alert", () => {
    const usera = getNewIdentity("andrew");
    cy.testCreateUserGroupAndDevice(usera.name, usera.group, usera.camera);

    // create alert
    cy.apiDeviceAlertAdd(
      usera.name,
      "alert1",
      POSSUM_ALERT,
      usera.camera,
      0,
      HttpStatusCode.Ok
    );

    //upload a recording tagged as possum and  build an expected event using the returned recording details
    cy.testUploadRecording(
      usera.camera,
      {
        processingState: RecordingProcessingState.Finished,
        tags: ["possum"],
        time: oneHourAgo,
      },
      "recording1"
    ).then(() => {
      const expectedAlert = createExpectedAlert(
        "alert1",
        0,
        POSSUM_ALERT,
        true,
        usera.name
      );
      const expectedEvent = createExpectedEvent(
        usera.camera,
        "recording1",
        "alert1"
      );

      //check that an alert is present and has a 'last alerted'
      cy.apiDeviceAlertCheck(usera.name, usera.camera, expectedAlert);

      //check expected event is received
      cy.testEventsCheckAgainstExpected(
        usera.name,
        usera.camera,
        expectedEvent
      );
    });
  });

  it("No possum alert is sent for a rat", () => {
    const usera = getNewIdentity("alfreda");
    cy.testCreateUserGroupAndDevice(usera.name, usera.group, usera.camera);

    // create alert
    cy.apiDeviceAlertAdd(
      usera.name,
      "alert1b",
      POSSUM_ALERT,
      usera.camera,
      0,
      HttpStatusCode.Ok
    );

    //upload a recording tagged as rat and  build an expected event using the returned recording details
    cy.testUploadRecording(
      usera.camera,
      {
        processingState: RecordingProcessingState.Finished,
        tags: ["rat"],
        time: oneHourAgo,
      },
      "recording1b"
    ).then(() => {
      const emptyAlert = createExpectedAlert(
        "alert1b",
        0,
        POSSUM_ALERT,
        false,
        usera.name
      );

      //check that an alert is present and has no 'last alerted'
      cy.apiDeviceAlertCheck(usera.name, usera.camera, emptyAlert);

      //check we have no events
      cy.testEventsCheckAgainstExpected(usera.name, usera.camera, null, 0);
    });
  });

  it("No possum alert is sent for a possum on a different device", () => {
    const usera = getNewIdentity("aine");
    const camera2 = "camera2";
    cy.testCreateUserGroupAndDevice(usera.name, usera.group, usera.camera);
    cy.apiDeviceAdd(camera2, usera.group);

    // create alert
    cy.apiDeviceAlertAdd(
      usera.name,
      "alert1c",
      POSSUM_ALERT,
      usera.camera,
      0,
      HttpStatusCode.Ok
    );

    //upload a recording tagged as possum against another camera and  build an expected event using the returned recording details
    cy.testUploadRecording(
      camera2,
      {
        processingState: RecordingProcessingState.Finished,
        tags: ["possum"],
        time: oneHourAgo,
      },
      "recording1c"
    ).then(() => {
      const emptyAlert = createExpectedAlert(
        "alert1c",
        0,
        POSSUM_ALERT,
        false,
        usera.name
      );

      //check that an alert is present and has no 'last alerted'
      cy.apiDeviceAlertCheck(usera.name, usera.camera, emptyAlert);

      //check we have no events against either camera
      cy.testEventsCheckAgainstExpected(usera.name, usera.camera, null, 0);
      cy.testEventsCheckAgainstExpected(usera.name, camera2, null, 0);
    });
  });

  it("Recording with multiple tags - majority tag alerts", () => {
    const usera = getNewIdentity("aaron");
    cy.testCreateUserGroupAndDevice(usera.name, usera.group, usera.camera);

    // create alert
    cy.apiDeviceAlertAdd(
      usera.name,
      "alert1d",
      POSSUM_ALERT,
      usera.camera,
      0,
      HttpStatusCode.Ok
    );

    //upload a recording tagged as possum and build an expected event using the returned recording details
    cy.testUploadRecording(
      usera.camera,
      {
        processingState: RecordingProcessingState.Finished,
        tags: ["rat", "possum", "possum", "possum", "rat"],
        time: oneHourAgo,
      },
      "recording1d"
    ).then(() => {
      const expectedAlert1d = createExpectedAlert(
        "alert1d",
        0,
        POSSUM_ALERT,
        true,
        usera.name
      );
      const expectedEvent1d = createExpectedEvent(
        usera.camera,
        "recording1d",
        "alert1d"
      );

      //check that an alert is present and has a 'last alerted'
      cy.apiDeviceAlertCheck(usera.name, usera.camera, expectedAlert1d);

      //check expected event is received
      cy.testEventsCheckAgainstExpected(
        usera.name,
        usera.camera,
        expectedEvent1d
      );
    });
  });

  it("Recording with multiple tags - minority tag does not alert", () => {
    const usera = getNewIdentity("aaron");
    cy.testCreateUserGroupAndDevice(usera.name, usera.group, usera.camera);

    // create alert
    cy.apiDeviceAlertAdd(
      usera.name,
      "alert1d",
      POSSUM_ALERT,
      usera.camera,
      0,
      HttpStatusCode.Ok
    );

    //upload a recording tagged as possum and  build an expected event using the returned recording details
    cy.testUploadRecording(
      usera.camera,
      {
        processingState: RecordingProcessingState.Finished,
        tags: ["rat", "rat", "possum", "possum", "rat"],
        time: oneHourAgo,
      },
      "recording1d"
    ).then(() => {
      const expectedAlert1e = createExpectedAlert(
        "alert1d",
        0,
        POSSUM_ALERT,
        false,
        usera.name
      );

      //check that an alert is present and has no 'last alerted'
      cy.apiDeviceAlertCheck(usera.name, usera.camera, expectedAlert1e);

      //check we have no events against camera
      cy.testEventsCheckAgainstExpected(usera.name, usera.camera, null, 0);
    });
  });

  it("Does not alert on non-master tags", () => {
    const usera = getNewIdentity("alistair");
    cy.testCreateUserGroupAndDevice(usera.name, usera.group, usera.camera);

    // create alert
    cy.apiDeviceAlertAdd(
      usera.name,
      "alert1",
      POSSUM_ALERT,
      usera.camera,
      0,
      HttpStatusCode.Ok
    );

    //upload a recording tagged as possum
    cy.testUploadRecording(
      usera.camera,
      {
        model: "different",
        processingState: RecordingProcessingState.Finished,
        tags: ["possum"],
        time: oneHourAgo,
      },
      "recording2"
    ).then(() => {
      //expected alert to compare against (latestEvent is false)
      const emptyAlert = createExpectedAlert(
        "alert1",
        0,
        POSSUM_ALERT,
        false,
        usera.name
      );

      //check we have an alert with no latestEvent
      cy.apiDeviceAlertCheck(usera.name, usera.camera, emptyAlert);

      //check we have no events
      cy.testEventsCheckAgainstExpected(usera.name, usera.camera, null, 0);
    });
  });

  it("Does not alert for recording uploaded on behalf using deviceId", () => {
    const usera = getNewIdentity("albert");
    const userb = getNewIdentity("barbera");

    cy.apiUserAdd(userb.name);
    cy.testCreateUserGroupAndDevice(usera.name, usera.group, usera.camera);

    // create alert
    cy.apiDeviceAlertAdd(
      usera.name,
      "alert3",
      POSSUM_ALERT,
      usera.camera,
      0,
      HttpStatusCode.Ok
    );

    //add userb to camera's group
    cy.apiGroupUserAdd(usera.name, userb.name, usera.group, false, true);

    //upload a recording tagged as possum using device
    cy.testUploadRecordingOnBehalfUsingDevice(
      userb.name,
      usera.camera,
      {
        processingState: RecordingProcessingState.Finished,
        tags: ["possum"],
        time: oneHourAgo,
      },
      "recording3"
    ).then(() => {
      const expectedAlert3 = createExpectedAlert(
        "alert3",
        0,
        POSSUM_ALERT,
        false,
        usera.name
      );
      const expectedEvent3 = createExpectedEvent(
        usera.camera,
        "recording3",
        "alert3"
      );

      //check we have an alert with a latestEvent
      cy.apiDeviceAlertCheck(usera.name, usera.camera, expectedAlert3);

      //check we have one event
      cy.testEventsCheckAgainstExpected(usera.name, usera.camera, null, 0);
    });
  });

  it("Does not alert for recording uploaded on behalf using deviceName and groupName", () => {
    const usera = getNewIdentity("andrea");
    const userb = getNewIdentity("bruce");

    cy.apiUserAdd(userb.name);
    cy.testCreateUserGroupAndDevice(usera.name, usera.group, usera.camera);

    // create alert
    cy.apiDeviceAlertAdd(
      usera.name,
      "alert4",
      POSSUM_ALERT,
      usera.camera,
      0,
      HttpStatusCode.Ok
    );

    //add userb to camera's group
    cy.apiGroupUserAdd(usera.name, userb.name, usera.group, false, true);

    //upload a recording tagged as possum using group
    cy.testUploadRecordingOnBehalfUsingGroup(
      userb.name,
      usera.camera,
      usera.group,
      {
        processingState: RecordingProcessingState.Finished,
        tags: ["possum"],
        time: oneHourAgo,
      },
      "recording4"
    ).then(() => {
      const expectedAlert4 = createExpectedAlert(
        "alert4",
        0,
        POSSUM_ALERT,
        false,
        usera.name
      );
      const expectedEvent4 = createExpectedEvent(
        usera.camera,
        "recording4",
        "alert4"
      );

      //check alert is present and as expected shows latest event
      cy.apiDeviceAlertCheck(usera.name, usera.camera, expectedAlert4);

      //check we have new event
      cy.testEventsCheckAgainstExpected(usera.name, usera.camera, null, 0);
    });
  });

  it("Can generate and report multiple events", () => {
    const usera = getNewIdentity("aida");
    cy.testCreateUserGroupAndDevice(usera.name, usera.group, usera.camera);

    // create alert
    cy.apiDeviceAlertAdd(
      usera.name,
      "alert1",
      POSSUM_ALERT,
      usera.camera,
      0,
      HttpStatusCode.Ok
    );

    //upload a recording tagged as possum using group
    cy.testUploadRecording(
      usera.camera,
      {
        processingState: RecordingProcessingState.Finished,
        tags: ["possum"],
        time: oneHourAgo,
      },
      "recording1"
    ).then(() => {
      const expectedAlert1 = createExpectedAlert(
        "alert1",
        0,
        POSSUM_ALERT,
        true,
        usera.name
      );
      const expectedEvent1 = createExpectedEvent(
        usera.camera,
        "recording1",
        "alert1"
      );

      //check that an alert is present and has a 'last alerted'
      cy.apiDeviceAlertCheck(usera.name, usera.camera, expectedAlert1);

      //check there is now 1 event and that expected event has been received
      cy.testEventsCheckAgainstExpected(
        usera.name,
        usera.camera,
        expectedEvent1,
        1
      );

      //upload a 2nd recording tagged as possum using device
      cy.testUploadRecording(
        usera.camera,
        {
          processingState: RecordingProcessingState.Finished,
          tags: ["possum"],
          time: oneHourAgo,
        },
        "recording2"
      ).then(() => {
        const expectedAlert2 = createExpectedAlert(
          "alert1",
          0,
          POSSUM_ALERT,
          true,
          usera.name
        );
        const expectedEvent2 = createExpectedEvent(
          usera.camera,
          "recording2",
          "alert1"
        );

        //check that an alert is present and has a 'last alerted'
        cy.apiDeviceAlertCheck(usera.name, usera.camera, expectedAlert2);

        //check there are now 2 events and 2nd expected event has been received
        cy.testEventsCheckAgainstExpected(
          usera.name,
          usera.camera,
          expectedEvent2,
          2
        );

        //upload a 3rd recording tagged as possum and  build an expected event using the returned recording details
        cy.testUploadRecording(
          usera.camera,
          {
            processingState: RecordingProcessingState.Finished,
            tags: ["possum"],
            time: oneHourAgo,
          },
          "recording3"
        ).then(() => {
          const expectedAlert3 = createExpectedAlert(
            "alert1",
            0,
            POSSUM_ALERT,
            true,
            usera.name
          );
          const expectedEvent3 = createExpectedEvent(
            usera.camera,
            "recording3",
            "alert1"
          );

          //check that an alert is present and has a 'last alerted'
          cy.apiDeviceAlertCheck(usera.name, usera.camera, expectedAlert3);

          //check there are 3 events and 3rd expected event has been received
          cy.testEventsCheckAgainstExpected(
            usera.name,
            usera.camera,
            expectedEvent3,
            3
          );
        });
      });
    });
  });
});
