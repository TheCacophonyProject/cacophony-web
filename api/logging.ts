import config from "./config";
import winston, { format } from "winston";
import expressWinston from "express-winston";

export const consoleTransport = new winston.transports.Console({
  level: config.server.loggerLevel,
  format: format.combine(format.colorize(), format.splat(), format.simple()),
  handleExceptions: true,
});

const logger = winston.createLogger({
  transports: [consoleTransport],
  exitOnError: false,
});

export const addExpressApp = (app) => {
  app.use(
    expressWinston.logger({
      transports: [consoleTransport],
      meta: false,
      expressFormat: true,
    })
  );
};

export default logger;
