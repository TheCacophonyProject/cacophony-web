import config from "./config";
import winston, { format } from "winston";

export const consoleTransport = new winston.transports.Console({
  level: config.server.loggerLevel,
  format: format.combine(format.colorize(), format.splat(), format.simple()),
  handleExceptions: true,
});

const logger = winston.createLogger({
  levels: winston.config.syslog.levels,
  transports: [consoleTransport],
  exitOnError: false,
});

export default logger;
