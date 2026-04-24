import { Worker, MessageChannel, MessagePort } from "node:worker_threads";
import type { ReadableStream } from "stream/web";
import logging from "@log";
import { availableParallelism } from "node:os";
import { DeviceId } from "@typedefs/api/common.js";
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

interface PooledDecoderWorker {
  worker: Worker;
  workStartedAt: Date;
  deviceId: DeviceId;
  messagePort: MessagePort;
}

class DecoderWorkerPool {
  private readonly idleWorkers: PooledDecoderWorker[] = [];
  private readonly busyWorkers = new Set<PooledDecoderWorker>();
  private readonly pendingResolvers: {
    deviceId: DeviceId;
    resolve: (worker: PooledDecoderWorker) => void;
  }[] = [];
  private readonly maxWorkers = Math.max(4, availableParallelism() - 1);
  private totalWorkers = 0;

  private async createWorker(deviceId: DeviceId): Promise<PooledDecoderWorker> {
    const { port1, port2 } = new MessageChannel();
    port1.unref();

    const worker = new Worker(new URL("./decoder.worker.js", import.meta.url), {
      workerData: {
        port: port2,
      },
      transferList: [port2],
      resourceLimits: {
        maxOldGenerationSizeMb: 20, // Limit heap to 20MB, seems to be all that's needed for CPTV files
        maxYoungGenerationSizeMb: 20,
        stackSizeMb: 8,
      },
    });

    worker.unref();
    worker.on("error", (err) => {
      logging.error(`CPTV Decoder worker error: ${err.message}`);
      try {
        worker.terminate();
      } finally {
        let brokenWorker;
        for (const pooledWorker of Array.from(this.busyWorkers)) {
          if (pooledWorker.worker === worker) {
            brokenWorker = pooledWorker;
            break;
          }
        }
        if (brokenWorker) {
          logging.error(
            `Removing broken CPTV Decoder worker for #${brokenWorker.deviceId}, created at ${brokenWorker.workStartedAt}`,
          );
          this.busyWorkers.delete(brokenWorker);
        } else {
          logging.error(
            "Failed to find broken worker in busy pool in order to remove",
          );
        }
        this.totalWorkers -= 1;
      }
    });

    await new Promise<void>((resolve, reject) => {
      const onMessage = (message: MessageData | MessageDataMessage) => {
        const type =
          message.type && message.type !== "message"
            ? message.type
            : (message as MessageDataMessage).data.type;

        if (type === "init") {
          port1.off("message", onMessage);
          resolve();
        }
      };

      const onError = (err: Error) => {
        port1.off("message", onMessage);
        reject(err);
      };

      port1.on("message", onMessage);
      worker.once("error", onError);
    });

    this.totalWorkers += 1;
    logging.info(
      `New CPTV Decoder worker ${this.totalWorkers}/${this.maxWorkers}`,
    );

    return {
      worker,
      deviceId,
      workStartedAt: new Date(),
      messagePort: port1,
    };
  }

  async acquire(deviceId: DeviceId): Promise<PooledDecoderWorker> {
    const idle = this.idleWorkers.pop();
    if (idle) {
      idle.workStartedAt = new Date();
      idle.deviceId = deviceId;
      this.busyWorkers.add(idle);
      return idle;
    }

    const oldestWorker = Array.from(this.busyWorkers).reduce(
      (oldWorker, worker) => {
        if (!oldWorker) {
          return worker;
        } else {
          if (worker.workStartedAt > oldWorker.workStartedAt) {
            return worker;
          } else {
            return oldWorker;
          }
        }
      },
      undefined,
    );
    if (
      oldestWorker &&
      new Date().getTime() - oldestWorker.workStartedAt.getTime() >
        10 * 60 * 1000
    ) {
      try {
        logging.warning(
          `Terminating stalled CPTV decoder worker for #${oldestWorker.deviceId} after ${new Date().getTime() - oldestWorker.workStartedAt.getTime()}ms`,
        );
        await oldestWorker.worker.terminate();
      } finally {
        let timedOutWorker;
        for (const pooledWorker of Array.from(this.busyWorkers)) {
          if (pooledWorker === oldestWorker) {
            timedOutWorker = pooledWorker;
            break;
          }
        }
        if (timedOutWorker) {
          this.busyWorkers.delete(timedOutWorker);
        }
        this.totalWorkers -= 1;
      }
    }

    if (this.totalWorkers < this.maxWorkers) {
      const created = await this.createWorker(deviceId);
      this.busyWorkers.add(created);
      return created;
    }

    return await new Promise((resolve) => {
      this.pendingResolvers.push({ deviceId, resolve });
      const oldestWorker = Array.from(this.busyWorkers).reduce(
        (oldWorker, worker) => {
          if (!oldWorker) {
            return worker;
          } else {
            if (worker.workStartedAt > oldWorker.workStartedAt) {
              return worker;
            } else {
              return oldWorker;
            }
          }
        },
        undefined,
      );
      if (oldestWorker) {
        logging.warning(
          `All CPTV decoder workers busy (oldest created at ${oldestWorker.workStartedAt} for #${oldestWorker.deviceId}), ${this.pendingResolvers.length} jobs waiting`,
        );
      }
    });
  }

  async release(pooledWorker: PooledDecoderWorker): Promise<void> {
    if (this.busyWorkers.delete(pooledWorker)) {
      const waiter = this.pendingResolvers.shift();
      if (waiter) {
        pooledWorker.workStartedAt = new Date();
        pooledWorker.deviceId = waiter.deviceId;
        this.busyWorkers.add(pooledWorker);
        waiter.resolve(pooledWorker);
        return;
      }
      this.idleWorkers.push(pooledWorker);
    } else {
      // If the busy worker was already terminated for some error reason.
      logging.warning(
        "Attempted to release worker not in busyWorkers pool - it may have terminated itself",
      );
      // FIXME: Could this result in just passing the waiter another promise?
      const waiter = this.pendingResolvers.shift();
      if (waiter) {
        const pooledWorker = await this.acquire(waiter.deviceId);
        pooledWorker.workStartedAt = new Date();
        pooledWorker.deviceId = waiter.deviceId;
        waiter.resolve(pooledWorker);
        return;
      }
    }
  }
}

const CptvDecoderWorkerPool = new DecoderWorkerPool();

export class CptvDecoder {
  constructor() {
    /* empty */
  }
  private inited = false;
  private pooledWorker: PooledDecoderWorker | null = null;
  private messagePort: MessagePort;
  private messageQueue: Record<
    string,
    { resolve: (val: unknown) => void; reject: () => void }
  > = {};
  private readonly boundOnMessage = this.onMessage.bind(this);
  private readonly boundOnMessageError = this.onMessageError.bind(this);
  private closing = false;

  onMessage(message: MessageData | MessageDataMessage) {
    let type;
    let data;
    if (message.type && message.type !== "message") {
      type = message.type;
      data = message.data;
    } else {
      type = (message as MessageDataMessage).data.type;
      data = (message as MessageDataMessage).data.data;
    }
    const pending = this.messageQueue[type];
    if (!pending) {
      return;
    }
    delete this.messageQueue[type];
    pending.resolve(data);
  }
  onMessageError(err: Error) {
    console.warn("MessageError", err);
  }
  async init(deviceId: DeviceId) {
    this.messageQueue = {};
    if (!this.inited) {
      this.inited = true;

      // TODO: Here we can see if any workers are stalled out, since we can
      //  record when they start work.
      this.pooledWorker = await CptvDecoderWorkerPool.acquire(deviceId);
      this.messagePort = this.pooledWorker.messagePort;
      this.messagePort.on("message", this.boundOnMessage);
      this.messagePort.on("messageerror", this.boundOnMessageError);
    }
  }
  /**
   * Initialise a new player with an cptv file stream
   * @param stream (ReadableStream)
   * @returns True on success, or an error string on failure (String | Boolean)
   */
  async initWithReadableStream(
    deviceId: DeviceId,
    stream: ReadableStream,
  ): Promise<string | boolean> {
    await this.init(deviceId);
    const type = "initWithReadableStream";
    this.messagePort.postMessage({ type, streamReader: stream }, [stream]);
    return (await this.waitForMessage(type)) as string | boolean;
  }

  /**
   * Get the header and duration in seconds for a cptv file stream
   * This function reads and consumes the entire stream, without decoding actual frames.
   * @param stream (ReadableStream)
   * @returns {CptvHeader} on success, or an error string on failure
   */
  async getStreamMetadata(
    deviceId: DeviceId,
    stream: ReadableStream,
  ): Promise<(CptvHeader & { firstFrame?: CptvFrame }) | string> {
    await this.init(deviceId);
    const type = "getStreamMetadata";
    this.messagePort.postMessage({ type, streamReader: stream }, [stream]);
    return (await this.waitForMessage(type)) as CptvHeader | string;
  }

  /**
   * Initialise a new player with an already loaded local file.
   * @param fileBytes (Uint8Array)
   * @returns True on success, or an error string on failure (String | Boolean)
   */
  async initWithLocalCptvFile(
    deviceId: DeviceId,
    fileBytes: Uint8Array,
  ): Promise<string | boolean> {
    await this.init(deviceId);
    const type = "initWithLocalCptvFile";
    this.messagePort.postMessage({ type, arrayBuffer: fileBytes });
    return (await this.waitForMessage(type)) as string | boolean;
  }

  /**
   * Get the header and duration in seconds for an already loaded byte array
   * This function reads and consumes the entire file, without decoding actual frames.
   * @param fileBytes (Uint8Array)
   */
  async getBytesMetadata(
    deviceId: DeviceId,
    fileBytes: Uint8Array,
  ): Promise<CptvHeader> {
    await this.init(deviceId);
    const type = "getBytesMetadata";
    this.messagePort.postMessage({ type, arrayBuffer: fileBytes });
    return (await this.waitForMessage(type)) as CptvHeader;
  }

  /**
   * Get the next frame in the sequence, if there is one.
   */
  async getNextFrame(): Promise<CptvFrame | null> {
    const type = "getNextFrame";
    this.messagePort.postMessage({ type });
    return (await this.waitForMessage(type)) as CptvFrame | null;
  }

  /**
   * Get the header for the CPTV file as JSON.
   * Optional fields will always be present, but set to `undefined`
   */
  async getHeader(): Promise<CptvHeader> {
    const type = "getHeader";
    this.messagePort.postMessage({ type });
    return (await this.waitForMessage(type)) as CptvHeader;
  }

  /**
   * If the decode halted with errors.  Use this in the API to see if we should continue processing a file, or mark it
   * as damaged.
   */
  async hasStreamError(): Promise<boolean> {
    const type = "hasStreamError";
    this.messagePort.postMessage({ type });
    return (await this.waitForMessage(type)) as boolean;
  }

  /**
   * Get any stream error message
   */
  async getStreamError(): Promise<string | null> {
    const type = "getStreamError";
    this.messagePort.postMessage({ type });
    return (await this.waitForMessage(type)) as string | null;
  }

  async waitForMessage(messageType: string): Promise<unknown> {
    if (this.messageQueue[messageType]) {
      // Reject existing message of this type if any
      this.messageQueue[messageType].reject();
    }
    return new Promise((resolve, reject) => {
      this.messageQueue[messageType] = { resolve, reject };
    });
  }

  /**
   * Terminate the decoder worker thread - because the worker thread takes a while to init, ideally we want to
   * do this only when the thread closes.
   */
  async close(): Promise<void> {
    if (this.closing || !this.pooledWorker) {
      return;
    }
    this.closing = true;
    try {
      this.messagePort.postMessage({ type: "reset" });
      await this.waitForMessage("reset");
    } finally {
      for (const [type, { reject }] of Object.entries(this.messageQueue)) {
        reject();
        delete this.messageQueue[type];
      }

      this.messageQueue = {};
      this.messagePort.off("message", this.boundOnMessage);
      this.messagePort.off("messageerror", this.boundOnMessageError);

      await CptvDecoderWorkerPool.release(this.pooledWorker);

      this.pooledWorker = null;
      this.inited = false;
      this.closing = false;
    }
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

export interface CptvHeaderMapped {
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
}

export interface CptvFrame extends CptvFrameHeader {
  /**
   * Raw u16 data of `width` * `height` length where width and height can be found in the CptvHeader
   */
  imageData: Uint16Array;
}
