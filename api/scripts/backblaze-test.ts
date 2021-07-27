import { openS3 } from "../models/util/util";

console.log("Archive recordings to Backblaze");

(async function main() {
  // TODO
  // Get oldest recording from the DB, as a transaction (see getOneForProcessing)
  // download the recording from minio
  // upload the recording to backblaze with a bb_ prefix on the key.
  // update the db entry.
  const s3 = openS3();
  const buffer = "This is a test payload";
  await s3.upload({ Key: "bb_test_object", Body: buffer }).promise();
})();
