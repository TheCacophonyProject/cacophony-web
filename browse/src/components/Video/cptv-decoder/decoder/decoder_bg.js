let wasm;
export function __wbg_set_wasm(val) {
  wasm = val;
}

const heap = new Array(128).fill(undefined);

heap.push(undefined, null, true, false);

function getObject(idx) {
  return heap[idx];
}

let heap_next = heap.length;

function dropObject(idx) {
  if (idx < 132) {
    return;
  }
  heap[idx] = heap_next;
  heap_next = idx;
}

function takeObject(idx) {
  const ret = getObject(idx);
  dropObject(idx);
  return ret;
}

const cachedTextDecoder = new TextDecoder("utf-8", {
  ignoreBOM: true,
  fatal: true,
});

cachedTextDecoder.decode();

let cachedUint8Memory0 = null;

function getUint8Memory0() {
  if (cachedUint8Memory0 === null || cachedUint8Memory0.byteLength === 0) {
    cachedUint8Memory0 = new Uint8Array(wasm.memory.buffer);
  }
  return cachedUint8Memory0;
}

function getStringFromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  return cachedTextDecoder.decode(getUint8Memory0().subarray(ptr, ptr + len));
}

function addHeapObject(obj) {
  if (heap_next === heap.length) {
    heap.push(heap.length + 1);
  }
  const idx = heap_next;
  heap_next = heap[idx];

  heap[idx] = obj;
  return idx;
}

function debugString(val) {
  // primitive types
  const type = typeof val;
  if (type == "number" || type == "boolean" || val == null) {
    return `${val}`;
  }
  if (type == "string") {
    return `"${val}"`;
  }
  if (type == "symbol") {
    const description = val.description;
    if (description == null) {
      return "Symbol";
    } else {
      return `Symbol(${description})`;
    }
  }
  if (type == "function") {
    const name = val.name;
    if (typeof name == "string" && name.length > 0) {
      return `Function(${name})`;
    } else {
      return "Function";
    }
  }
  // objects
  if (Array.isArray(val)) {
    const length = val.length;
    let debug = "[";
    if (length > 0) {
      debug += debugString(val[0]);
    }
    for (let i = 1; i < length; i++) {
      debug += ", " + debugString(val[i]);
    }
    debug += "]";
    return debug;
  }
  // Test for built-in
  const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
  let className;
  if (builtInMatches.length > 1) {
    className = builtInMatches[1];
  } else {
    // Failed to match the standard '[object ClassName]'
    return toString.call(val);
  }
  if (className == "Object") {
    // we're a user defined class or Object
    // JSON.stringify avoids problems with cycles, and is generally much
    // easier than looping through ownProperties of `val`.
    try {
      return "Object(" + JSON.stringify(val) + ")";
    } catch (_) {
      return "Object";
    }
  }
  // errors
  if (val instanceof Error) {
    return `${val.name}: ${val.message}\n${val.stack}`;
  }
  // TODO we could test for more things here, like `Set`s and `Map`s.
  return className;
}

let WASM_VECTOR_LEN = 0;

const cachedTextEncoder = new TextEncoder("utf-8");

const encodeString =
  typeof cachedTextEncoder.encodeInto === "function"
    ? function (arg, view) {
        return cachedTextEncoder.encodeInto(arg, view);
      }
    : function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
          read: arg.length,
          written: buf.length,
        };
      };

function passStringToWasm0(arg, malloc, realloc) {
  if (realloc === undefined) {
    const buf = cachedTextEncoder.encode(arg);
    const ptr = malloc(buf.length, 1) >>> 0;
    getUint8Memory0()
      .subarray(ptr, ptr + buf.length)
      .set(buf);
    WASM_VECTOR_LEN = buf.length;
    return ptr;
  }

  let len = arg.length;
  let ptr = malloc(len, 1) >>> 0;

  const mem = getUint8Memory0();

  let offset = 0;

  for (; offset < len; offset++) {
    const code = arg.charCodeAt(offset);
    if (code > 0x7f) {
      break;
    }
    mem[ptr + offset] = code;
  }

  if (offset !== len) {
    if (offset !== 0) {
      arg = arg.slice(offset);
    }
    ptr = realloc(ptr, len, (len = offset + arg.length * 3), 1) >>> 0;
    const view = getUint8Memory0().subarray(ptr + offset, ptr + len);
    const ret = encodeString(arg, view);

    offset += ret.written;
  }

  WASM_VECTOR_LEN = offset;
  return ptr;
}

let cachedInt32Memory0 = null;

function getInt32Memory0() {
  if (cachedInt32Memory0 === null || cachedInt32Memory0.byteLength === 0) {
    cachedInt32Memory0 = new Int32Array(wasm.memory.buffer);
  }
  return cachedInt32Memory0;
}

function makeMutClosure(arg0, arg1, dtor, f) {
  const state = { a: arg0, b: arg1, cnt: 1, dtor };
  const real = (...args) => {
    // First up with a closure we increment the internal reference
    // count. This ensures that the Rust closure environment won't
    // be deallocated while we're invoking it.
    state.cnt++;
    const a = state.a;
    state.a = 0;
    try {
      return f(a, state.b, ...args);
    } finally {
      if (--state.cnt === 0) {
        wasm.__wbindgen_export_2.get(state.dtor)(a, state.b);
      } else {
        state.a = a;
      }
    }
  };
  real.original = state;

  return real;
}
function __wbg_adapter_26(arg0, arg1, arg2) {
  wasm._dyn_core__ops__function__FnMut__A____Output___R_as_wasm_bindgen__closure__WasmClosure___describe__invoke__h7220e89b344ffef7(
    arg0,
    arg1,
    addHeapObject(arg2),
  );
}

function handleError(f, args) {
  try {
    return f.apply(this, args);
  } catch (e) {
    wasm.__wbindgen_exn_store(addHeapObject(e));
  }
}
function __wbg_adapter_67(arg0, arg1, arg2, arg3) {
  wasm.wasm_bindgen__convert__closures__invoke2_mut__h18b31808c97857b2(
    arg0,
    arg1,
    addHeapObject(arg2),
    addHeapObject(arg3),
  );
}

/**
 */
export class CptvPlayerContext {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(CptvPlayerContext.prototype);
    obj.__wbg_ptr = ptr;

    return obj;
  }

  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;

    return ptr;
  }

  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_cptvplayercontext_free(ptr);
  }
  /**
   * @param {ReadableStreamDefaultReader} stream
   * @returns {Promise<CptvPlayerContext>}
   */
  static newWithStream(stream) {
    const ret = wasm.cptvplayercontext_newWithStream(addHeapObject(stream));
    return takeObject(ret);
  }
  /**
   * @returns {boolean}
   */
  streamComplete() {
    const ret = wasm.cptvplayercontext_streamComplete(this.__wbg_ptr);
    return ret !== 0;
  }
  /**
   * @returns {Promise<void>}
   */
  countTotalFrames() {
    const ret = wasm.cptvplayercontext_countTotalFrames(this.__wbg_ptr);
    return takeObject(ret);
  }
  /**
   * @returns {Promise<void>}
   */
  fetchNextFrame() {
    const ret = wasm.cptvplayercontext_fetchNextFrame(this.__wbg_ptr);
    return takeObject(ret);
  }
  /**
   * @returns {any}
   */
  totalFrames() {
    const ret = wasm.cptvplayercontext_totalFrames(this.__wbg_ptr);
    return takeObject(ret);
  }
  /**
   * @returns {number}
   */
  bytesLoaded() {
    const ret = wasm.cptvplayercontext_bytesLoaded(this.__wbg_ptr);
    return ret >>> 0;
  }
  /**
   * @returns {Uint16Array}
   */
  getNextFrame() {
    const ret = wasm.cptvplayercontext_getNextFrame(this.__wbg_ptr);
    return takeObject(ret);
  }
  /**
   * @returns {any}
   */
  getFrameHeader() {
    const ret = wasm.cptvplayercontext_getFrameHeader(this.__wbg_ptr);
    return takeObject(ret);
  }
  /**
   * @returns {number}
   */
  getWidth() {
    const ret = wasm.cptvplayercontext_getWidth(this.__wbg_ptr);
    return ret >>> 0;
  }
  /**
   * @returns {number}
   */
  getHeight() {
    const ret = wasm.cptvplayercontext_getHeight(this.__wbg_ptr);
    return ret >>> 0;
  }
  /**
   * @returns {number}
   */
  getFrameRate() {
    const ret = wasm.cptvplayercontext_getFrameRate(this.__wbg_ptr);
    return ret;
  }
  /**
   * @returns {number}
   */
  getFramesPerIframe() {
    const ret = wasm.cptvplayercontext_getFramesPerIframe(this.__wbg_ptr);
    return ret;
  }
  /**
   * @returns {Promise<void>}
   */
  fetchHeader() {
    const ret = wasm.cptvplayercontext_fetchHeader(this.__wbg_ptr);
    return takeObject(ret);
  }
  /**
   * @returns {any}
   */
  getHeader() {
    const ret = wasm.cptvplayercontext_getHeader(this.__wbg_ptr);
    return takeObject(ret);
  }
}

export function __wbindgen_object_drop_ref(arg0) {
  takeObject(arg0);
}

export function __wbindgen_string_new(arg0, arg1) {
  const ret = getStringFromWasm0(arg0, arg1);
  return addHeapObject(ret);
}

export function __wbg_cptvplayercontext_new(arg0) {
  const ret = CptvPlayerContext.__wrap(arg0);
  return addHeapObject(ret);
}

export function __wbindgen_boolean_get(arg0) {
  const v = getObject(arg0);
  const ret = typeof v === "boolean" ? (v ? 1 : 0) : 2;
  return ret;
}

export function __wbindgen_is_undefined(arg0) {
  const ret = getObject(arg0) === undefined;
  return ret;
}

export function __wbindgen_number_new(arg0) {
  const ret = arg0;
  return addHeapObject(ret);
}

export function __wbindgen_cb_drop(arg0) {
  const obj = takeObject(arg0).original;
  if (obj.cnt-- == 1) {
    obj.a = 0;
    return true;
  }
  const ret = false;
  return ret;
}

export function __wbindgen_object_clone_ref(arg0) {
  const ret = getObject(arg0);
  return addHeapObject(ret);
}

export function __wbindgen_error_new(arg0, arg1) {
  const ret = new Error(getStringFromWasm0(arg0, arg1));
  return addHeapObject(ret);
}

export function __wbindgen_bigint_from_u64(arg0) {
  const ret = BigInt.asUintN(64, arg0);
  return addHeapObject(ret);
}

export function __wbg_set_bd72c078edfa51ad(arg0, arg1, arg2) {
  getObject(arg0)[takeObject(arg1)] = takeObject(arg2);
}

export function __wbg_new_abda76e883ba8a5f() {
  const ret = new Error();
  return addHeapObject(ret);
}

export function __wbg_stack_658279fe44541cf6(arg0, arg1) {
  const ret = getObject(arg1).stack;
  const ptr1 = passStringToWasm0(
    ret,
    wasm.__wbindgen_malloc,
    wasm.__wbindgen_realloc,
  );
  const len1 = WASM_VECTOR_LEN;
  getInt32Memory0()[arg0 / 4 + 1] = len1;
  getInt32Memory0()[arg0 / 4 + 0] = ptr1;
}

export function __wbg_error_f851667af71bcfc6(arg0, arg1) {
  let deferred0_0;
  let deferred0_1;
  try {
    deferred0_0 = arg0;
    deferred0_1 = arg1;
    // eslint-disable-next-line no-console
    console.error(getStringFromWasm0(arg0, arg1));
  } finally {
    wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
  }
}

export function __wbg_debug_9a6b3243fbbebb61(arg0) {
  // eslint-disable-next-line no-console
  console.debug(getObject(arg0));
}

export function __wbg_error_788ae33f81d3b84b(arg0) {
  // eslint-disable-next-line no-console
  console.error(getObject(arg0));
}

export function __wbg_info_2e30e8204b29d91d(arg0) {
  // eslint-disable-next-line no-console
  console.info(getObject(arg0));
}

export function __wbg_log_1d3ae0273d8f4f8a(arg0) {
  // eslint-disable-next-line no-console
  console.log(getObject(arg0));
}

export function __wbg_warn_d60e832f9882c1b2(arg0) {
  // eslint-disable-next-line no-console
  console.warn(getObject(arg0));
}

export function __wbg_read_b40399852b2f7b2b(arg0) {
  const ret = getObject(arg0).read();
  return addHeapObject(ret);
}

export function __wbg_get_97b561fb56f034b5() {
  return handleError(function (arg0, arg1) {
    const ret = Reflect.get(getObject(arg0), getObject(arg1));
    return addHeapObject(ret);
  }, arguments);
}

export function __wbg_new_b51585de1b234aff() {
  const ret = new Object();
  return addHeapObject(ret);
}

export function __wbg_call_01734de55d61e11d() {
  return handleError(function (arg0, arg1, arg2) {
    const ret = getObject(arg0).call(getObject(arg1), getObject(arg2));
    return addHeapObject(ret);
  }, arguments);
}

export function __wbg_new_43f1b47c28813cbd(arg0, arg1) {
  try {
    var state0 = { a: arg0, b: arg1 };
    var cb0 = (arg0, arg1) => {
      const a = state0.a;
      state0.a = 0;
      try {
        return __wbg_adapter_67(a, state0.b, arg0, arg1);
      } finally {
        state0.a = a;
      }
    };
    const ret = new Promise(cb0);
    return addHeapObject(ret);
  } finally {
    state0.a = state0.b = 0;
  }
}

export function __wbg_resolve_53698b95aaf7fcf8(arg0) {
  const ret = Promise.resolve(getObject(arg0));
  return addHeapObject(ret);
}

export function __wbg_then_f7e06ee3c11698eb(arg0, arg1) {
  const ret = getObject(arg0).then(getObject(arg1));
  return addHeapObject(ret);
}

export function __wbg_then_b2267541e2a73865(arg0, arg1, arg2) {
  const ret = getObject(arg0).then(getObject(arg1), getObject(arg2));
  return addHeapObject(ret);
}

export function __wbg_buffer_085ec1f694018c4f(arg0) {
  const ret = getObject(arg0).buffer;
  return addHeapObject(ret);
}

export function __wbg_new_8125e318e6245eed(arg0) {
  const ret = new Uint8Array(getObject(arg0));
  return addHeapObject(ret);
}

export function __wbg_set_5cf90238115182c3(arg0, arg1, arg2) {
  getObject(arg0).set(getObject(arg1), arg2 >>> 0);
}

export function __wbg_length_72e2208bbc0efc61(arg0) {
  const ret = getObject(arg0).length;
  return ret;
}

export function __wbg_newwithbyteoffsetandlength_31ff1024ef0c63c7(
  arg0,
  arg1,
  arg2,
) {
  const ret = new Uint16Array(getObject(arg0), arg1 >>> 0, arg2 >>> 0);
  return addHeapObject(ret);
}

export function __wbg_instanceof_Uint8Array_d8d9cb2b8e8ac1d4(arg0) {
  let result;
  try {
    result = getObject(arg0) instanceof Uint8Array;
  } catch {
    result = false;
  }
  const ret = result;
  return ret;
}

export function __wbg_byteLength_47d11fa79875dee3(arg0) {
  const ret = getObject(arg0).byteLength;
  return ret;
}

export function __wbg_newwithlength_1efd26b345def7b3(arg0) {
  const ret = new Uint16Array(arg0 >>> 0);
  return addHeapObject(ret);
}

export function __wbindgen_debug_string(arg0, arg1) {
  const ret = debugString(getObject(arg1));
  const ptr1 = passStringToWasm0(
    ret,
    wasm.__wbindgen_malloc,
    wasm.__wbindgen_realloc,
  );
  const len1 = WASM_VECTOR_LEN;
  getInt32Memory0()[arg0 / 4 + 1] = len1;
  getInt32Memory0()[arg0 / 4 + 0] = ptr1;
}

export function __wbindgen_throw(arg0, arg1) {
  throw new Error(getStringFromWasm0(arg0, arg1));
}

export function __wbindgen_memory() {
  const ret = wasm.memory;
  return addHeapObject(ret);
}

export function __wbindgen_closure_wrapper182(arg0, arg1) {
  const ret = makeMutClosure(arg0, arg1, 58, __wbg_adapter_26);
  return addHeapObject(ret);
}
