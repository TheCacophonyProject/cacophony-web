#!/usr/bin/node
import http from "http";

const apiServerIsUp = async (url) => {
  return new Promise((resolve, reject) => {
    http
      .get(url, (response) => {
        response.on("data", (_chunk) => {
          // Do nothing
        });
        response.on("end", () => {
          resolve(true);
        });
      })
      .on("error", (_err) => {
        reject(false);
      });
  });
};

(async function main() {
  const now = new Date();
  const waitMins = 5;
  const fiveMinutesFromNow = new Date(
    now.setMinutes(now.getMinutes() + waitMins)
  );
  console.log(`Waiting up to ${waitMins} minutes for API sever...`);

  while (new Date() < fiveMinutesFromNow) {
    let up = false;
    try {
      up = await apiServerIsUp(
        "http://localhost:1080/api/v1/end-user-agreement/latest"
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
