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

export type InitInput =
  | RequestInfo
  | URL
  | Response
  | BufferSource
  | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_cptvplayercontext_free: (a: number) => void;
  readonly cptvplayercontext_newWithStream: (a: number) => number;
  readonly cptvplayercontext_streamComplete: (a: number) => number;
  readonly cptvplayercontext_countTotalFrames: (a: number) => number;
  readonly cptvplayercontext_fetchNextFrame: (a: number) => number;
  readonly cptvplayercontext_totalFrames: (a: number) => number;
  readonly cptvplayercontext_bytesLoaded: (a: number) => number;
  readonly cptvplayercontext_getNextFrame: (a: number) => number;
  readonly cptvplayercontext_getFrameHeader: (a: number) => number;
  readonly cptvplayercontext_getWidth: (a: number) => number;
  readonly cptvplayercontext_getHeight: (a: number) => number;
  readonly cptvplayercontext_getFrameRate: (a: number) => number;
  readonly cptvplayercontext_getFramesPerIframe: (a: number) => number;
  readonly cptvplayercontext_fetchHeader: (a: number) => number;
  readonly cptvplayercontext_getHeader: (a: number) => number;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (
    a: number,
    b: number,
    c: number,
    d: number
  ) => number;
  readonly __wbindgen_export_2: WebAssembly.Table;
  readonly _dyn_core__ops__function__FnMut__A____Output___R_as_wasm_bindgen__closure__WasmClosure___describe__invoke__h7220e89b344ffef7: (
    a: number,
    b: number,
    c: number
  ) => void;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly wasm_bindgen__convert__closures__invoke2_mut__h18b31808c97857b2: (
    a: number,
    b: number,
    c: number,
    d: number
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
  module_or_path?: InitInput | Promise<InitInput>
): Promise<InitOutput>;
