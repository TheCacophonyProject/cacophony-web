export class Mp4Encoder {
  encoder: Worker;
  messageQueue: Record<string, (data?: unknown) => unknown> = {};
  constructor() {
    this.encoder = new Worker(new URL("./mp4-exporter.ts", import.meta.url));
    this.encoder.onmessage = ({ data: { type, data } }: MessageEvent) => {
      const resolver = this.messageQueue[type];
      delete this.messageQueue[type];
      resolver && resolver(data);
    };
  }

  async waitForMessage(messageType: string): Promise<unknown> {
    return new Promise((resolve: (data?: unknown) => unknown) => {
      this.messageQueue[messageType] = resolve;
    });
  }

  async init(width: number, height: number, frameRate: number): Promise<void> {
    const type = "initEncoder";
    this.encoder.postMessage({ type, data: { width, height, frameRate } });
    return (await this.waitForMessage(type)) as void;
  }

  async encodeFrame(frame: Uint8ClampedArray): Promise<void> {
    const type = "encodeFrame";
    this.encoder.postMessage({ type, data: frame });
    return (await this.waitForMessage(type)) as void;
  }

  async finish(): Promise<Uint8Array> {
    const type = "finishEncode";
    this.encoder.postMessage({ type });
    return (await this.waitForMessage(type)) as Uint8Array;
  }

  close(): void {
    this.encoder.terminate();
  }
}
