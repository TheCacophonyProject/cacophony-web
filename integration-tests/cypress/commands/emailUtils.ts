export const clearMailServerLog = () => {
  cy.log("Clearing mail server stub log");
  return cy.exec(
    `cd ../api && docker-compose exec -T server bash -lic "echo "" > mailServerStub.log;"`,
    { log: false }
  );
};
export const waitForEmail = (type: string = "") => {
  let email: string;
  cy.log(`Wait for ${type} email`);
  // TODO: Figure out how to get bash to return after x seconds if there's no result.
  return cy
    .exec(
      `cd ../api && docker-compose exec -T server bash -lic "until grep -q 'SERVER: received email' mailServerStub.log ; do sleep 1; done; cat mailServerStub.log;"`,
      { log: false, timeout: 1500 }
    )
    .then((response) => {
      email = response.stdout;
      expect(email.split("\n")[0], "Received an email").to.include(
        "SERVER: received email"
      );
      return cy.wrap(email, { log: false });
    });
};
export const startMailServerStub = () => {
  cy.log("Starting mail server stub");
  cy.exec(
    `cd ../api && docker-compose exec -T server bash -lic "rm mailServerStub.log || true;"`,
    { log: false }
  );
  cy.exec(
    `cd ../api && docker-compose exec -d -T server bash -lic "node api/scripts/mailServerStub.js"`,
    { log: false }
  );
  // Wait for the mail server log file to be created
  return cy.exec(
    `cd ../api && docker-compose exec -T server bash -lic "until [ -f mailServerStub.log ]; do sleep 1; done;"`,
    { log: false }
  );
};
export const extractTokenStartingWith = (
  email: string,
  tokenUrlPrefix: string
): { token: string; payload: Record<string, string | number> } => {
  expect(email, "Email contains expected token").to.include(tokenUrlPrefix);
  const tokenString = email
    .match(new RegExp(`${tokenUrlPrefix}[A-Za-z0-9.:_-]*`))
    .toString();
  const token = tokenString.substring(tokenUrlPrefix.length);
  const payload = JSON.parse(atob(token.split(":")[1]));
  return { token, payload };
};

export const getEmailSubject = (email: string): string => {
  const lines = email.split("\n");
  const prefix = "SERVER: subject: ";
  const toLine = lines.find((line) => line.startsWith(prefix));
  return (toLine && toLine.slice(prefix.length)) || "";
};
export const getEmailToAddress = (email: string): string => {
  const lines = email.split("\n");
  const prefix = "SERVER: to: ";
  const toLine = lines.find((line) => line.startsWith(prefix));
  return (toLine && toLine.slice(prefix.length)) || "";
};
