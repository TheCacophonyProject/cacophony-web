import { devicesUrl, getBody, postBody } from "./utils.ts";

export interface Device {
  group: string;
  devicename: string;
  password: string;
  saltId: number;
}

async function createDevice(device: Device): Promise<number> {
  try {
    console.log("===== createDevice =====");
    const res = await fetch(devicesUrl, await postBody(device));
    const json = await res.json();
    console.log(JSON.stringify(json));
    return json.id;
  } catch (err) {
    console.error(err);
    return err;
  }
}

async function getDevice(
  name: string,
  group: string,
): Promise<number | null> {
  try {
    console.log(`===== getDevice ${name} ${group} =====`);
    const body = await getBody();
    const res = await fetch(`${devicesUrl}/${name}/in-group/${group}`, body);
    if (res.status === 200) {
      const json = await res.json();
      return json.device.id;
    } else {
      return null;
    }
  } catch (err) {
    console.error(err);
    return err;
  }
}

export { createDevice, getDevice };
