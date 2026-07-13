/*
cacophony-api: The Cacophony Project API server
Copyright (C) 2018  The Cacophony Project

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published
by the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

import type { Application } from "express";
import fs from "fs";
import path from "path";
import logger from "@log";
import { fileURLToPath } from "url";
import config from "@config";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function (app: Application) {
  const excludedFiles = [
    "index.js",
    "util.js",
    "responseUtil.js",
    "recordingUtil.js",
    "eventUtil.js",
    "monitoringUtil.js",
    "monitoringPage.js",
    "monitoringVisit.js",
    "apidoc.js",
    "tagUtil.js",
    "trackMasking.js",
    "recordingsBulkQueryUtil.js",
  ];
  // Filter out files that are not added to app directly, and filter out typescript versions of files.
  const isProduction = config.productionEnv;
  const apiRoutes = fs
    .readdirSync(__dirname)
    .filter((file) => file.endsWith(".js") && !excludedFiles.includes(file))
    .filter(
      (file) => !isProduction || (isProduction && !file.endsWith(".test.js")),
    );
  for (const route of apiRoutes) {
    try {
      const routeModule = await import(path.join(__dirname, route));
      if (routeModule.default) {
        routeModule.default(app, "/api/v1");
      }
    } catch (e: unknown) {
      let message = `unknown route ${route}`;
      if (e instanceof Error) {
        message = e.message;
      }
      logger.warning(message);
    }
  }
}
