#!/usr/bin/node
const http = require("http");

(async function main() {
  const now = new Date();
  const fiveMinutesFromNow = new Date(now.setMinutes(now.getMinutes() + 5));

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
          console.log("Error: " + err.message);
          reject(false);
        });
    });
  };

  while (new Date() < fiveMinutesFromNow) {
    console.log("Checking if api is up");
    const up = await apiServerIsUp(
      "http://localhost:1080/api/v1/endUserAgreement/latest"
    );
    if (up) {
      process.exit(0);
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  console.log("API server failed to start");
  process.exit(1);
})();
