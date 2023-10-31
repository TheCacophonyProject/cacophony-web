import type { CptvFrameHeader } from "./decoder";
import { CptvPlayerContext } from "./decoder/decoder";
let ThisPlayerContext: any;

async function initWasm() {
  if (!ThisPlayerContext) {
    ThisPlayerContext = (await import("./decoder/decoder.js"))
      .CptvPlayerContext;
    console.log("Player context", ThisPlayerContext);
  }
}

class Unlocker {
  fn: (() => void) | null = null;
  constructor() {
    this.fn = null;
  }
  unlock() {
    this.fn && this.fn();
  }
}
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
    read(): Promise<ReadableStreamDefaultReadResult<any>> {
      return new Promise((resolve) => {
        state.offset += 1;
        const value = (state.bytes as Uint8Array).slice(
          state.offsets[state.offset - 1],
          state.offsets[state.offset]
        );
        resolve({
          value,
          done: (state.offset === state.offsets.length - 1) as any,
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

class CptvDecoderInterface {
  private framesRead = 0;
  private locked = false;
  private consumed = false;
  private prevFrameHeader: CptvFrameHeader | null = null;
  private response: Response | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private playerContext: CptvPlayerContext | null = null;
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

  async initWithRecordingIdAndSize(
    id: number,
    apiToken: string,
    apiRoot: string,
    size?: number
  ): Promise<string | boolean | Blob> {
    this.free();
    const unlocker = new Unlocker();
    await this.lockIsUncontended(unlocker);
    this.locked = true;
    try {
      this.consumed = false;
      const request = {
        mode: "cors",
        cache: "no-cache",
        headers: {
          Authorization: apiToken,
        },
        method: "get",
      };
      this.response = await fetch(
        `${apiRoot}/api/v1/recordings/raw/${id}`,
        request as RequestInit
      );
      if (this.response.status === 200) {
        if (this.response.body) {
          this.currentContentType =
            this.response.headers.get("Content-Type") || "application/x-cptv";
          if (!size) {
            size = Number(this.response.headers.get("Content-Length")) || 0;
          }
          this.expectedSize = size;
          if (this.currentContentType === "application/x-cptv") {
            this.reader =
              this.response.body.getReader() as ReadableStreamDefaultReader<Uint8Array>;
            await initWasm();
            this.playerContext = await ThisPlayerContext.newWithStream(
              this.reader
            );
          } else if (this.currentContentType === "image/webp") {
            return await this.response.blob();
          }
          unlocker.unlock();
          this.inited = true;
          this.locked = false;
          return true;
        }
        return "No body on response";
      } else {
        unlocker.unlock();
        this.locked = false;
        try {
          const r = await this.response.json();
          return (
            (r.messages && r.messages.pop()) || r.message || "Unknown error"
          );
        } catch (e) {
          return await this.response.text();
        }
      }
    } catch (e) {
      unlocker.unlock();
      this.locked = false;
      return `Failed to load CPTV url ${id}, ${e}`;
    }
  }

  async initWithCptvUrlAndSize(
    url: string,
    size?: number
  ): Promise<boolean | string> {
    this.free();
    const unlocker = new Unlocker();
    await this.lockIsUncontended(unlocker);
    this.locked = true;
    try {
      // Use this expired JWT token to test that failure case (usually when a page has been open too long)
      // const oldJWT = "https://api.cacophony.org.nz/api/v1/signedUrl?jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfdHlwZSI6ImZpbGVEb3dubG9hZCIsImtleSI6InJhdy8yMDIxLzA0LzE1LzQ3MGU2YjY1LWZkOTgtNDk4Ny1iNWQ3LWQyN2MwOWIxODFhYSIsImZpbGVuYW1lIjoiMjAyMTA0MTUtMTE0MjE2LmNwdHYiLCJtaW1lVHlwZSI6ImFwcGxpY2F0aW9uL3gtY3B0diIsImlhdCI6MTYxODQ2MjUwNiwiZXhwIjoxNjE4NDYzMTA2fQ.p3RAOX7Ns52JqHWTMM5Se-Fn-UCyRtX2tveaGrRmiwo";
      this.consumed = false;
      this.response = await fetch(url);
      if (this.response.status === 200) {
        if (this.response.body) {
          this.reader =
            this.response.body.getReader() as ReadableStreamDefaultReader<Uint8Array>;
          if (!size) {
            size = Number(this.response.headers.get("Content-Length")) || 0;
          }
          this.expectedSize = size;
          await initWasm();
          this.playerContext = await ThisPlayerContext.newWithStream(
            this.reader
          );
          unlocker.unlock();
          this.inited = true;
          this.locked = false;
          return true;
        }
        return "No body on response";
      } else {
        unlocker.unlock();
        this.locked = false;
        try {
          const r = await this.response.json();
          return (
            (r.messages && r.messages.pop()) || r.message || "Unknown error"
          );
        } catch (e) {
          return await this.response.text();
        }
      }
    } catch (e) {
      unlocker.unlock();
      this.locked = false;
      return `Failed to load CPTV url ${url}, ${e}`;
    }
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
      await initWasm();
      this.playerContext = await ThisPlayerContext.newWithStream(
        this.reader as ReadableStreamDefaultReader
      );
      this.inited = true;
      result = true;
    } catch (e: unknown) {
      this.streamError = e as string | null;
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
        await (this.playerContext as CptvPlayerContext).fetchNextFrame();
      } catch (e: unknown) {
        this.streamError = e as string | null;
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
      const frameData = (
        this.playerContext as CptvPlayerContext
      ).getNextFrame();
      const frameHeader = (
        this.playerContext as CptvPlayerContext
      ).getFrameHeader();
      // NOTE(jon): Work around a bug where the mlx sensor doesn't report timeOn times, just hardcodes 60000
      if (frameHeader && frameHeader.imageData.width !== 32) {
        const sameFrameAsPrev =
          frameHeader &&
          this.prevFrameHeader &&
          frameHeader.timeOnMs === this.prevFrameHeader.timeOnMs;
        if (sameFrameAsPrev) {
          this.prevFrameHeader = frameHeader;
          return null;
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

  async countTotalFrames() {
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
        await (this.playerContext as CptvPlayerContext).countTotalFrames();
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

  async getMetadata() {
    const header = await this.getHeader();
    let totalFrameCount = 0;
    if (this.hasStreamError()) {
      return this.streamError;
    } else {
      if (header.totalFrames) {
        totalFrameCount = header.totalFrames;
      } else {
        totalFrameCount = await this.countTotalFrames();
      }
      const duration = (1 / header.fps) * totalFrameCount;
      return {
        ...header,
        duration,
        totalFrames: totalFrameCount,
      };
    }
  }

  async getStreamMetadata(url: string, size = 0) {
    await this.initWithCptvUrlAndSize(url, size);
    return await this.getMetadata();
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
    if (this.hasValidContext()) {
      const unlocker = new Unlocker();
      await this.lockIsUncontended(unlocker);
      this.locked = true;
      await (this.playerContext as CptvPlayerContext).fetchHeader();
      const header = (this.playerContext as CptvPlayerContext).getHeader();
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
    if (!this.locked && this.inited && this.hasValidContext()) {
      return (this.playerContext as CptvPlayerContext).totalFrames();
    }
    return null;
  }

  getLoadProgress(): number | null {
    if (this.locked || !this.hasValidContext()) {
      return null;
    }
    // This doesn't actually tell us how much has downloaded, just how much has been lazily read.
    return (
      (this.playerContext as CptvPlayerContext).bytesLoaded() /
      this.expectedSize
    );
  }

  hasStreamError(): boolean {
    return this.streamError !== null;
  }
}

const player = new CptvDecoderInterface();
self.addEventListener("message", async ({ data }) => {
  switch (data.type) {
    case "initWithLocalCptvFile":
      {
        const result = await player.initWithFileBytes(data.arrayBuffer);
        self.postMessage({ type: data.type, data: result });
      }
      break;

    case "initWithUrl":
      {
        const result = await player.initWithCptvUrlAndSize(data.url);
        self.postMessage({ type: data.type, data: result });
      }
      break;
    case "initWithUrlAndSize":
      {
        const result = await player.initWithCptvUrlAndSize(data.url, data.size);
        self.postMessage({ type: data.type, data: result });
      }
      break;
    case "initWithRecordingIdAndSize":
      {
        const result = await player.initWithRecordingIdAndSize(
          data.id,
          data.apiToken,
          data.apiRoot,
          data.size
        );
        self.postMessage({ type: data.type, data: result });
      }
      break;
    case "getStreamMetadata":
      {
        const header = await player.getStreamMetadata(data.url);
        self.postMessage({ type: data.type, data: header });
      }
      break;
    case "getNextFrame":
      {
        const frame = await player.fetchNextFrame();
        self.postMessage({ type: data.type, data: frame });
      }
      break;
    case "getTotalFrames":
      {
        const totalFrames = player.getTotalFrames();
        self.postMessage({ type: data.type, data: totalFrames });
      }
      break;
    case "getLoadProgress":
      {
        const progress = player.getLoadProgress();
        self.postMessage({ type: data.type, data: progress });
      }
      break;
    case "getHeader":
      {
        const header = await player.getHeader();
        self.postMessage({ type: data.type, data: header });
      }
      break;
    case "hasStreamError":
      {
        const hasError = player.hasStreamError();
        self.postMessage({ type: data.type, data: hasError });
      }
      break;
    case "getStreamError":
      {
        const error = player.streamError;
        self.postMessage({ type: data.type, data: error });
      }
      break;
    case "freeResources":
      {
        player.free();
        self.postMessage({ type: data.type, data: true });
      }
      break;
    default:
      self.postMessage(data);
      return;
  }
});
self.postMessage({ type: "init" });
