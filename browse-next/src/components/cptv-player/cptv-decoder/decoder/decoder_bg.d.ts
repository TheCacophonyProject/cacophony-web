/* tslint:disable */
/* eslint-disable */
/**
*/
export class CptvPlayerContext {

  ptr: number;

  free(): void;
/**
* @param {any} stream
* @returns {Promise<CptvPlayerContext>}
*/
  static newWithStream(stream: any): Promise<CptvPlayerContext>;
/**
* @returns {boolean}
*/
  streamComplete(): boolean;
/**
* @param {CptvPlayerContext} context
* @returns {Promise<CptvPlayerContext>}
*/
  static countTotalFrames(context: CptvPlayerContext): Promise<CptvPlayerContext>;
/**
* @param {CptvPlayerContext} context
* @returns {Promise<CptvPlayerContext>}
*/
  static fetchNextFrame(context: CptvPlayerContext): Promise<CptvPlayerContext>;
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
* @param {CptvPlayerContext} context
* @returns {Promise<CptvPlayerContext>}
*/
  static fetchHeader(context: CptvPlayerContext): Promise<CptvPlayerContext>;
/**
* @returns {any}
*/
  getHeader(): any;
}
