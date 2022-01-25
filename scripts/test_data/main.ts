import { Buffer } from "https://deno.land/std/io/mod.ts";
import { createHash } from "https://deno.land/std@0.77.0/hash/mod.ts";
import { createGroup } from "./user.ts";
import { createDevice, Device, getDevice } from "./device.ts";
import { createDeviceRecording, deleteDeviceRecording } from "./recordings.ts";
import { RecordingType } from "../types/api/consts.ts";

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

  const metadata = {
    duration: 60,
    recordingDateTime: recordingDateTimeString,
    fileHash: fileHash,
    fileName: fileName,
    type: RecordingType.Audio,
    relativeToDawn: 1000,
    relativeToDusk: -17219,
    location: [-43.53345, 172.64745],
    version: "1.8.1",
    batteryCharging: "DISCHARGING",
    batteryLevel: 87,
    airplaneModeOn: false,
    cacophonyIndex: [
      { end_s: 20, begin_s: 0, index_percent: 80.8 },
      { end_s: 40, begin_s: 20, index_percent: 77.1 },
      { end_s: 60, begin_s: 40, index_percent: 71.6 },
    ],
    metadata: {
      algorithm: { model_name: "master" },
      models: [
        {
          id: 1,
          name: "Master"
        }
      ],
      tracks: [
        {
          start_s: 1,
          end_s: 19,
          predictions: [
            {
              confident_tag: "morepork",
              confidence: 0.9,
              model_id: 1,
            },
          ],
        },
        {
          start_s: 20,
          end_s: 40,
          predictions: [
            {
              name: "Master",
              confident_tag: "morepork",
              confidence: 1,
              model_id: 1,
            },
          ],
        },
        {
          start_s: 41,
          end_s: 60,
          predictions: [
            {
              name: "Master",
              confident_tag: "morepork",
              confidence: 0.9,
              model_id: 1,
            },
          ],
        },
      ],
    },
    additionalMetadata: {
      normal: "0",
      "SIM IMEI": "990006964660319",
      cacophony_index_version: "2020-01-20_A",
      processing_time_seconds: 50.7,
      species_identify_version: "2021-02-01",
      "SIM state": "SIM_STATE_READY",
      "Auto Update": false,
      "Flight Mode": false,
      "Phone model": "SM-G900V",
      amplification: 1.0721460589601806,
      SimOperatorName: "Verizon",
      "Android API Level": 23,
      "Phone manufacturer": "samsung",
      "App has root access": false,
    },
    comment: "A comment",
    processingState: "FINISHED",
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
