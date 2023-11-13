/* tslint:disable */
/* eslint-disable */
/**
 */
export class CptvPlayerContext {
  free(): void;
  /**
   * @param {ReadableStreamDefaultReader} stream
   * @returns {Promise<CptvPlayerContext>}
   */
  static newWithStream(
    stream: ReadableStreamDefaultReader
  ): Promise<CptvPlayerContext>;
  /**
   * @returns {boolean}
   */
  streamComplete(): boolean;
  /**
   * @returns {Promise<void>}
   */
  countTotalFrames(): Promise<void>;
  /**
   * @returns {Promise<void>}
   */
  fetchNextFrame(): Promise<void>;
  /**
   * @returns {any}
   */
  totalFrames(): any;
  /**
   * @returns {number}
   */
  bytesLoaded(): number;
  /**
   * @returns {Uint16Array}
   */
  getNextFrame(): Uint16Array;
  /**
   * @returns {any}
   */
  getFrameHeader(): any;
  /**
   * @returns {number}
   */
  getWidth(): number;
  /**
   * @returns {number}
   */
  getHeight(): number;
  /**
   * @returns {number}
   */
  getFrameRate(): number;
  /**
   * @returns {number}
   */
  getFramesPerIframe(): number;
  /**
   * @returns {Promise<void>}
   */
  fetchHeader(): Promise<void>;
  /**
   * @returns {any}
   */
  getHeader(): any;
}
