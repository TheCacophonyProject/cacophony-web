import * as wasm from "./decoder_bg.wasm";
import { __wbg_set_wasm } from "./decoder_bg.js";
__wbg_set_wasm(wasm);
export * from "./decoder_bg.js";
