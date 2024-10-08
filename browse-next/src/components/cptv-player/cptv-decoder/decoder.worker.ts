import type {
  CptvFrame,
  CptvFrameHeader,
  CptvHeader,
} from "@/components/cptv-player/cptv-decoder/decoder";
import type { ReadableStreamDefaultReader } from "stream/web";
import type { CptvDecoderContext as DecoderContext } from "@/components/cptv-player/cptv-decoder/decoder/cptv_decoder";
import wasmUrl from "./decoder/cptv_decoder_bg.wasm?url";
import init, { CptvDecoderContext } from "./decoder/cptv_decoder.js";
import type { RecordingId } from "@typedefs/api/common";

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
): {
  cancel(): Promise<void>;
  read(): Promise<{ value: Uint8Array; done: boolean }>;
  releaseLock(): void;
  closed: Promise<Awaited<undefined>>;
} => {
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
    closed: Promise.resolve(undefined),
    releaseLock(): void {
      return;
    },
    read(): Promise<{ value: Uint8Array; done: boolean }> {
      return new Promise((resolve) => {
        state.offset += 1;
        const value = (state.bytes as Uint8Array).slice(
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

class CptvDecoderInterface {
  private framesRead = 0;
  private locked = false;
  private consumed = false;
  private prevFrameHeader: CptvFrameHeader | null = null;
  private response: Response | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private playerContext: DecoderContext | null = null;
  private expectedSize = 0;
  private inited = false;
  private currentContentType = "application/x-cptv";
  streamError: string | null = null;

  async free(): Promise<void> {
    this.framesRead = 0;
    this.locked = false;
    this.consumed = false;
    this.inited = false;
    this.prevFrameHeader = null;
    this.playerContext && this.playerContext.free();
    this.reader && (await this.reader.cancel());
    this.streamError = null;
    this.reader = null;
    this.playerContext = null;
  }

  hasValidContext() {
    return !!this.playerContext;
  }

  async initWithRecordingIdAndSize(
    id: RecordingId,
    apiToken: string,
    apiRoot: string,
    size?: number
  ): Promise<string | boolean | Blob> {
    await this.free();
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
          // eslint-disable-next-line no-undef
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
            await init(wasmUrl);
            this.playerContext = CptvDecoderContext.newWithReadableStream(
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
    await this.free();
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
          await init(wasmUrl);
          this.playerContext = CptvDecoderContext.newWithReadableStream(
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
    await this.free();
    this.framesRead = 0;
    this.streamError = null;
    const unlocker = new Unlocker();
    await this.lockIsUncontended(unlocker);
    this.locked = true;

    this.reader = FakeReader(
      fileBytes,
      100000
    ) as ReadableStreamDefaultReader<Uint8Array>;
    this.expectedSize = fileBytes.length;
    let result;
    try {
      await init(wasmUrl);
      this.playerContext = CptvDecoderContext.newWithReadableStream(
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
    return frameData as CptvFrame;
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
        return header;
      }
    }
    return this.streamError;
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
    case "getNextFrame":
      {
        const frame = await player.fetchNextFrame();
        self.postMessage({ type: data.type, data: frame });
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
        await player.free();
        self.postMessage({ type: data.type, data: true });
      }
      break;
    default:
      self.postMessage(data);
      return;
  }
});
self.postMessage({ type: "init" });
