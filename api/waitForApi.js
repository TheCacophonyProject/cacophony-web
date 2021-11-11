#!/usr/bin/node
const http = require("http");

(async function main() {
  const now = new Date();
  const waitMins = 5;
  const fiveMinutesFromNow = new Date(
    now.setMinutes(now.getMinutes() + waitMins)
  );
  console.log(`Waiting up to ${waitMins} minutes for API sever...`);
  const apiServerIsUp = async (url) => {
    return new Promise((resolve, reject) => {
      http
        .get(url, (response) => {
          response.on("data", (chunk) => {
            // Do nothing
          });
          response.on("end", () => {
            resolve(true);
          });
        })
        .on("error", (err) => {
          reject(false);
        });
    });
  };

  while (new Date() < fiveMinutesFromNow) {
    let up = false;
    try {
      up = await apiServerIsUp(
        "http://localhost:1080/api/v1/endUserAgreement/latest"
      );
    } catch (e) {
      // ...
    }
    if (up) {
      process.exit(0);
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  console.log("API server failed to start");
  process.exit(1);
})();
