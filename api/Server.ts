import type { Application, NextFunction, Request, Response } from "express";
import express from "express";
import passport from "passport";
import process from "process";
import http from "http";
import config from "./config.js";
import modelsInit from "@models/index.js";
import log, { consoleTransport } from "@log";
import customErrors from "./api/customErrors.js";
import { openS3 } from "./models/util/util.js";
import initialiseApi from "./api/V1/index.js";
import expressWinston from "express-winston";
import { exec } from "child_process";
import { promisify } from "util";
import { v4 as uuidv4 } from "uuid";
import { Op } from "sequelize";
import {
  asyncLocalStorage,
  CACOPHONY_WEB_VERSION,
  SuperUsers,
} from "./Globals.js";
import path from "path";
import { fileURLToPath } from "url";

const asyncExec = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const maybeRecompileJSONSchemaDefinitions = async (): Promise<void> => {
  if (!config.productionEnv) {
    log.info("Checking if type schemas need recompilation");
    const { stdout } = await asyncExec("cd ../types && node build-schemas.js");
    //const { stdout, stderr } = await asyncExec("cd ../types && npm run generate-schemas");
    log.info("Stdout: %s", stdout);
  }
  return;
};

const loadCacophonyWebVersion = async (): Promise<void> => {
  const { stdout, stderr } = await asyncExec("dpkg -s cacophony-web | cat");
  for (const line of [...stderr.split("\n"), ...stdout.split("\n")]) {
    if (line.startsWith("Version: ")) {
      CACOPHONY_WEB_VERSION.version = line.replace("Version: ", "").trim();
      break;
    }
  }
};

const openHttpServer = (app): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!config.server.http.active) {
      resolve();
    }
    try {
      log.notice("Starting http server on %d", config.server.http.port);
      http.createServer(app).listen(config.server.http.port);
      resolve();
    } catch (err) {
      reject(err);
    }
  });
};

export const delayMs = async (delayMs: number) =>
  new Promise((resolve) => setTimeout(resolve, delayMs));

// Returns a Promise that will resolve if it could connect to the S3 file storage
// and reject if connection failed.
const checkS3Connection = async (): Promise<void> => {
  const s3 = openS3();
  log.notice("Connecting to S3.....");
  try {
    await s3.headBucket(config.s3Local.bucket);
    log.notice("Connected to S3.");
  } catch (err) {
    if (err) {
      log.error("Error with connecting to S3. %s", err);
    }
  }
};

(async () => {
  log.notice("Starting Full Noise.");
  await config.loadConfigFromArgs(true);

  await loadCacophonyWebVersion();
  // Check if any of the Cacophony type definitions have changed, and need recompiling?
  if (config.server.loggerLevel === "debug") {
    log.notice("productionEnv %s", config.productionEnv);
    log.notice("Running in DEBUG mode");
    await maybeRecompileJSONSchemaDefinitions();
  } else {
    log.notice("Running in RELEASE mode");
  }
  const app: Application = express();

  app.use((request: Request, response: Response, next: NextFunction) => {
    // Add a unique request ID to each API request, for logging purposes.
    asyncLocalStorage.enterWith(new Map());
    (asyncLocalStorage.getStore() as Map<string, any>).set(
      "requestId",
      uuidv4()
    );
    log.info("UA: %s", request.headers["user-agent"]);
    next();
  });
  app.use(
    expressWinston.logger({
      transports: [consoleTransport],
      meta: false,
      metaField: null,
      msg: (req: Request, res: Response): string => {
        const dbQueryCount = (
          asyncLocalStorage.getStore() as Map<string, any>
        )?.get("queryCount");

        const dbQueryTime = (
          asyncLocalStorage.getStore() as Map<string, any>
        )?.get("queryTime");

        return `${req.method} ${req.url} => Status(${res.statusCode}) ${
          dbQueryCount
            ? `(${dbQueryCount} DB queries over ${dbQueryTime}ms) `
            : ""
        }[${(res as any).responseTime}ms]`;
      },
    })
  );
  app.use(
    express.raw({
      inflate: true,
      limit: "50Mb",
      type: "application/octet-stream",
    })
  );
  app.use(express.urlencoded({ extended: false, limit: "50Mb" }));
  app.use(express.json({ limit: "50Mb" }));
  app.use(passport.initialize());
  // Adding API documentation
  app.use(express.static(__dirname + "/apidoc"));

  // Adding headers to allow cross-origin HTTP request.
  // This is so the web interface running on a different port/domain can access the API.
  // This could cause security issues with Cookies but JWTs are used instead of Cookies.
  app.all("*", (request: Request, response: Response, next: NextFunction) => {
    response.header("Access-Control-Allow-Origin", request.headers.origin);
    response.header(
      "Access-Control-Allow-Methods",
      "PUT, GET, POST, DELETE, OPTIONS, PATCH"
    );
    response.header(
      "Access-Control-Allow-Headers",
      "where, offset, limit, Authorization, Origin, X-Requested-With, Content-Type, Accept, Viewport, if-none-match, cache-control"
    );
    next();
  });
  await initialiseApi(app);
  app.use(customErrors.errorHandler);

  // FIXME / TODO
  // app.use((request: Request, res: Response, next: NextFunction) => {
  //   // Extract deprecation warnings, stick them onto response.locals.warnings
  //   const result = validationResult(request);
  //   log.warning("validation %s", result);
  // });

  log.notice("Initialising Sequelize models");
  const models = await modelsInit();

  log.notice("Connecting to database.....");
  try {
    await models.sequelize.authenticate();
    log.info("Connected to database.");

    {
      // We grab all the users with super user credentials, and store those
      // credentials in a global map, so that we can avoid doing a db lookup to
      // get the user from the user JWT token id on every request.  Usually a
      // user id is all that is needed, with the exception of super user
      // permissions, but since there are only a handful of super users, it's
      // fine to preload and cache that information up front.
      log.notice("Preload and cache super user permissions.");
      log.notice(
        "If super-user permissions are changed, manually restart API server."
      );
      const superUsers = await models.User.findAll({
        where: { globalPermission: { [Op.ne]: "off" } },
      });
      for (const superUser of superUsers) {
        SuperUsers.set(superUser.id, superUser.globalPermission);
      }
    }

    await checkS3Connection();
    await openHttpServer(app);
  } catch (error) {
    log.error(error.toString());
    process.exit(2);
  }
})();
