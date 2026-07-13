import { workerData } from "worker_threads";
import type {
  CptvFrame,
  CptvFrameHeader,
  CptvHeader,
  CptvHeaderMapped,
} from "./decoder.js";
import type { CptvDecoderContext as DecoderContext } from "./decoder/cptv_decoder.js";
import type { MessagePort } from "node:worker_threads";
const context = workerData.port as MessagePort;
import init, { CptvDecoderContext } from "./decoder/cptv_decoder.js";
import { readFileSync } from "fs";
import type { ReadableStream } from "stream/web";
import { fileURLToPath } from "url";
import path from "path";
console.log = () => {
  /* empty */
};
// This lock is intended to prevent multiple commands from the parent thread running at once.
// Can that even happen in a single-threaded model though?  Will the new message be received before the
// previous one completes?
class Unlocker {
  fn: (() => void) | null = null;
  constructor() {
    this.fn = null;
  }
  unlock() {
    if (this.fn) {
      this.fn();
    }
  }
}

// For use in nodejs to wrap an already loaded array buffer into a Reader interface
const FakeReader = (
  bytes: Uint8Array,
  maxChunkSize = 0,
): ReadableStreamDefaultReader => {
  let state: { offsets: number[]; offset: number; bytes?: Uint8Array } = {
    offsets: [],
    offset: 0,
  };
  state.bytes = bytes;
  const length = bytes.byteLength;
  // How many reader chunks to split the file into
  let numParts = 5;
  if (maxChunkSize !== 0) {
    numParts = Math.ceil(length / maxChunkSize);
  }
  const percentages = length / numParts;
  for (let i = 0; i < numParts; i++) {
    state.offsets.push(Math.ceil(percentages * i));
  }
  state.offsets.push(length);
  return {
    read(): Promise<{ value: Uint8Array; done: boolean }> {
      return new Promise((resolve) => {
        state.offset += 1;
        const value = state.bytes.slice(
          state.offsets[state.offset - 1],
          state.offsets[state.offset],
        );
        resolve({
          value,
          done: state.offset === state.offsets.length - 1,
        });
      });
    },
    cancel(): Promise<void> {
      // Reset state
      delete state.bytes;
      state = {
        offsets: [],
        offset: 0,
      };
      return new Promise((resolve) => {
        resolve();
      });
    },
    releaseLock() {
      return;
    },
    closed: new Promise((resolve) => {
      resolve(undefined);
    }),
  };
};

let wasmBytes: Buffer;
class CptvDecoderInterface {
  private framesRead = 0;
  private locked = false;
  private consumed = false;
  private prevFrameHeader: CptvFrameHeader | null = null;
  private reader: ReadableStreamDefaultReader | null = null;
  private playerContext: DecoderContext | null = null;
  private expectedSize = 0;
  private inited = false;
  streamError: string | null = null;

  async free() {
    this.framesRead = 0;
    this.expectedSize = 0;
    this.locked = false;
    this.consumed = false;
    this.inited = false;
    this.prevFrameHeader = null;
    if (this.playerContext) {
      this.playerContext.free();
    }
    if (this.reader && this.reader.cancel) {
      try {
        await this.reader.cancel();
      } catch (_e) {
        // Do nothing
      }
      try {
        this.reader.releaseLock();
      } catch (_e) {
        // Do nothing
      }
    }
    this.streamError = null;
    this.reader = null;
    this.playerContext = null;
  }

  hasValidContext() {
    return !!this.playerContext;
  }

  async initWithFileBytes(fileBytes: Uint8Array) {
    try {
      await this.free();
    } catch (_e) {
      // Do nothing
    }
    this.framesRead = 0;
    this.streamError = null;
    const unlocker = new Unlocker();
    await this.lockIsUncontended(unlocker);
    this.locked = true;

    this.reader = FakeReader(fileBytes, 100000);
    this.expectedSize = fileBytes.length;
    let result;
    try {
      const __filename = fileURLToPath(import.meta.url);

      const __dirname = path.dirname(__filename);
      const wasm = readFileSync(
        path.join(__dirname, "./decoder/cptv_decoder_bg.wasm"),
      );
      await init(wasm);
      this.playerContext = CptvDecoderContext.newWithReadableStream(
        this.reader,
      );
      this.inited = true;
      result = true;
    } catch (e: unknown) {
      if (typeof e === "string") {
        this.streamError = e;
      }
      result = `Failed to load CPTV file, ${e}`;
    }
    unlocker.unlock();
    this.locked = false;
    return result;
  }

  async initWithReadableStream(stream: ReadableStream) {
    try {
      await this.free();
    } catch (_e) {
      // Do nothing
    }
    this.framesRead = 0;
    this.streamError = null;
    const unlocker = new Unlocker();
    await this.lockIsUncontended(unlocker);
    this.locked = true;
    this.reader = stream.getReader() as ReadableStreamDefaultReader;
    let result;
    try {
      if (!wasmBytes) {
        const __filename = fileURLToPath(import.meta.url);

        const __dirname = path.dirname(__filename);
        wasmBytes = readFileSync(
          path.join(__dirname, "./decoder/cptv_decoder_bg.wasm"),
        );
      }
      await init(wasmBytes);
      this.playerContext = CptvDecoderContext.newWithReadableStream(
        this.reader,
      );
      this.inited = true;
      result = true;
    } catch (e: unknown) {
      if (typeof e === "string") {
        this.streamError = e;
      }
      result = `Failed to load CPTV file, ${e}`;
    }
    unlocker.unlock();
    this.locked = false;
    return result;
  }

  async fetchNextFrame() {
    if (!this.inited) {
      return null;
    }
    if (!this.reader) {
      console.warn("You need to initialise the player with a CPTV file stream");
      return null;
    }
    if (this.consumed) {
      console.warn("Stream has already been consumed and discarded");
      return null;
    }
    const unlocker = new Unlocker();
    await this.lockIsUncontended(unlocker);
    this.locked = true;
    let frameData: CptvFrame | null | string = null;
    if (this.hasValidContext()) {
      frameData = await (this.playerContext as DecoderContext).nextFrameOwned();
      if (typeof frameData === "string") {
        this.streamError = frameData as string;
      } else {
        this.streamError = null;
      }
    }
    unlocker.unlock();
    this.locked = false;
    if (this.hasStreamError()) {
      return null;
    }
    if (frameData && typeof frameData === "object") {
      const sameFrameAsPrev =
        frameData &&
        this.prevFrameHeader &&
        frameData.timeOnMs === this.prevFrameHeader.timeOnMs;
      if (sameFrameAsPrev) {
        this.prevFrameHeader = frameData;
        return null;
      }
      this.prevFrameHeader = frameData;
    }
    if (!frameData) {
      return null;
    }
    this.framesRead++;
    return frameData;
  }

  async getMetadata(): Promise<
    | (CptvHeaderMapped & {
        duration: number;
        totalFrames: number;
        firstFrame?: CptvFrame;
      })
    | string
  > {
    const header = await this.getHeader();
    let totalFrameCount = 0;
    let firstFrame: CptvFrame | null = null;
    if (this.hasStreamError() && typeof header === "string") {
      return this.streamError;
    } else {
      const h = header as CptvHeaderMapped;
      if (h["totalFrames"]) {
        totalFrameCount = h["totalFrames"];
        let frame: CptvFrame | null;
        // Strictly speaking, we're not validating the file as non-corrupt here, since we don't
        // try to decode all of the frames.
        while (
          (frame = await (this.playerContext as DecoderContext).nextFrame())
        ) {
          if (!frame.isBackgroundFrame) {
            firstFrame = {
              ...frame,
              imageData: frame.imageData.slice(),
            };
            break;
          }
        }
      } else {
        let frame: CptvFrame | null;
        let num = 0;
        while (
          (frame = await (this.playerContext as DecoderContext).nextFrame())
        ) {
          if (!frame.isBackgroundFrame) {
            if (!firstFrame) {
              firstFrame = {
                ...frame,
                imageData: frame.imageData.slice(),
              };
            }
            num++;
          }
        }
        totalFrameCount = num;
      }
      if (this.hasStreamError()) {
        return this.streamError;
      }
      const duration = (1 / h.fps) * totalFrameCount;
      const payload: CptvHeaderMapped & {
        duration: number;
        totalFrames: number;
        firstFrame?: CptvFrame;
      } = {
        ...h,
        duration,
        totalFrames: totalFrameCount,
      };
      if (firstFrame) {
        payload.firstFrame = firstFrame;
      }
      return payload;
    }
  }

  async getBytesMetadata(fileBytes: Uint8Array) {
    const initedResult = await this.initWithFileBytes(fileBytes);
    if (initedResult === true) {
      return await this.getMetadata();
    }
    return initedResult as string;
  }

  async getStreamMetadata(stream: ReadableStream) {
    const initedResult = await this.initWithReadableStream(stream);
    try {
      if (initedResult === true) {
        return await this.getMetadata();
      }
      return initedResult as string;
    } finally {
      if (this.reader) {
        try {
          await this.reader.cancel();
        } catch (_e) {
          // Do nothing
        }
        try {
          this.reader.releaseLock();
        } catch (_e) {
          // Do nothing
        }
      }
      this.reader = null;
    }
  }

  async lockIsUncontended(unlocker: Unlocker) {
    return new Promise((resolve) => {
      if (this.locked) {
        unlocker.fn = resolve as () => void;
      } else {
        resolve(null);
      }
    });
  }

  async getHeader(): Promise<CptvHeaderMapped | string> {
    if (!this.reader) {
      return "You need to initialise the player with the url of a CPTV file";
    }
    let header: CptvHeader | string;
    if (this.hasValidContext()) {
      const unlocker = new Unlocker();
      await this.lockIsUncontended(unlocker);
      if (this.playerContext) {
        this.locked = true;

        header = await (this.playerContext as DecoderContext).getHeader();

        if (typeof header === "string") {
          this.streamError = header;
          console.warn(this.streamError);
        }

        unlocker.unlock();
        this.locked = false;
        if (typeof header === "object") {
          return {
            ...header,
            deviceName: header.deviceName.inner,
            brand: header.brand && header.brand.inner,
            model: header.model && header.model.inner,
            firmwareVersion:
              header.firmwareVersion && header.firmwareVersion.inner,
            motionConfig: header.motionConfig && header.motionConfig.inner,
          };
        }
      }
    }
    return this.streamError;
  }

  hasStreamError(): boolean {
    return this.streamError !== null;
  }
}

const player = new CptvDecoderInterface();
context.unref();
context.on("message", async (data) => {
  switch (data.type) {
    case "initWithLocalCptvFile":
      {
        const result = await player.initWithFileBytes(data.arrayBuffer);
        context.postMessage({ type: data.type, data: result });
      }
      break;
    case "initWithReadableStream":
      {
        const result = await player.initWithReadableStream(data.streamReader);
        context.postMessage({ type: data.type, data: result });
      }
      break;
    case "getBytesMetadata":
      {
        const header = await player.getBytesMetadata(data.arrayBuffer);
        context.postMessage({ type: data.type, data: header });
      }
      break;
    case "getStreamMetadata":
      {
        try {
          const result = await player.getStreamMetadata(data.streamReader);
          context.postMessage({ type: data.type, data: result });
        } catch (error) {
          context.postMessage({ type: data.type, data: error });
        }
      }
      break;
    case "getNextFrame":
      {
        const frame = await player.fetchNextFrame();
        context.postMessage({ type: data.type, data: frame });
      }
      break;
    case "getHeader":
      {
        const header = await player.getHeader();
        context.postMessage({ type: data.type, data: header });
      }
      break;
    case "hasStreamError":
      {
        const hasError = player.hasStreamError();
        context.postMessage({ type: data.type, data: hasError });
      }
      break;
    case "getStreamError":
      {
        const error = player.streamError;
        context.postMessage({ type: data.type, data: error });
      }
      break;
    case "reset":
      {
        try {
          await player.free();
        } catch (_e) {
          // Do nothing
        }
        context.postMessage({ type: data.type, data: true });
      }
      break;
    case "shutdown":
      {
        try {
          await player.free();
        } catch (_e) {
          // Do nothing
        }
        context.postMessage({ type: data.type, data: true });
        context.removeAllListeners();
        context.close();
      }
      break;
    default:
      context.postMessage(data);
      return;
  }
});
context.postMessage({ type: "init" });
export default {};
