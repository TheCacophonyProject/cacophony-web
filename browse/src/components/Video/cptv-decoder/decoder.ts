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

let messageQueue: Record<string, (data: unknown) => void> = {};
let decoder: Worker | undefined;

export class CptvDecoder {
  constructor() {
    this.free().then(() => {
      messageQueue = {};
    });
  }
  private inited = false;
  async init() {
    await this.free();
    messageQueue = {};
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
        const resolver = messageQueue[type];
        delete messageQueue[type];
        resolver && resolver(data);
      };
      const decoderNotInited = !decoder;
      if (decoderNotInited) {
        decoder = new Worker(new URL("./decoder.worker.ts", import.meta.url), {
          type: "module",
        });
      }
      (decoder as Worker).onmessage = onMessage;
      if (decoderNotInited) {
        await this.waitForMessage("init");
      }
      this.inited = true;
    }
  }

  /**
   * Initialises a new player and associated stream reader.
   * @param url (String)
   * @param size (Number)
   * @returns True on success, or an error string on failure (String | Boolean)
   */
  async initWithCptvUrlAndKnownSize(
    url: string,
    size: number
  ): Promise<string | boolean> {
    await this.init();
    const type = "initWithUrlAndSize";
    decoder && decoder.postMessage({ type, url, size });
    return (await this.waitForMessage(type)) as string | boolean;
  }

  // /**
  //  * Initialises a new player and associated stream reader.
  //  * @param id (Number)
  //  * @param apiToken (String)
  //  * @param size (Number)
  //  * @returns Content type on success, or an error string on failure (String | Boolean)
  //  */
  // async initWithRecordingIdAndKnownSize(
  //   id: RecordingId,
  //   size: number,
  //   apiToken?: string
  // ): Promise<string | boolean | Blob> {
  //   await this.init();
  //   const type = "initWithRecordingIdAndSize";
  //   decoder &&
  //     decoder.postMessage({ type, id, size, apiToken, apiRoot: API_ROOT });
  //   return (await this.waitForMessage(type)) as string | boolean | Blob;
  // }

  /**
   * Initialises a new player and associated stream reader.
   * @param url (String)
   * @returns True on success, or an error string on failure (String | Boolean)
   */
  async initWithCptvUrl(url: string): Promise<string | boolean> {
    await this.init();
    const type = "initWithUrl";
    decoder && decoder.postMessage({ type, url });
    return (await this.waitForMessage(type)) as string | boolean;
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
    decoder && decoder.postMessage({ type, arrayBuffer: fileBytes });
    return (await this.waitForMessage(type)) as string | boolean;
  }

  /**
   * Get the header and duration of a remote CPTV file given by url.
   * This function reads and consumes the entire file, without decoding actual frames.
   * @param url (String)
   */
  async getStreamMetadata(url: string): Promise<CptvHeader> {
    await this.init();
    const type = "getStreamMetadata";
    decoder && decoder.postMessage({ type, url });
    return (await this.waitForMessage(type)) as CptvHeader;
  }

  /**
   * Get the header and duration in seconds for an already loaded byte array
   * This function reads and consumes the entire file, without decoding actual frames.
   * @param fileBytes (Uint8Array)
   */
  async getBytesMetadata(fileBytes: Uint8Array): Promise<CptvHeader> {
    await this.init();
    const type = "getBytesMetadata";
    decoder && decoder.postMessage({ type, arrayBuffer: fileBytes });
    return (await this.waitForMessage(type)) as CptvHeader;
  }

  /**
   * Get the next frame in the sequence, if there is one.
   */
  async getNextFrame(): Promise<CptvFrame | null> {
    const type = "getNextFrame";
    decoder && decoder.postMessage({ type });
    return (await this.waitForMessage(type)) as CptvFrame | null;
  }

  /**
   * If the file stream has completed, this gives the total number
   * of playable frames in the file (including any background frame).
   */
  async getTotalFrames(): Promise<number | null> {
    const type = "getTotalFrames";
    decoder && decoder.postMessage({ type });
    return (await this.waitForMessage(type)) as number | null;
  }

  /**
   * Get the header for the CPTV file as JSON.
   * Optional fields will always be present, but set to `undefined`
   */
  async getHeader(): Promise<CptvHeader> {
    const type = "getHeader";
    decoder && decoder.postMessage({ type });
    return (await this.waitForMessage(type)) as CptvHeader;
  }

  /**
   * Stream load progress from 0..1
   */
  async getLoadProgress(): Promise<number> {
    const type = "getLoadProgress";
    decoder && decoder.postMessage({ type });
    return (await this.waitForMessage(type)) as number;
  }

  /**
   * If the decode halted with errors.  Use this in the API to see if we should continue processing a file, or mark it
   * as damaged.
   */
  async hasStreamError(): Promise<boolean> {
    const type = "hasStreamError";
    decoder && decoder.postMessage({ type });
    return (await this.waitForMessage(type)) as boolean;
  }

  /**
   * Get any stream error message
   */
  async getStreamError(): Promise<string | null> {
    const type = "getStreamError";
    decoder && decoder.postMessage({ type });
    return (await this.waitForMessage(type)) as string | null;
  }

  /**
   * Free resources associated with the currently decoded file.
   */
  async free(): Promise<void> {
    const type = "freeResources";
    if (decoder && this.inited) {
      decoder.postMessage({ type });
      return (await this.waitForMessage(type)) as void;
    }
  }

  async waitForMessage(messageType: string): Promise<unknown> {
    return new Promise((resolve) => {
      messageQueue[messageType] = resolve;
    });
  }

  /**
   * Terminate the decoder worker thread - because the worker thread takes a while to init, ideally we want to
   * do this only when the thread closes.
   */
  async close(): Promise<void> {
    decoder && decoder.terminate();
    decoder = undefined;
  }
}

export interface CptvHeader {
  timestamp: number;
  width: number;
  height: number;
  compression: number;
  deviceName: string;
  fps: number;
  brand: string | null;
  model: string | null;
  deviceId: number | null;
  serialNumber: number | null;
  firmwareVersion: string | null;
  motionConfig: string | null;
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
  bitWidth: number;
  imageData: {
    width: number;
    height: number;
    /**
     * Minimum value for this frame
     */
    min: number;
    /**
     * Maximum value for this frame
     */
    max: number;
  };
}

export interface CptvFrame {
  /**
   * Raw u16 data of `width` * `height` length where width and height can be found in the CptvHeader
   */
  data: Uint16Array;

  /**
   * Frame header
   */
  meta: CptvFrameHeader;
}
