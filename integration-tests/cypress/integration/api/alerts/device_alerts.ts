/// <reference path="../../../support/index.d.ts" />
import { checkResponse } from "@commands/server";
import { getNewIdentity } from "@commands/names";
import { ApiAlertCondition } from "@typedefs/api/alerts";

import {
  HTTP_BadRequest,
  HTTP_Forbidden,
  HTTP_OK200,
  HTTP_Unprocessable,
} from "@commands/constants";

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
    cy.apiAlertAdd(
      userb.name,
      "alert1",
      POSSUM_ALERT,
      usera.camera,
      null,
      HTTP_Forbidden
    ).then((response: any) => {
      checkResponse(response, HTTP_Forbidden);
    });
  });

  it("Cannot create alert with invalid condition", () => {
    const BAD_POSSUM_ALERT: ApiAlertCondition[] = [
      { bad_tag: "any", automatic: true },
    ] as unknown as ApiAlertCondition[];
    const usera = getNewIdentity("anna");
    cy.testCreateUserGroupAndDevice(usera.name, usera.group, usera.camera);

    //attempt to create alert with invalid data
    cy.apiAlertAdd(
      usera.name,
      "alert1",
      BAD_POSSUM_ALERT,
      usera.camera,
      null,
      HTTP_Unprocessable
    ).then((response: any) => {
      checkResponse(response, HTTP_Unprocessable);
    });
  });

  it("Can create alert and has no events by default", () => {
    const usera = getNewIdentity("alfred");
    cy.testCreateUserGroupAndDevice(usera.name, usera.group, usera.camera);

    // create alert
    cy.apiAlertAdd(
      usera.name,
      "alert1",
      POSSUM_ALERT,
      usera.camera,
      0,
      HTTP_OK200
    );

    // crete an example alert to compare against
    cy.createExpectedAlert(
      "emptyExpectedAlert",
      "alert1",
      0,
      POSSUM_ALERT,
      false,
      usera.name,
      usera.camera
    );

    //check we created an alert wth no last alerted time
    cy.apiAlertCheck(usera.name, usera.camera, "emptyExpectedAlert");

    //check we have no events
    cy.testEventsCheckAgainstExpected(usera.name, usera.camera, null, 0);
  });

  //FIXME
  it.skip("Can receive an alert", () => {
    const usera = getNewIdentity("andrew");
    cy.testCreateUserGroupAndDevice(usera.name, usera.group, usera.camera);

    // create alert
    cy.apiAlertAdd(
      usera.name,
      "alert1",
      POSSUM_ALERT,
      usera.camera,
      0,
      HTTP_OK200
    );

    //upload a recording tagged as possum and  build an expected event using the returned recording details
    cy.testUploadRecording(
      usera.camera,
      { processingState: "FINISHED", tags: ["possum"] },
      "recording1"
    ).then(() => {
      cy.createExpectedAlert(
        "expectedAlert1",
        "alert1",
        0,
        POSSUM_ALERT,
        true,
        usera.name,
        usera.camera
      ).then(() => {
        cy.createExpectedEvent(
          "event1",
          usera.name,
          usera.camera,
          "recording1",
          "alert1"
        );
      });
    });

    //check that an alert is present and has a 'last alerted'
    cy.apiAlertCheck(usera.name, usera.camera, "expectedAlert1");

    //check expected event is received
    cy.testEventsCheckAgainstExpected(usera.name, usera.camera, "event1");
  });

  //FIXME
  it.skip("No possum alert is sent for a rat", () => {
    const usera = getNewIdentity("alfreda");
    cy.testCreateUserGroupAndDevice(usera.name, usera.group, usera.camera);

    // create alert
    cy.apiAlertAdd(
      usera.name,
      "alert1b",
      POSSUM_ALERT,
      usera.camera,
      0,
      HTTP_OK200
    );

    //upload a recording tagged as rat and  build an expected event using the returned recording details
    cy.testUploadRecording(
      usera.camera,
      { processingState: "FINISHED", tags: ["rat"] },
      "recording1b"
    ).then(() => {
      cy.createExpectedAlert(
        "emptyAlert",
        "alert1b",
        0,
        POSSUM_ALERT,
        false,
        usera.name,
        usera.camera
      );
    });

    //check that an alert is present and has no 'last alerted'
    cy.apiAlertCheck(usera.name, usera.camera, "emptyAlert");

    //check we have no events
    cy.testEventsCheckAgainstExpected(usera.name, usera.camera, null, 0);
  });

  it("No possum alert is sent for a possum on a different device", () => {
    const usera = getNewIdentity("aine");
    const camera2 = "camera2";
    cy.testCreateUserGroupAndDevice(usera.name, usera.group, usera.camera);
    cy.apiDeviceAdd(camera2, usera.group);

    // create alert
    cy.apiAlertAdd(
      usera.name,
      "alert1c",
      POSSUM_ALERT,
      usera.camera,
      0,
      HTTP_OK200
    );

    //upload a recording tagged as possum against another camera and  build an expected event using the returned recording details
    cy.testUploadRecording(
      camera2,
      { processingState: "FINISHED", tags: ["possum"] },
      "recording1c"
    ).then(() => {
      cy.createExpectedAlert(
        "emptyAlert",
        "alert1c",
        0,
        POSSUM_ALERT,
        false,
        usera.name,
        usera.camera
      );
    });

    //check that an alert is present and has no 'last alerted'
    cy.apiAlertCheck(usera.name, usera.camera, "emptyAlert");

    //check we have no events against either camera
    cy.testEventsCheckAgainstExpected(usera.name, usera.camera, null, 0);
    cy.testEventsCheckAgainstExpected(usera.name, camera2, null, 0);
  });

  //FIXME
  it.skip("Recording with multiple tags - majority tag alerts", () => {
    const usera = getNewIdentity("aaron");
    cy.testCreateUserGroupAndDevice(usera.name, usera.group, usera.camera);

    // create alert
    cy.apiAlertAdd(
      usera.name,
      "alert1d",
      POSSUM_ALERT,
      usera.camera,
      0,
      HTTP_OK200
    );

    //upload a recording tagged as possum and  build an expected event using the returned recording details
    cy.testUploadRecording(
      usera.camera,
      {
        processingState: "FINISHED",
        tags: ["rat", "possum", "possum", "possum", "rat"],
      },
      "recording1d"
    ).then(() => {
      cy.createExpectedAlert(
        "expectedAlert1d",
        "alert1d",
        0,
        POSSUM_ALERT,
        true,
        usera.name,
        usera.camera
      ).then(() => {
        cy.createExpectedEvent(
          "event1d",
          usera.name,
          usera.camera,
          "recording1d",
          "alert1d"
        );
      });
    });

    //check that an alert is present and has a 'last alerted'
    cy.apiAlertCheck(usera.name, usera.camera, "expectedAlert1d");

    //check expected event is received
    cy.testEventsCheckAgainstExpected(usera.name, usera.camera, "event1d");
  });

  //FIXME
  it.skip("Recording with multiple tags - minority tag does not alert", () => {
    const usera = getNewIdentity("aaron");
    cy.testCreateUserGroupAndDevice(usera.name, usera.group, usera.camera);

    // create alert
    cy.apiAlertAdd(
      usera.name,
      "alert1d",
      POSSUM_ALERT,
      usera.camera,
      0,
      HTTP_OK200
    );

    //upload a recording tagged as possum and  build an expected event using the returned recording details
    cy.testUploadRecording(
      usera.camera,
      {
        processingState: "FINISHED",
        tags: ["rat", "rat", "possum", "possum", "rat"],
      },
      "recording1d"
    ).then(() => {
      cy.createExpectedAlert(
        "expectedAlert1d",
        "alert1d",
        0,
        POSSUM_ALERT,
        false,
        usera.name,
        usera.camera
      );
    });

    //check that an alert is present and has no 'last alerted'
    cy.apiAlertCheck(usera.name, usera.camera, "expectedAlert1d");

    //check we have no events against camera
    cy.testEventsCheckAgainstExpected(usera.name, usera.camera, null, 0);
  });

  it("Does not alert on non-master tags", () => {
    const usera = getNewIdentity("alistair");
    cy.testCreateUserGroupAndDevice(usera.name, usera.group, usera.camera);

    // create alert
    cy.apiAlertAdd(
      usera.name,
      "alert1",
      POSSUM_ALERT,
      usera.camera,
      0,
      HTTP_OK200
    );

    //expected alert to compare against (latestEvent is false)
    cy.createExpectedAlert(
      "emptyAlert",
      "alert1",
      0,
      POSSUM_ALERT,
      false,
      usera.name,
      usera.camera
    );

    //upload a recording tagged as possum
    cy.testUploadRecording(
      usera.camera,
      { model: "different", processingState: "FINISHED", tags: ["possum"] },
      "recording2"
    );

    //check we have an alert with no latestEvent
    cy.apiAlertCheck(usera.name, usera.camera, "emptyAlert");

    //check we have no events
    cy.testEventsCheckAgainstExpected(usera.name, usera.camera, null, 0);
  });

  //FIXME
  it.skip("Alerts for recording uploaded on behalf using deviceId", () => {
    const usera = getNewIdentity("albert");
    const userb = getNewIdentity("barbera");

    cy.apiUserAdd(userb.name);
    cy.testCreateUserGroupAndDevice(usera.name, usera.group, usera.camera);

    // create alert
    cy.apiAlertAdd(
      usera.name,
      "alert3",
      POSSUM_ALERT,
      usera.camera,
      0,
      HTTP_OK200
    );

    //add userb to camera's group
    cy.apiGroupUserAdd(usera.name, userb.name, usera.group, false, true);

    //upload a recording tagged as possum using device
    cy.testUploadRecordingOnBehalfUsingDevice(
      userb.name,
      usera.camera,
      { processingState: "FINISHED", tags: ["possum"] },
      "recording3"
    ).then(() => {
      cy.createExpectedAlert(
        "expectedAlert3",
        "alert3",
        0,
        POSSUM_ALERT,
        true,
        usera.name,
        usera.camera
      ).then(() => {
        cy.createExpectedEvent(
          "expectedEvent3",
          usera.name,
          usera.camera,
          "recording3",
          "alert3"
        );
      });
    });

    //check we have an alert with a latestEvent
    cy.apiAlertCheck(usera.name, usera.camera, "expectedAlert3");

    //check we have one event
    cy.testEventsCheckAgainstExpected(
      usera.name,
      usera.camera,
      "expectedEvent3",
      1
    );
  });

  //FIXME
  it.skip("Alerts for recording uploaded on behalf using devicename and groupname", () => {
    const usera = getNewIdentity("andrea");
    const userb = getNewIdentity("bruce");

    cy.apiUserAdd(userb.name);
    cy.testCreateUserGroupAndDevice(usera.name, usera.group, usera.camera);

    // create alert
    cy.apiAlertAdd(
      usera.name,
      "alert4",
      POSSUM_ALERT,
      usera.camera,
      0,
      HTTP_OK200
    );

    //add userb to camera's group
    cy.apiGroupUserAdd(usera.name, userb.name, usera.group, false, true);

    //upload a recording tagged as possum using group
    cy.testUploadRecordingOnBehalfUsingGroup(
      userb.name,
      usera.camera,
      usera.group,
      { processingState: "FINISHED", tags: ["possum"] },
      "recording4"
    ).then(() => {
      cy.createExpectedAlert(
        "expectedAlert4",
        "alert4",
        0,
        POSSUM_ALERT,
        true,
        usera.name,
        usera.camera
      ).then(() => {
        cy.createExpectedEvent(
          "expectedEvent4",
          usera.name,
          usera.camera,
          "recording4",
          "alert4"
        );
      });
    });

    //check alert is present and as expected shows latest event
    cy.apiAlertCheck(usera.name, usera.camera, "expectedAlert4");

    //check we have new event
    cy.testEventsCheckAgainstExpected(
      usera.name,
      usera.camera,
      "expectedEvent4",
      1
    );
  });

  //FIXME
  it.skip("Can generate and report multiple events", () => {
    const usera = getNewIdentity("aida");
    cy.testCreateUserGroupAndDevice(usera.name, usera.group, usera.camera);

    // create alert
    cy.apiAlertAdd(
      usera.name,
      "alert1",
      POSSUM_ALERT,
      usera.camera,
      0,
      HTTP_OK200
    );

    //upload a recording tagged as possum using group
    cy.testUploadRecordingOnBehalfUsingGroup(
      usera.name,
      usera.camera,
      usera.group,
      { processingState: "FINISHED", tags: ["possum"] },
      "recording1"
    ).then(() => {
      cy.createExpectedAlert(
        "expectedAlert1",
        "alert1",
        0,
        POSSUM_ALERT,
        true,
        usera.name,
        usera.camera
      ).then(() => {
        cy.createExpectedEvent(
          "expectedEvent1",
          usera.name,
          usera.camera,
          "recording1",
          "alert1"
        );
      });
    });

    //check that an alert is present and has a 'last alerted'
    cy.apiAlertCheck(usera.name, usera.camera, "expectedAlert1");

    //check there is now 1 event and that expected event has been received
    cy.testEventsCheckAgainstExpected(
      usera.name,
      usera.camera,
      "expectedEvent1",
      1
    );

    //upload a 2nd recording tagged as possum using device
    cy.testUploadRecordingOnBehalfUsingDevice(
      usera.name,
      usera.camera,
      { processingState: "FINISHED", tags: ["possum"] },
      "recording2"
    ).then(() => {
      cy.createExpectedAlert(
        "expectedAlert2",
        "alert1",
        0,
        POSSUM_ALERT,
        true,
        usera.name,
        usera.camera
      ).then(() => {
        cy.createExpectedEvent(
          "expectedEvent2",
          usera.name,
          usera.camera,
          "recording2",
          "alert1"
        );
      });
    });

    //check that an alert is present and has a 'last alerted'
    cy.apiAlertCheck(usera.name, usera.camera, "expectedAlert2");

    //check there are now 2 events and 2nd expected event has been received
    cy.testEventsCheckAgainstExpected(
      usera.name,
      usera.camera,
      "expectedEvent2",
      2
    );

    //upload a 3rd recording tagged as possum and  build an expected event using the returned recording details
    cy.testUploadRecording(
      usera.camera,
      { processingState: "FINISHED", tags: ["possum"] },
      "recording3"
    ).then(() => {
      cy.createExpectedAlert(
        "expectedAlert3",
        "alert1",
        0,
        POSSUM_ALERT,
        true,
        usera.name,
        usera.camera
      ).then(() => {
        cy.createExpectedEvent(
          "expectedEvent3",
          usera.name,
          usera.camera,
          "recording3",
          "alert1"
        );
      });
    });

    //check that an alert is present and has a 'last alerted'
    cy.apiAlertCheck(usera.name, usera.camera, "expectedAlert3");

    //check there are 3 events and 3rd expected event has been received
    cy.testEventsCheckAgainstExpected(
      usera.name,
      usera.camera,
      "expectedEvent3",
      3
    );
  });
});
