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
  RequesterStore,
  RouteStore,
  SuperUsers,
} from "./Globals.js";
import path from "path";
import { fileURLToPath } from "url";
import type { UserId } from "@typedefs/api/common.js";

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

export const userShouldBeRateLimited = (requesterId: UserId): boolean => {
  // NOTE: Check how much user time this user has used in the last minute in RequesterStore,
  //  If it's over 20% (20 seconds) rate limit this user.
  //  Also, if there are no other users currently using the platform in the last minute, don't rate limit.
  const numUserRequesters = Array.from(RequesterStore.keys()).reduce(
    (acc, userId) => {
      if (userId.startsWith("u")) {
        acc++;
      }
      return acc;
    },
    0
  );
  const numRequesters = RequesterStore.size;
  if (numUserRequesters > 2 || numRequesters > 10) {
    const userTimings = RequesterStore.get(`u${requesterId}`);
    if (userTimings) {
      let userTimeInLastMinute = 0;
      for (const timing of userTimings) {
        const elapsed = process.hrtime(timing.time);
        const elapsedMs = elapsed[0] * 1000 + elapsed[1] / 1000000;
        if (elapsedMs <= 1000 * 60) {
          userTimeInLastMinute += timing.user;
        }
      }
      if (userTimeInLastMinute > 20000) {
        return true;
      }
    }
  }
  return false;
};

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

  app.use((request: Request, _response: Response, next: NextFunction) => {
    // Add a unique request ID to each API request, for logging purposes.
    asyncLocalStorage.enterWith(new Map());
    const store = asyncLocalStorage.getStore() as Map<string, any>;
    store.set("requestId", uuidv4());
    const startUsage = process.cpuUsage();
    store.set("cpuUsage", startUsage);
    log.info("UA: %s", request.headers["user-agent"]);
    next();
  });
  app.use(
    expressWinston.logger({
      transports: [consoleTransport],
      meta: false,
      metaField: null,
      msg: (request: Request, response: Response): string => {
        const store = asyncLocalStorage.getStore() as Map<string, any>;
        const dbQueryCount = store?.get("queryCount");
        const dbQueryTime = store?.get("queryTime");
        const cpuUsage = store?.get("cpuUsage");
        const requestCpuUsage = process.cpuUsage(cpuUsage);
        const userTimeMs = requestCpuUsage.user / 1000;
        const systemTimeMs = requestCpuUsage.system / 1000;
        const requesterType = !response.locals.requestUser
          ? "user"
          : !response.locals.deviceUser
          ? "device"
          : "unknown";
        let requester = `u9999`;
        if (requesterType === "user") {
          requester = `u${response.locals.requestUser?.id}`;
        } else if (requesterType === "device") {
          requester = `d${response.locals.deviceUser?.id}`;
        }
        const wasRateLimited =
          response.locals.requestUser?.wasRateLimited || false;

        const storeUser = RequesterStore.get(requester);
        if (!storeUser) {
          RequesterStore.set(requester, []);
        }
        {
          const timings = RequesterStore.get(requester);
          // Remove items for this user older than 5 minutes.
          while (timings.length > 0) {
            const elapsed = process.hrtime(timings[0].time);
            const elapsedMs = elapsed[0] * 1000 + elapsed[1] / 1000000;
            if (elapsedMs > 60000 * 5) {
              timings.shift();
            } else {
              break;
            }
          }
        }
        RequesterStore.get(requester).push({
          time: process.hrtime(),
          user: userTimeMs,
          system: systemTimeMs,
        });

        const routeParts = [];
        for (const part of (request.method + request.url.split("?")[0]).split(
          "/"
        )) {
          if (Number(part).toString() === part) {
            routeParts.push("XXX");
          } else {
            routeParts.push(part);
          }
        }
        const routeKeyNormalised = routeParts.join("/");
        const routeTimings = RouteStore.get(routeKeyNormalised);
        if (!routeTimings) {
          RouteStore.set(routeKeyNormalised, []);
        }
        {
          const timings = RouteStore.get(routeKeyNormalised);
          // Remove items for this user older than 5 minutes.
          while (timings.length > 0) {
            const elapsed = process.hrtime(timings[0].time);
            const elapsedMs = elapsed[0] * 1000 + elapsed[1] / 1000000;
            if (elapsedMs > 60000 * 5) {
              timings.shift();
            } else {
              break;
            }
          }
        }
        RouteStore.get(routeKeyNormalised).push({
          time: process.hrtime(),
          user: userTimeMs,
          system: systemTimeMs,
        });

        return `${request.method} ${request.url}\n\t\t Status(${
          response.statusCode
        })\n\t\t ${
          dbQueryCount
            ? `${dbQueryCount} DB queries taking ${dbQueryTime}ms `
            : ""
        }[${
          (response as any).responseTime
        }ms total response time, ${userTimeMs}ms user, ${systemTimeMs}ms system${
          wasRateLimited ? ", was rate limited" : ""
        }]`;
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

    // NOTE: We've seen an instance where the HOST request header is rewritten by the client, which would otherwise break
    //  some things.  If the host is unknown, default to browse-next.
    if (!request.headers.host.includes("cacophony.org.nz")) {
      request.headers.host = "https://browse-next.cacophony.org.nz";
    }
    next();
  });

  app.get("/api/v1/timings", (request: Request, response: Response) => {
    const userTimings = [];
    const routeTimings = [];
    const usersToRemove = [];
    const routesToRemove = [];
    for (const [userId, timings] of RequesterStore) {
      // Remove timings older than 5 mins
      while (timings.length > 0) {
        const elapsed = process.hrtime(timings[0].time);
        const elapsedMs = elapsed[0] * 1000 + elapsed[1] / 1000000;
        if (elapsedMs > 60000 * 5) {
          timings.shift();
        } else {
          break;
        }
      }
      if (timings.length === 0) {
        // Remove user
        usersToRemove.push(userId);
      } else {
        userTimings.push({
          userId,
          timings: timings.reduce(
            (acc, timing) => {
              acc.user += timing.user;
              acc.system += timing.system;
              return acc;
            },
            { user: 0, system: 0 }
          ),
          detail: timings,
        });
      }
    }
    for (const userId of usersToRemove) {
      RequesterStore.delete(userId);
    }
    if (userTimings.length) {
      userTimings.sort((a, b) => b.timings.user - a.timings.user);
    }
    for (const [route, timings] of RouteStore) {
      // Remove timings older than 5 mins
      while (timings.length > 0) {
        const elapsed = process.hrtime(timings[0].time);
        const elapsedMs = elapsed[0] * 1000 + elapsed[1] / 1000000;
        if (elapsedMs > 60000 * 5) {
          timings.shift();
        } else {
          break;
        }
      }
      if (timings.length === 0) {
        // Remove user
        routesToRemove.push(route);
      } else {
        routeTimings.push({
          route,
          timings: timings.reduce(
            (acc, timing) => {
              acc.user += timing.user;
              acc.system += timing.system;
              return acc;
            },
            { user: 0, system: 0 }
          ),
          detail: timings,
        });
      }
    }
    for (const route of routesToRemove) {
      RouteStore.delete(route);
    }
    if (routeTimings.length) {
      routeTimings.sort((a, b) => b.timings.user - a.timings.user);
    }
    response.json({
      userTimings,
      routeTimings,
    });
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
        SuperUsers.set(superUser.id, {
          userName: superUser.userName,
          globalPermission: superUser.globalPermission,
        });
      }
    }

    await checkS3Connection();
    await openHttpServer(app);
  } catch (error) {
    log.error(error.toString());
    process.exit(2);
  }
})();
