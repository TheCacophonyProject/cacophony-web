import { getTestEmail } from "@commands/names";
import { uniqueName } from "@commands/testUtils";

export const ACCEPT_INVITE_PREFIX = "/accept-invite/";
export const CONFIRM_EMAIL_PREFIX = "/confirm-account-email/";
export const JOIN_GROUP_REQUEST_PREFIX = "/confirm-group-membership-request/";
export const RESET_PASSWORD_PREFIX = "/reset-password/";
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
  expect(
    email.includes(tokenUrlPrefix),
    "Email contains expected token"
  ).to.equal(true);
  const tokenString = email
    .match(new RegExp(`${tokenUrlPrefix}[A-Za-z0-9.:_-]*`))
    .toString();
  const token = tokenString.substring(tokenUrlPrefix.length);
  let payload;
  if (token.includes(":")) {
    payload = JSON.parse(atob(token.split(":")[1]));
  } else if (token.length) {
    payload = JSON.parse(atob(token.split(".")[1]));
  }
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

export const confirmEmailAddress = (userName: string) => {
  return waitForEmail("welcome").then((email) => {
    expect(getEmailSubject(email)).to.equal(
      "🔧 Finish setting up your new Cacophony Monitoring account"
    );
    expect(getEmailToAddress(email)).to.equal(getTestEmail(userName));
    const { payload, token } = extractTokenStartingWith(
      email,
      CONFIRM_EMAIL_PREFIX
    );
    expect(payload._type).to.equal("confirm-email");
    return cy.apiConfirmEmailAddress(token);
  });
};

export const pumpSmtp = () => {
  cy.log("Pump smtp server stub");
  const user = uniqueName("pump-smtp");
  return cy.apiUserAdd(user);
};
