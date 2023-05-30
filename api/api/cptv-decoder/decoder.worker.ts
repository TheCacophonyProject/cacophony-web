import { parentPort } from "worker_threads";
import type { CptvFrameHeader, CptvHeader } from "./decoder.js";
import type { CptvPlayerContext as PlayerContext } from "./decoder/decoder.js";
const context = parentPort;
import init, { CptvPlayerContext } from "./decoder/decoder.js";
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
const FakeReader = (bytes: Uint8Array, maxChunkSize = 0): Reader => {
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
  };
};

interface Reader {
  cancel: () => Promise<void>;
  read: () => Promise<{ value: Uint8Array; done: boolean }>;
}

let wasmBytes: Buffer;
class CptvDecoderInterface {
  private framesRead = 0;
  private locked = false;
  private consumed = false;
  private prevFrameHeader: CptvFrameHeader | null = null;
  private response: Response | null = null;
  private reader: Reader | null = null;
  private playerContext: PlayerContext | null = null;
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
    this.playerContext && this.playerContext.ptr && this.playerContext.free();
    this.reader && this.reader.cancel();
    this.streamError = null;
    this.reader = null;
    this.playerContext = null;
  }

  hasValidContext() {
    return this.playerContext && this.playerContext.ptr;
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
        path.join(__dirname, "./decoder/decoder_bg.wasm")
      );
      const _wasmInstance = await init(wasm);
      this.playerContext = await CptvPlayerContext.newWithStream(this.reader);
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
    this.reader = stream.getReader() as Reader;
    let result;
    try {
      if (!wasmBytes) {
        const __filename = fileURLToPath(import.meta.url);
        // eslint-disable-next-line no-undef
        const __dirname = path.dirname(__filename);
        wasmBytes = readFileSync(
          path.join(__dirname, "./decoder/decoder_bg.wasm")
        );
      }
      const _wasmInstance = await init(wasmBytes);
      this.playerContext = await CptvPlayerContext.newWithStream(this.reader);
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
    if (this.hasValidContext()) {
      try {
        this.playerContext = await CptvPlayerContext.fetchNextFrame(
          this.playerContext as PlayerContext
        );
      } catch (e) {
        this.streamError = e as string;
      }
      if (
        !this.playerContext ||
        (this.playerContext && !this.playerContext.ptr)
      ) {
        //debugger;
      }
    } else {
      console.warn("Fetch next failed");
    }
    unlocker.unlock();
    this.locked = false;
    if (this.hasStreamError()) {
      return null;
    }
    if (this.hasValidContext()) {
      const frameData = (this.playerContext as PlayerContext).getNextFrame();
      const frameHeader = (
        this.playerContext as PlayerContext
      ).getFrameHeader();
      // NOTE(jon): Work around a bug where the mlx sensor doesn't report timeOn times, just hardcodes 60000
      if (frameHeader && frameHeader.imageData.width !== 32) {
        const sameFrameAsPrev =
          frameHeader &&
          this.prevFrameHeader &&
          frameHeader.timeOnMs === this.prevFrameHeader.timeOnMs;
        if (sameFrameAsPrev && this.getTotalFrames() === null) {
          this.prevFrameHeader = frameHeader;
          return null; //await this.fetchNextFrame();
        }
        this.prevFrameHeader = frameHeader;
      }
      if (frameData.length === 0) {
        return null;
      }
      this.framesRead++;
      return { data: new Uint16Array(frameData), meta: frameHeader };
    }
    return null;
  }

  async countTotalFrames(): Promise<number | null> {
    if (!this.reader) {
      console.warn(
        "You need to initialise the player with the url of a CPTV file"
      );
      return 0;
    }
    if (this.hasValidContext()) {
      const unlocker = new Unlocker();
      await this.lockIsUncontended(unlocker);
      this.locked = true;
      try {
        this.playerContext = await CptvPlayerContext.countTotalFrames(
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          this.playerContext!
        );
      } catch (e) {
        this.streamError = e as string;
      }
      // We can't call any other methods that read frame data on this stream,
      // since we've exhausted it and thrown away the data after scanning for the info we want.
      this.consumed = true;
      unlocker.unlock();
      this.locked = false;
    }
    return this.getTotalFrames();
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
        totalFrameCount = await this.countTotalFrames();
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

  async getHeader(): Promise<CptvHeader | string> {
    if (!this.reader) {
      return "You need to initialise the player with the url of a CPTV file";
    }
    if (this.hasValidContext()) {
      const unlocker = new Unlocker();
      await this.lockIsUncontended(unlocker);
      this.locked = true;
      this.playerContext = await CptvPlayerContext.fetchHeader(
        this.playerContext as PlayerContext
      );
      const header = (this.playerContext as PlayerContext).getHeader();
      if (header === "Unable to parse header") {
        this.streamError = header;
      }
      unlocker.unlock();
      this.locked = false;
      return header;
    }
    return this.streamError;
  }

  getTotalFrames() {
    if (this.streamError) {
      return this.framesRead;
    }
    if (
      !this.locked &&
      this.inited &&
      this.hasValidContext() &&
      (this.playerContext as PlayerContext).streamComplete()
    ) {
      return (this.playerContext as PlayerContext).totalFrames();
    }
    return null;
  }

  getLoadProgress(): number | null {
    if (this.locked || !this.hasValidContext()) {
      return null;
    }
    // This doesn't actually tell us how much has downloaded, just how much has been lazily read.
    return (
      (this.playerContext as PlayerContext).bytesLoaded() / this.expectedSize
    );
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
    case "getTotalFrames":
      {
        const totalFrames = player.getTotalFrames();
        context.postMessage({ type: data.type, data: totalFrames });
      }
      break;
    case "getLoadProgress":
      {
        const progress = player.getLoadProgress();
        context.postMessage({ type: data.type, data: progress });
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
