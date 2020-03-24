context('New User', () => {
  const username = "integration";
  const group = 'int-test';
  const camera = 'int-test';
  it('A new user can create an account, and a group', () => {
    cy.registerNewUserAs(username);

    cy.contains("Create a group").click();
    cy.createGroup(group);

    // create a camera in the group
    cy.createCamera(camera, group);

    // check that user can see camera
    cy.visit('devices');
    cy.contains(camera);
  });


  it('A camera event can be triggered', () => {
    const eventType = "throttle";
    cy.apiSignInAs(username);
    cy.cameraEvent(eventType);
    // for event-uploader to upload
    cy.wait(3 * 1000);
    cy.apiCheckEventUploaded(username,camera, eventType);
  });

  it('A camera can trigger and upload a new recording', () => {
    cy.apiSignInAs(username);
    cy.cameraRecording();
    // for video to be uploaded
    cy.wait(3 * 1000);
    cy.apiCheckDeviceHasRecording(username,camera);
  });
});
