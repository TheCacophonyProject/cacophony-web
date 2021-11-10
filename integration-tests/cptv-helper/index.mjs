import express from "express";
import {createTestCptvFile} from "cptv-decoder/encoder.js";
(async () => {
  const app = express();
  const port = 5000;
  app.post('/', async (req, res) => {
    const file = await createTestCptvFile({});
    res.send(Buffer.from(file));
  });
  app.listen(port, () => {
    console.log("starting cptv-helper");
  });
})();
