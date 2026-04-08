import * as util from "node:util";
import * as child_process from "node:child_process";
const exec = util.promisify(child_process.exec);
import { expect, Page, test } from "@playwright/test";
import { getEmail } from "./browse-helpers";

export const ACCEPT_INVITE_PREFIX = "/accept-invite/";
export const CONFIRM_EMAIL_PREFIX = "/confirm-account-email/";
export const JOIN_GROUP_REQUEST_PREFIX = "/confirm-project-membership-request/";
export const RESET_PASSWORD_PREFIX = "/reset-password/";
export const clearMailServerLog = async () => {
  try {
    await fetch(`http://localhost:8888/clear-mailbox`);
  } catch {
    // Maybe server isn't running yet.
  }
};

export interface TestEmail {
  headers: {
    to: string;
    subject: string;
  };
  body: string;
  html: string;
}

export const startMailServerStub = async () => {
  return test.step("Initialize mail server stub", async () => {
    await exec(
      `cd ../api && docker exec cacophony-web bash -lic "node ./api/scripts/concurrent-mailserver-stub.js > /dev/null &"`,
    );
  });
};

export const waitForEmail = async (toUser: string, type = ""): Promise<TestEmail> => {
  const to = getEmail(toUser);
  return await test.step(`Wait for${type.length ? ` '${type}' ` : " "}email to ${to}`, async () => {
    const params = new URLSearchParams();
    params.append("address", to);
    const emailResponse = await fetch(`http://localhost:8888/get-mail?${params}`);
    if (emailResponse.ok) {
      return await emailResponse.json();
    }
  });
};

export const waitForEmailAndRenderEmailHtml = async (page: Page, toUser: string, type = "") => {
  const email = await waitForEmail(toUser, type);
  await test.step(`${toUser} opens email`, async () => {
    await page.setContent(email.html);
  });
  return email;
};

export const openResetPasswordRequestEmail = async (page: Page, toUser: string) => {
  const email = await waitForEmailAndRenderEmailHtml(page, toUser, "reset password request");
  const { payload } = await extractTokenStartingWith(email, RESET_PASSWORD_PREFIX);
  expect(payload, "token payload is correct").toMatchObject({
    _type: "reset-password",
  });
};

export const openSignupConfirmationEmail = async (page: Page, user: string) => {
  const email = await waitForEmailAndRenderEmailHtml(page, user, "sign-up confirmation");
  const { payload } = await extractTokenStartingWith(email, CONFIRM_EMAIL_PREFIX);
  expect(payload, "token payload is correct").toMatchObject({
    email: getEmail(user),
    _type: "confirm-email",
  });
};

export const receiveAndIgnoreConfirmationEmail = async (page: Page, user: string) => {
  const email = await waitForEmail(user, "sign-up confirmation");
  const { payload } = await extractTokenStartingWith(email, CONFIRM_EMAIL_PREFIX);
  expect(payload, "token payload is correct").toMatchObject({
    email: getEmail(user),
    _type: "confirm-email",
  });
};

export const openJoinProjectRequestEmail = async (page: Page, user: string) => {
  const email = await waitForEmailAndRenderEmailHtml(page, user, "join request");
  const { payload } = await extractTokenStartingWith(email, JOIN_GROUP_REQUEST_PREFIX);
  expect(payload, "token payload is correct").toMatchObject({
    _type: "join-group",
  });
};

export const openJoinProjectInviteEmailForNewUser = async (page: Page, user: string) => {
  const email = await waitForEmailAndRenderEmailHtml(page, user, "join project invite");
  const { payload } = await extractTokenStartingWith(email, ACCEPT_INVITE_PREFIX);
  expect(payload, "token payload is correct").toMatchObject({
    _type: "invite-new-user",
  });
};

export const openJoinProjectInviteEmailForExistingUser = async (page: Page, user: string) => {
  const email = await waitForEmailAndRenderEmailHtml(page, user, "join project invite");
  const { payload } = await extractTokenStartingWith(email, ACCEPT_INVITE_PREFIX);
  expect(payload, "token payload is correct").toMatchObject({
    _type: "invite-existing-user",
  });
};

export const extractTokenStartingWith = async (
  email: TestEmail,
  tokenUrlPrefix: string,
): Promise<{ token: string; payload: Record<string, string | number> }> => {
  //console.log("Extract token from email", email);
  return await test.step(`Extract token from email`, async () => {
    expect(
      email.body.includes(tokenUrlPrefix),
      `Email contains expected token '${tokenUrlPrefix}'`,
    ).toEqual(true);
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
  });
};
