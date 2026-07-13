import * as util from "node:util";
import * as child_process from "node:child_process";
import { expect, test } from "@playwright/test";
const exec = util.promisify(child_process.exec);

export const dockerExecNodeScript = async (
  scriptFile: string,
  args: string[] = [],
): Promise<{ stdout: string; stderr: string }> => {
  return await test.step(`Execute script in docker: '${scriptFile}${args.length ? " " + args.join(" ") : ""}'`, async () => {
    const result = await exec(
      `cd ../api && docker exec cacophony-web bash -lc "cd api && node --no-warnings --disable-warning=ExperimentalWarning --loader esm-module-alias/loader --experimental-json-modules ./scripts/${scriptFile} ${args.join(" ")}"`,
    );
    expect(result.stderr, "command executed without raising error").toEqual("");
    return result;
  });
};

export const dockerExecNodeTestScript = async (
  scriptFile: string,
  args: string[] = [],
): Promise<{ stdout: string; stderr: string }> => {
  return dockerExecNodeScript(`test-scripts/${scriptFile}`, args);
};
