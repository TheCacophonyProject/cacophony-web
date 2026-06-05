import { getTestEmail } from "@commands/names";

export const ACCEPT_INVITE_PREFIX = "/accept-invite/";
export const CONFIRM_EMAIL_PREFIX = "/confirm-account-email/";
export const JOIN_PROJECT_REQUEST_PREFIX =
  "/confirm-project-membership-request/";
export const RESET_PASSWORD_PREFIX = "/reset-password/";
export interface TestEmail {
  headers: {
    to: string;
    subject: string;
  };
  body: string;
  html: string;
}

export const waitForEmail = (toUser: string, type): Cypress.Chainable => {
  cy.log(`Wait for ${type} email`);
  const params = new URLSearchParams();
  params.append("address", getTestEmail(toUser));
  return cy
    .request("GET", `http://localhost:8888/get-mail?${params}`)
    .then((response) => {
      cy.wrap(response.body);
    });
};

export const waitForEmailPromise = (toUser: string, type = "") => {
  return new Promise<string>((resolve, _reject) => {
    cy.log(`Wait for ${type} email`);
    const params = new URLSearchParams();
    params.append("address", getTestEmail(toUser));
    fetch(`http://localhost:8888/get-mail?${params}`).then((emailResponse) => {
      if (emailResponse.ok) {
        emailResponse.json().then(resolve);
      }
    });
  });
};

export const startMailServerStub = () => {
  cy.log("Attempting to start mail server stub");
  return cy.exec(
    `cd ../api && docker exec cacophony-web bash -lic "node ./api/scripts/test-scripts/concurrent-mailserver-stub.js > /dev/null &"`,
    { log: false, failOnNonZeroExit: false },
  );
};

export const startMailServerStubPromise = async () => {
  return new Promise((resolve, _reject) => {
    cy.log("Attempting to start mail server stub");
    cy.exec(
      `cd ../api && docker exec cacophony-web bash -lic "node ./api/scripts/test-scripts/concurrent-mailserver-stub.js > /dev/null &"`,
      { log: false, failOnNonZeroExit: false },
    ).then(resolve);
  });
};

export const extractTokenStartingWith = (
  email: TestEmail,
  tokenUrlPrefix: string,
): { token: string; payload: Record<string, string | number> } => {
  expect(
    email.body.includes(tokenUrlPrefix),
    `Email contains expected token '${tokenUrlPrefix}'`,
  ).to.equal(true);
  const tokenString = email.body
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

export const confirmEmailAddress = (userName: string) => {
  return waitForEmail(userName, "welcome").then((email: TestEmail) => {
    expect(email.headers.subject).to.equal(
      "🔧 Finish setting up your new Cacophony Monitoring account",
    );
    expect(email.headers.to).to.equal(getTestEmail(userName));
    const { payload, token } = extractTokenStartingWith(
      email,
      CONFIRM_EMAIL_PREFIX,
    );
    expect(payload._type).to.equal("confirm-email");
    return cy.apiConfirmEmailAddress(token);
  });
};
