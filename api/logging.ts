import config from "./config.js";
import winston from "winston";
import { asyncLocalStorage } from "./Globals.js";
import { HttpStatusCode } from "@typedefs/api/consts.js";
const { format } = winston;

export const colourForStatusCode = (code: number | HttpStatusCode): string => {
  if (code >= 200 && code < 300) {
    return `\x1b[32m${code}\x1b[0m`;
  } else if (code >= 300 && code < 400) {
    return `\x1b[36m${code}\x1b[0m`;
  } else if (code >= 400 && code < 500) {
    return `\x1b[33m${code}\x1b[0m`;
  } else {
    return `\x1b[1;31m${code}\x1b[0m`;
  }
};

function getContrastingBackgroundAnsi(fgColorId: number) {
  let bgId = 16;
  if (
    fgColorId == 16 ||
    fgColorId == 8 ||
    (fgColorId > 231 && fgColorId < 242)
  ) {
    bgId = 251;
  }
  // Returns format: \x1b[38;5;<FG>;48;5;<BG>m
  return `\x1b[38;5;${fgColorId};48;5;${bgId}m`;
}

function hash8(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    // Standard polynomial rolling hash (DJB2/Java style)
    hash = (hash << 5) - hash + str.charCodeAt(i);
    // Convert to 32bit integer
    hash |= 0;
  }
  // Truncate to 8 bits (0-255)
  return Math.abs(hash) % 256;
}

export const consoleTransport = new winston.transports.Console({
  level: config.server.loggerLevel,
  format: format.combine(
    format((info) => {
      const asyncStore = asyncLocalStorage && asyncLocalStorage.getStore();
      if (asyncStore) {
        const requestId = asyncStore.get("requestId") as string;
        if (requestId) {
          // Give each requestId a unique colour
          const stub = requestId.split("-")[0];
          const requestIdStub = `${getContrastingBackgroundAnsi(hash8(stub))}${stub}\x1b[0m`;
          const lines = `${info.message}`.split("\n");
          const allLines = [];
          const isFinalRequestMessage = lines.some((line) =>
            line.includes("UA:"),
          );
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            let splitLines;
            if (i === 0 && isFinalRequestMessage) {
              // First line is `${method} ${url}`, so break it appropriately if over 80 chars
              splitLines = [];
              const parts = line.split(" ");
              const methodStub = parts[0];
              const firstLineEnd = 80 - (methodStub.length + 1);
              const rest = parts.slice(1).join(" ");
              const restBroken = rest.substring(0, firstLineEnd);
              const remainder = rest.substring(firstLineEnd);
              const chunks = remainder.match(/.{1,80}/g) || [];
              splitLines.push(parts[0] + " " + restBroken);
              if (chunks.length) {
                splitLines.push(...chunks);
              }
            } else {
              splitLines = line.match(/.{1,80}(\s|$)/g);
            }
            allLines.push(...splitLines);
          }
          const padding = ``.padStart(7 - info.level.length, " ");
          const paddedMessage = [];
          paddedMessage.push(`${padding}${requestIdStub}: ${allLines[0]}`);
          if (allLines.length > 1) {
            const paddingPlusRequestId = ``.padStart(19, " ");
            for (let i = 1; i < allLines.length; i++) {
              paddedMessage.push(`${paddingPlusRequestId}${allLines[i]}`);
            }
          }

          // Colourize status codes, response time block

          info.message = paddedMessage.join("\n");
        }
      }
      return info;
    })(),
    format.colorize(),
    format.splat(),
    format.simple(),
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

  logger.debug = (_message: string | object, ..._meta): winston.Logger => {
    return logger;
  };
}

export default logger;
