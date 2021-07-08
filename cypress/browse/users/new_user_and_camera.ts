context('Users can see footage from their cameras', () => {
  const username = "integration";
  const group = 'int-test';
  const camera = 'int-test';
  it('A new user can create an account, and a group', () => {
    cy.registerNewUserAs(username);

    cy.contains("Create a group").click();
    cy.createGroup(group);

    // create a camera in the group
    cy.apiCreateCamera(camera, group);

    // check that user can see camera
    cy.checkDeviceInGroup(camera,group);
  });


  it('A camera event can be triggered', () => {
    const eventType = "throttle";
    cy.apiSignInAs(username);
    cy.apiUploadEvent(camera);
    // for event-uploader to upload
    cy.wait(3 * 1000);
    cy.apiCheckEventUploaded(username,camera, eventType);
  });

  it('A camera can trigger and upload a new recording', () => {
    cy.apiSignInAs(username);
    cy.apiUploadRecording(camera,1);
    // for video to be uploaded
    cy.wait(3 * 1000);
    cy.apiCheckDeviceHasRecordings(username,camera,1);
  });
});
