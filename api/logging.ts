import config from "./config";
import winston, { format } from "winston";
import { asyncLocalStorage } from "./Server";

export const consoleTransport = new winston.transports.Console({
  level: config.server.loggerLevel,
  format: format.combine(
    format((info) => {
      const asyncStore = asyncLocalStorage.getStore() as Map<string, string>;
      if (asyncStore) {
        const requestId = asyncStore.get("requestId");
        if (requestId) {
          info.message = `${requestId.split("-")[0]}: ${info.message}`;
        }
      }
      return info;
    })(),
    format.colorize(),

    format.splat(),
    format.simple()
  ),
  handleExceptions: true,
});

const logger = winston.createLogger({
  levels: winston.config.syslog.levels,
  transports: [consoleTransport],
  exitOnError: false,
});

if (config.server.loggerLevel !== "debug") {
  // nop out debug logs, so we don't make our production logs massive.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  logger.debug = function (message: string) {
    return this;
  }.bind(logger);
}

export default logger;
