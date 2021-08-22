import config from "./config";
import winston, { format } from "winston";

export const consoleTransport = new winston.transports.Console({
  // NOTE: We *don't* want to set a default logger level, since this overrides the set levels, and makes
  //  it impossible to use structured log level filtering in journalctl etc.
  // level: config.server.loggerLevel,
  format: format.combine(format.colorize(), format.splat(), format.simple()),
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
