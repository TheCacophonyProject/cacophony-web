/* tslint:disable */
/* eslint-disable */

// interface CptvFrame {
//   imageData: Uint16Array,
//   timeOnMs: number,
//   lastFfcTimeMs: number,
//   lastFfcTempC: number,
//   frameTempC: number,
//   isBackgroundFrame: false
// }
//
// interface CptvHeader {
//   version: number,
//   timestamp: number,
//   width: number,
//   height: number,
//   compression: number,
//   deviceName: { inner: string },
//   fps: number,
//   brand: { inner: string },
//   model: { inner: string },
//   deviceId: number,
//   serialNumber: number,
//   firmwareVersion: { inner: string },
//   motionConfig: {
//     inner: string
//   },
//   previewSecs: number,
//   latitude: number,
//   longitude: number,
//   locTimestamp?: number,
//   altitude?: number,
//   accuracy?: number,
//   hasBackgroundFrame?: boolean,
//   totalFrames?: number,
//   minValue?: number,
//   maxValue?: number
// }

import type {
  CptvFrame,
  CptvHeader,
} from "@/components/cptv-player/cptv-decoder/decoder.ts";

/**
 */
export class CptvDecoderContext {
  free(): void;
  /**
   * @param {ReadableStreamDefaultReader} stream
   * @returns {CptvDecoderContext}
   */
  static newWithReadableStream(
    stream: ReadableStreamDefaultReader,
  ): CptvDecoderContext;
  /**
   * @returns {Promise<CptvHeader | string>}
   */
  getHeader(): Promise<CptvHeader | string>;
  /**
   * @returns {Promise<CptvFrame | null>}
   */
  nextFrame(): Promise<CptvFrame | null>;
  /**
   * @returns {Promise<CptvFrame | null>}
   */
  nextFrameOwned(): Promise<CptvFrame | null>;
}

export type InitInput =
  | RequestInfo
  | URL
  | Response
  | BufferSource
  | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_cptvdecodercontext_free: (a: number) => void;
  readonly cptvdecodercontext_newWithReadableStream: (a: number) => number;
  readonly cptvdecodercontext_getHeader: (a: number) => number;
  readonly cptvdecodercontext_nextFrame: (a: number) => number;
  readonly cptvdecodercontext_nextFrameOwned: (a: number) => number;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => number;
  readonly __wbindgen_export_2: WebAssembly.Table;
  readonly _dyn_core__ops__function__FnMut__A____Output___R_as_wasm_bindgen__closure__WasmClosure___describe__invoke__h1ea9dee0275cc798: (
    a: number,
    b: number,
    c: number,
  ) => void;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly wasm_bindgen__convert__closures__invoke2_mut__h9a4c6a115fd98b93: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {SyncInitInput} module
 *
 * @returns {InitOutput}
 */
export function initSync(module: SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {InitInput | Promise<InitInput>} module_or_path
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init(
  module_or_path?: InitInput | Promise<InitInput>,
): Promise<InitOutput>;
