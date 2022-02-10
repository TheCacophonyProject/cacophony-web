import { baseUrl, groupsUrl, postBody } from "./utils.ts";
// Authencation
async function authenticateUser(
  userName: string,
  password: string
): Promise<string> {
  try {
    const response = await fetch(`${baseUrl}/authenticate_user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userName, password }),
    });
    console.log("===== authenticateUser =====", response);
    const responseJson = await response.json();
    console.log(responseJson.token);
    return responseJson.token;
  } catch (error) {
    console.error(error);
    return Promise.reject(error);
  }
}
//
// Group API
async function createGroup(groupName: string): Promise<Response> {
  try {
    console.log("===== createGroup =====");
    const body = await postBody({
      groupName,
    });
    const response = await fetch(groupsUrl, body);
    return response;
  } catch (error) {
    console.error(error);
    return Promise.reject(error);
  }
}

async function addUserToGroup(
  userName: string,
  groupId: string
): Promise<void> {
  try {
    const body = await postBody({ userName, groupId });
    const response = await fetch(groupsUrl, body);
    console.log(body, response);
    const responseJson = await response.json();
    return responseJson;
  } catch (error) {
    console.error(error);
    return Promise.reject(error);
  }
}

export { addUserToGroup, authenticateUser, createGroup };
