import { Buffer } from "https://deno.land/std/io/mod.ts";
import { createHash } from "https://deno.land/std@0.77.0/hash/mod.ts";
import { createGroup } from "./user.ts";
import { createDevice, Device, getDevice } from "./device.ts";
import {
  createDeviceRecording,
  deleteDeviceRecording,
  RecordingMetaData,
} from "./recordings.ts";

const testAudioDevice: Device = {
  group: "test",
  devicename: "testAudio",
  password: "testtest",
  saltId: 123456,
};

await createGroup(testAudioDevice.group);

let device = await getDevice(testAudioDevice.devicename, testAudioDevice.group);
if (!device) {
  device = await createDevice(testAudioDevice);
}

for await (const dirEntry of Deno.readDir("./audio_files")) {
  const fileName = dirEntry.name;
  console.log(`=== Reading file ${fileName} ===`);
  //check is mp3 else skip
  if (!fileName.endsWith(".mp3")) {
    console.log(`File ${fileName} is not mp3 file, skipping`);
    continue;
  }
  const filePath = `./audio_files/${fileName}`;
  const fileOpen = await Deno.open(filePath);
  const buffer = new Buffer();
  await buffer.readFrom(fileOpen);
  const arrayBuffer = buffer.bytes();
  const blob = new Blob([arrayBuffer.buffer], { type: "audio/mpeg" });
  const file = new File([blob], fileName);

  const fileHash = createHash("sha1")
    .update(arrayBuffer)
    .toString();
  fileOpen.close();

  // convert file name to date with example format YYYYMMDD-HHMMSS.mp3
  const recordingDateTime = fileName.split(".")[0];
  const year = recordingDateTime.slice(0, 4);
  const month = recordingDateTime.slice(4, 6);
  const day = recordingDateTime.slice(6, 8);
  const hour = recordingDateTime.slice(9, 11);
  const minute = recordingDateTime.slice(11, 13);
  const second = recordingDateTime.slice(13, 15);
  const recordingDateTimeString =
    `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  console.log(recordingDateTimeString, fileName, fileHash);

  const metadata: RecordingMetaData = {
    type: "audio",
    duration: 60,
    recordingDateTime: recordingDateTimeString,
    fileHash: fileHash,
    fileName: fileName,
    metadata: {
      tracks: [],
    },
  };

  const recordingRes = await createDeviceRecording(
    device,
    metadata,
    file,
  );

  if (recordingRes.messages[0].startsWith("Duplicate")) {
    await deleteDeviceRecording(recordingRes.recordingId);
    await createDeviceRecording(
      device,
      metadata,
      file,
    );
  }
}
