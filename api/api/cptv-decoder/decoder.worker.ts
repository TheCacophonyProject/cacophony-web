import { parentPort } from "worker_threads";
import type { CptvFrame, CptvFrameHeader, CptvHeader } from "./decoder.js";
import type { CptvDecoderContext as DecoderContext } from "./decoder/cptv_decoder.js";
const context = parentPort;
import init, { CptvDecoderContext } from "./decoder/cptv_decoder.js";
import { readFileSync } from "fs";
import type { ReadableStream } from "stream/web";
import { fileURLToPath } from "url";
import path from "path";

class Unlocker {
  fn: (() => void) | null = null;
  constructor() {
    this.fn = null;
  }
  unlock() {
    this.fn && this.fn();
  }
}

// For use in nodejs to wrap an already loaded array buffer into a Reader interface
const FakeReader = (
  bytes: Uint8Array,
  maxChunkSize = 0
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
          state.offsets[state.offset]
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
    releaseLock() {},
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
  private response: Response | null = null;
  private reader: ReadableStreamDefaultReader | null = null;
  private playerContext: DecoderContext | null = null;
  private expectedSize = 0;
  private inited = false;
  private currentContentType = "application/x-cptv";
  streamError: string | null = null;

  free() {
    this.framesRead = 0;
    this.locked = false;
    this.consumed = false;
    this.inited = false;
    this.prevFrameHeader = null;
    this.playerContext && this.playerContext.free();
    this.reader && this.reader.cancel();
    this.streamError = null;
    this.reader = null;
    this.playerContext = null;
  }

  hasValidContext() {
    return !!this.playerContext;
  }

  async initWithFileBytes(fileBytes: Uint8Array) {
    this.free();
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
      // eslint-disable-next-line no-undef
      const __dirname = path.dirname(__filename);
      const wasm = readFileSync(
        path.join(__dirname, "./decoder/cptv_decoder_bg.wasm")
      );
      await init(wasm);
      this.playerContext = CptvDecoderContext.newWithReadableStream(
        this.reader
      );
      this.inited = true;
      result = true;
    } catch (e) {
      this.streamError = e;
      result = `Failed to load CPTV file, ${e}`;
    }
    unlocker.unlock();
    this.locked = false;
    return result;
  }

  async initWithReadableStream(stream: ReadableStream) {
    this.free();
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
        // eslint-disable-next-line no-undef
        const __dirname = path.dirname(__filename);
        wasmBytes = readFileSync(
          path.join(__dirname, "./decoder/cptv_decoder_bg.wasm")
        );
      }
      await init(wasmBytes);
      this.playerContext = CptvDecoderContext.newWithReadableStream(
        this.reader
      );
      this.inited = true;
      result = true;
    } catch (e) {
      this.streamError = e;
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
    (CptvHeader & { duration: number; totalFrames: number }) | string
  > {
    const header = await this.getHeader();
    let totalFrameCount = 0;
    if (this.hasStreamError()) {
      return this.streamError;
    } else {
      if ((header as CptvHeader).totalFrames) {
        totalFrameCount = (header as CptvHeader).totalFrames;
      } else {
        let frame: CptvFrame | null;
        let num = 0;
        while (
          (frame = await (this.playerContext as DecoderContext).nextFrame())
        ) {
          if (!frame.isBackgroundFrame) {
            num++;
          }
        }
        totalFrameCount = num;
      }
      if (this.hasStreamError()) {
        return this.streamError;
      }
      const duration = (1 / (header as CptvHeader).fps) * totalFrameCount;
      return {
        ...(header as CptvHeader),
        duration,
        totalFrames: totalFrameCount,
      };
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
    if (initedResult === true) {
      const meta = await this.getMetadata();
      this.reader && (this.reader as any).releaseLock();
      return meta;
    }
    this.reader && (this.reader as any).releaseLock();
    return initedResult as string;
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

  async getHeader() {
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
          const h: any = { ...header };
          h.deviceName = h.deviceName.inner;
          if (h.brand) {
            h.brand = h.brand.inner;
          }
          if (h.model) {
            h.model = h.model.inner;
          }
          if (h.firmwareVersion) {
            h.firmwareVersion = h.firmwareVersion.inner;
          }
          if (h.motionConfig) {
            h.motionConfig = h.motionConfig.inner;
          }
          return h;
        }
        return null;
      }
    }
    return this.streamError;
  }

  hasStreamError(): boolean {
    return this.streamError !== null;
  }
}

const player = new CptvDecoderInterface();
context.addListener("message", async (data) => {
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
        const result = await player.getStreamMetadata(data.streamReader);
        context.postMessage({ type: data.type, data: result });
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
    case "freeResources":
      {
        player.free();
        context.postMessage({ type: data.type, data: true });
      }
      break;
    default:
      context.postMessage(data);
      return;
  }
});
context.postMessage({ type: "init" });
export default {};
