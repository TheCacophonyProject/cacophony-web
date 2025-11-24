import path from "path";
import fs from "fs";
import process from "process";
// Set some default configuration
const server = {
  loggerLevel: "info",
};
import { fileURLToPath } from "url";
import type { ServerConfig } from "@typedefs/api/serverConfig.js";
import LoadedServerConfigSchema from "@schemas/api/serverConfig/LoadedServerConfig.schema.json" with { type: "json" };
import { Ajv } from "ajv";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const timeZone = "Pacific/Auckland";

function loadConfigFromArgs(strict = false): Promise<ServerConfig> {
  return loadConfig(getConfigPathFromArgs(strict));
}

function getConfigPathFromArgs(strict = false): string {
  let configPath = "./config/app.js";
  for (let i = 2; i < process.argv.length; i++) {
    const val = process.argv[i];
    if (val.startsWith("--config=")) {
      configPath = val.split("=")[1];
    } else if (val == "--config") {
      i++;
      configPath = process.argv[i];
    } else if (strict) {
      throw new Error(
        `Cannot parse '${val}'.  The only accepted parameter is --config=<path-to-config-file>`,
      );
    }
  }
  return configPath;
}

export async function loadConfig(configPath: string): Promise<ServerConfig> {
  configPath = path.resolve(__dirname, configPath);
  const parts = configPath.split(".");
  parts.pop();
  // Try different file extensions until we find one that exists
  const possibleExtensions = ["mjs", "js"];
  const configBase = parts.join(".");
  for (const ext of possibleExtensions) {
    configPath = `${configBase}.${ext}`;
    if (fs.existsSync(configPath)) {
      break;
    }
  }
  checkConfigFileExists(configPath);
  const config = (await import(configPath)).default;
  // Validate server config against json schema:
  const ajv = new Ajv({
    allErrors: true,
  });
  const validate = ajv.compile(LoadedServerConfigSchema);
  const isValidConfig = validate(config);
  if (!isValidConfig) {
    console.log(validate.errors);
    throw new Error("Server config file validation failed");
  }
  return config as ServerConfig;
}

function checkConfigFileExists(configPath: string) {
  if (!fs.existsSync(configPath)) {
    throw (
      "Config file " +
      configPath +
      " does not exist. See README.md for config setup. " +
      "NB: The default config file has been renamed to ./config/app.js"
    );
  }
}

const loadedConfig = await loadConfigFromArgs();

export default {
  timeZone,
  server,
  euaVersion: 3,
  ...loadedConfig,
  productionEnv: !loadedConfig.server.isLocalDev,
} as ServerConfig;
