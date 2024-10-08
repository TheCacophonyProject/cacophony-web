import { Worker } from "worker_threads";
import type { ReadableStream } from "stream/web";
interface MessageData {
  type: string;
  data: unknown;
}
interface MessageDataMessage extends MessageData {
  type: "message";
  data: {
    type: string;
    data: unknown;
  };
}

export class CptvDecoder {
  constructor() {
    this.free().then(() => {
      this.messageQueue = {};
    });
  }
  private inited = false;
  private decoder: Worker;
  private messageQueue = {};
  async init() {
    await this.free();
    this.messageQueue = {};
    if (!this.inited) {
      const onMessage = async (message: MessageData | MessageDataMessage) => {
        let type;
        let data;
        if (message.type && message.type !== "message") {
          type = message.type;
          data = message.data;
        } else {
          type = (message as MessageDataMessage).data.type;
          data = (message as MessageDataMessage).data.data;
        }
        const resolver = this.messageQueue[type];
        delete this.messageQueue[type];
        resolver && resolver(data);
      };

      this.decoder = new Worker(
        new URL("./decoder.worker.js", import.meta.url)
      );
      this.decoder.addListener.bind(this.decoder)("message", onMessage);
      await this.waitForMessage("init");

      this.inited = true;
    }
  }
  /**
   * Initialise a new player with an cptv file stream
   * @param stream (ReadableStream)
   * @returns True on success, or an error string on failure (String | Boolean)
   */
  async initWithReadableStream(
    stream: ReadableStream
  ): Promise<string | boolean> {
    await this.init();
    const type = "initWithReadableStream";
    const thisStream = stream as any;
    this.decoder &&
      this.decoder.postMessage({ type, streamReader: stream }, [thisStream]);
    return (await this.waitForMessage(type)) as string | boolean;
  }

  /**
   * Get the header and duration in seconds for a cptv file stream
   * This function reads and consumes the entire stream, without decoding actual frames.
   * @param stream (ReadableStream)
   * @returns {CptvHeader} on success, or an error string on failure
   */
  async getStreamMetadata(
    stream: ReadableStream
  ): Promise<CptvHeader | string> {
    await this.init();
    const type = "getStreamMetadata";
    const thisStream = stream as any;
    this.decoder &&
      this.decoder.postMessage({ type, streamReader: stream }, [thisStream]);
    return (await this.waitForMessage(type)) as CptvHeader | string;
  }

  /**
   * Initialise a new player with an already loaded local file.
   * @param fileBytes (Uint8Array)
   * @returns True on success, or an error string on failure (String | Boolean)
   */
  async initWithLocalCptvFile(
    fileBytes: Uint8Array
  ): Promise<string | boolean> {
    await this.init();
    const type = "initWithLocalCptvFile";
    this.decoder && this.decoder.postMessage({ type, arrayBuffer: fileBytes });
    return (await this.waitForMessage(type)) as string | boolean;
  }

  /**
   * Get the header and duration in seconds for an already loaded byte array
   * This function reads and consumes the entire file, without decoding actual frames.
   * @param fileBytes (Uint8Array)
   */
  async getBytesMetadata(fileBytes: Uint8Array): Promise<CptvHeader> {
    await this.init();
    const type = "getBytesMetadata";
    this.decoder && this.decoder.postMessage({ type, arrayBuffer: fileBytes });
    return (await this.waitForMessage(type)) as CptvHeader;
  }

  /**
   * Get the next frame in the sequence, if there is one.
   */
  async getNextFrame(): Promise<CptvFrame | null> {
    const type = "getNextFrame";
    this.decoder && this.decoder.postMessage({ type });
    return (await this.waitForMessage(type)) as CptvFrame | null;
  }

  /**
   * Get the header for the CPTV file as JSON.
   * Optional fields will always be present, but set to `undefined`
   */
  async getHeader(): Promise<CptvHeader> {
    const type = "getHeader";
    this.decoder && this.decoder.postMessage({ type });
    return (await this.waitForMessage(type)) as CptvHeader;
  }

  /**
   * If the decode halted with errors.  Use this in the API to see if we should continue processing a file, or mark it
   * as damaged.
   */
  async hasStreamError(): Promise<boolean> {
    const type = "hasStreamError";
    this.decoder && this.decoder.postMessage({ type });
    return (await this.waitForMessage(type)) as boolean;
  }

  /**
   * Get any stream error message
   */
  async getStreamError(): Promise<string | null> {
    const type = "getStreamError";
    this.decoder && this.decoder.postMessage({ type });
    return (await this.waitForMessage(type)) as string | null;
  }

  /**
   * Free resources associated with the currently decoded file.
   */
  async free(): Promise<void> {
    const type = "freeResources";
    if (this.decoder && this.inited) {
      this.decoder.postMessage({ type });
      return (await this.waitForMessage(type)) as void;
    }
  }

  async waitForMessage(messageType: string): Promise<unknown> {
    return new Promise((resolve) => {
      this.messageQueue[messageType] = resolve;
    });
  }

  /**
   * Terminate the decoder worker thread - because the worker thread takes a while to init, ideally we want to
   * do this only when the thread closes.
   */
  async close(): Promise<void> {
    this.decoder && this.decoder.terminate();
    delete this.decoder;
  }
}

interface CptvString {
  inner: string;
}

export interface CptvHeader {
  timestamp: number;
  width: number;
  height: number;
  compression: number;
  deviceName: CptvString;
  fps: number;
  brand: CptvString | null;
  model: CptvString | null;
  deviceId: number | null;
  serialNumber: number | null;
  firmwareVersion: CptvString | null;
  motionConfig: CptvString | null;
  previewSecs: number | null;
  latitude: number | null;
  longitude: number | null;
  locTimestamp: number | null;
  altitude: number | null;
  accuracy: number | null;
  hasBackgroundFrame: boolean;
  // Duration in seconds, *including* any background frame.  This is for compatibility with current
  // durations stored in DB which *include* background frames, the user may wish to subtract 1/fps seconds
  // to get the actual duration.
  // Only set if we used one of the getFileMetadata|getStreamMetadata, and scan the entire file.
  duration?: number;
  totalFrames?: number;

  minValue?: number;
  maxValue?: number;
}

export interface CptvFrameHeader {
  timeOnMs: number;
  lastFfcTimeMs: number | null;
  lastFfcTempC: number | null;
  frameTempC: number | null;
  isBackgroundFrame: boolean;
}

export interface CptvFrame extends CptvFrameHeader {
  /**
   * Raw u16 data of `width` * `height` length where width and height can be found in the CptvHeader
   */
  imageData: Uint16Array;
}
