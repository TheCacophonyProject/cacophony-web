import AWS from "aws-sdk";

console.log("Archive recordings to Backblaze");

(async function main() {
    // TODO
    // Get oldest recording from the DB, as a transaction (see getOneForProcessing)
    // download the recording from minio
    // upload the recording to backblaze with a bb_ prefix on the key.

    // update the db entry.
}());
