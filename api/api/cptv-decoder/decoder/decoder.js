let wasm;

const heap = new Array(32).fill(undefined);

heap.push(undefined, null, true, false);

function getObject(idx) {
  return heap[idx];
}

let heap_next = heap.length;

function dropObject(idx) {
  if (idx < 36) return;
  heap[idx] = heap_next;
  heap_next = idx;
}

function takeObject(idx) {
  const ret = getObject(idx);
  dropObject(idx);
  return ret;
}

function addHeapObject(obj) {
  if (heap_next === heap.length) heap.push(heap.length + 1);
  const idx = heap_next;
  heap_next = heap[idx];

  heap[idx] = obj;
  return idx;
}

const cachedTextDecoder = new TextDecoder("utf-8", {
  ignoreBOM: true,
  fatal: true,
});

cachedTextDecoder.decode();

let cachegetUint8Memory0 = null;
function getUint8Memory0() {
  if (
    cachegetUint8Memory0 === null ||
    cachegetUint8Memory0.buffer !== wasm.memory.buffer
  ) {
    cachegetUint8Memory0 = new Uint8Array(wasm.memory.buffer);
  }
  return cachegetUint8Memory0;
}

function getStringFromWasm0(ptr, len) {
  return cachedTextDecoder.decode(getUint8Memory0().subarray(ptr, ptr + len));
}

function debugString(val) {
  // primitive types
  const type = typeof val;
  if (type === "number" || type === "boolean" || val == null) {
    return `${val}`;
  }
  if (type === "string") {
    return `"${val}"`;
  }
  if (type === "symbol") {
    const description = val.description;
    if (description == null) {
      return "Symbol";
    } else {
      return `Symbol(${description})`;
    }
  }
  if (type === "function") {
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
  const builtInMatches = /\[object ([^\]]+)]/.exec(toString.call(val));
  let className;
  if (builtInMatches.length > 1) {
    className = builtInMatches[1];
  } else {
    // Failed to match the standard '[object ClassName]'
    return toString.call(val);
  }
  if (className === "Object") {
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
    const ptr = malloc(buf.length);
    getUint8Memory0()
      .subarray(ptr, ptr + buf.length)
      .set(buf);
    WASM_VECTOR_LEN = buf.length;
    return ptr;
  }

  let len = arg.length;
  let ptr = malloc(len);

  const mem = getUint8Memory0();

  let offset = 0;

  for (; offset < len; offset++) {
    const code = arg.charCodeAt(offset);
    if (code > 0x7f) break;
    mem[ptr + offset] = code;
  }

  if (offset !== len) {
    if (offset !== 0) {
      arg = arg.slice(offset);
    }
    ptr = realloc(ptr, len, (len = offset + arg.length * 3));
    const view = getUint8Memory0().subarray(ptr + offset, ptr + len);
    const ret = encodeString(arg, view);

    offset += ret.written;
  }

  WASM_VECTOR_LEN = offset;
  return ptr;
}

let cachegetInt32Memory0 = null;
function getInt32Memory0() {
  if (
    cachegetInt32Memory0 === null ||
    cachegetInt32Memory0.buffer !== wasm.memory.buffer
  ) {
    cachegetInt32Memory0 = new Int32Array(wasm.memory.buffer);
  }
  return cachegetInt32Memory0;
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
function __wbg_adapter_22(arg0, arg1, arg2) {
  wasm._dyn_core__ops__function__FnMut__A____Output___R_as_wasm_bindgen__closure__WasmClosure___describe__invoke__h165f74291acd46b4(
    arg0,
    arg1,
    addHeapObject(arg2)
  );
}

function handleError(f, args) {
  try {
    return f.apply(this, args);
  } catch (e) {
    wasm.__wbindgen_exn_store(addHeapObject(e));
  }
}

function _assertClass(instance, klass) {
  if (!(instance instanceof klass)) {
    throw new Error(`expected instance of ${klass.name}`);
  }
  return instance.ptr;
}
function __wbg_adapter_65(arg0, arg1, arg2, arg3) {
  wasm.wasm_bindgen__convert__closures__invoke2_mut__h7b4a9d0471de459f(
    arg0,
    arg1,
    addHeapObject(arg2),
    addHeapObject(arg3)
  );
}

/**
 */
export class CptvPlayerContext {
  static __wrap(ptr) {
    const obj = Object.create(CptvPlayerContext.prototype);
    obj.ptr = ptr;

    return obj;
  }

  __destroy_into_raw() {
    const ptr = this.ptr;
    this.ptr = 0;

    return ptr;
  }

  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_cptvplayercontext_free(ptr);
  }
  /**
   * @param {any} stream
   * @returns {Promise<CptvPlayerContext>}
   */
  static newWithStream(stream) {
    return takeObject(
      wasm.cptvplayercontext_newWithStream(addHeapObject(stream))
    );
  }
  /**
   * @returns {boolean}
   */
  streamComplete() {
    return wasm.cptvplayercontext_streamComplete(this.ptr) !== 0;
  }
  /**
   * @param {CptvPlayerContext} context
   * @returns {Promise<CptvPlayerContext>}
   */
  static countTotalFrames(context) {
    _assertClass(context, CptvPlayerContext);
    const ptr0 = context.ptr;
    context.ptr = 0;
    return takeObject(wasm.cptvplayercontext_countTotalFrames(ptr0));
  }
  /**
   * @param {CptvPlayerContext} context
   * @returns {Promise<CptvPlayerContext>}
   */
  static fetchNextFrame(context) {
    _assertClass(context, CptvPlayerContext);
    const ptr0 = context.ptr;
    context.ptr = 0;
    return takeObject(wasm.cptvplayercontext_fetchNextFrame(ptr0));
  }
  /**
   * @returns {any}
   */
  totalFrames() {
    return takeObject(wasm.cptvplayercontext_totalFrames(this.ptr));
  }
  /**
   * @returns {number}
   */
  bytesLoaded() {
    return wasm.cptvplayercontext_bytesLoaded(this.ptr) >>> 0;
  }
  /**
   * @returns {Uint16Array}
   */
  getNextFrame() {
    return takeObject(wasm.cptvplayercontext_getNextFrame(this.ptr));
  }
  /**
   * @returns {any}
   */
  getFrameHeader() {
    return takeObject(wasm.cptvplayercontext_getFrameHeader(this.ptr));
  }
  /**
   * @returns {number}
   */
  getWidth() {
    return wasm.cptvplayercontext_getWidth(this.ptr) >>> 0;
  }
  /**
   * @returns {number}
   */
  getHeight() {
    return wasm.cptvplayercontext_getHeight(this.ptr) >>> 0;
  }
  /**
   * @returns {number}
   */
  getFrameRate() {
    return wasm.cptvplayercontext_getFrameRate(this.ptr);
  }
  /**
   * @returns {number}
   */
  getFramesPerIframe() {
    return wasm.cptvplayercontext_getFramesPerIframe(this.ptr);
  }
  /**
   * @param {CptvPlayerContext} context
   * @returns {Promise<CptvPlayerContext>}
   */
  static fetchHeader(context) {
    _assertClass(context, CptvPlayerContext);
    const ptr0 = context.ptr;
    context.ptr = 0;
    return takeObject(wasm.cptvplayercontext_fetchHeader(ptr0));
  }
  /**
   * @returns {any}
   */
  getHeader() {
    return takeObject(wasm.cptvplayercontext_getHeader(this.ptr));
  }
}

async function load(module, imports) {
  if (typeof Response === "function" && module instanceof Response) {
    if (typeof WebAssembly.instantiateStreaming === "function") {
      try {
        return await WebAssembly.instantiateStreaming(module, imports);
      } catch (e) {
        if (module.headers.get("Content-Type") !== "application/wasm") {
          console.warn(
            "`WebAssembly.instantiateStreaming` failed because your server does not serve wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n",
            e
          );
        } else {
          throw e;
        }
      }
    }
    const bytes = await module.arrayBuffer();
    return await WebAssembly.instantiate(bytes, imports);
  } else {
    const instance = await WebAssembly.instantiate(module, imports);
    if (instance instanceof WebAssembly.Instance) {
      return { instance, module };
    } else {
      return instance;
    }
  }
}

async function init(input) {
  const imports = {};
  imports.wbg = {};
  imports.wbg.__wbindgen_object_drop_ref = function (arg0) {
    takeObject(arg0);
  };
  imports.wbg.__wbg_cptvplayercontext_new = function (arg0) {
    return addHeapObject(CptvPlayerContext.__wrap(arg0));
  };
  imports.wbg.__wbg_read_1abe9f2cfba7e73e = function () {
    return handleError(function (arg0) {
      return addHeapObject(getObject(arg0).read());
    }, arguments);
  };
  imports.wbg.__wbindgen_number_new = function (arg0) {
    return addHeapObject(arg0);
  };
  imports.wbg.__wbindgen_string_new = function (arg0, arg1) {
    return addHeapObject(getStringFromWasm0(arg0, arg1));
  };
  imports.wbg.__wbindgen_boolean_get = function (arg0) {
    const v = getObject(arg0);
    return typeof v === "boolean" ? (v ? 1 : 0) : 2;
  };
  imports.wbg.__wbindgen_is_undefined = function (arg0) {
    return getObject(arg0) === undefined;
  };
  imports.wbg.__wbindgen_cb_drop = function (arg0) {
    const obj = takeObject(arg0).original;
    if (obj.cnt-- === 1) {
      obj.a = 0;
      return true;
    }
    return false;
  };
  imports.wbg.__wbg_new_68adb0d58759a4ed = function () {
    return addHeapObject({});
  };
  imports.wbg.__wbg_set_2e79e744454afade = function (arg0, arg1, arg2) {
    getObject(arg0)[takeObject(arg1)] = takeObject(arg2);
  };
  imports.wbg.__wbindgen_object_clone_ref = function (arg0) {
    return addHeapObject(getObject(arg0));
  };
  imports.wbg.__wbg_debug_675b0ecb65722d2a = function (arg0) {
    console.debug(getObject(arg0));
  };
  imports.wbg.__wbg_error_cc38ce2b4b661e1d = function (arg0) {
    console.error(getObject(arg0));
  };
  imports.wbg.__wbg_info_e0c9813e6fd3bdc1 = function (arg0) {
    console.info(getObject(arg0));
  };
  imports.wbg.__wbg_log_3445347661d4505e = function (arg0) {
    console.log(getObject(arg0));
  };
  imports.wbg.__wbg_warn_5ec7c7c02d0b3841 = function (arg0) {
    console.warn(getObject(arg0));
  };
  imports.wbg.__wbg_new_693216e109162396 = function () {
    return addHeapObject(new Error());
  };
  imports.wbg.__wbg_stack_0ddaca5d1abfb52f = function (arg0, arg1) {
    const ptr0 = passStringToWasm0(
      getObject(arg1).stack,
      wasm.__wbindgen_malloc,
      wasm.__wbindgen_realloc
    );
    getInt32Memory0()[arg0 / 4 + 1] = WASM_VECTOR_LEN;
    getInt32Memory0()[arg0 / 4] = ptr0;
  };
  imports.wbg.__wbg_error_09919627ac0992f5 = function (arg0, arg1) {
    try {
      console.error(getStringFromWasm0(arg0, arg1));
    } finally {
      wasm.__wbindgen_free(arg0, arg1);
    }
  };
  imports.wbg.__wbg_get_4d0f21c2f823742e = function () {
    return handleError(function (arg0, arg1) {
      return addHeapObject(Reflect.get(getObject(arg0), getObject(arg1)));
    }, arguments);
  };
  imports.wbg.__wbg_new_342a24ca698edd87 = function (arg0, arg1) {
    return addHeapObject(new Error(getStringFromWasm0(arg0, arg1)));
  };
  imports.wbg.__wbg_call_346669c262382ad7 = function () {
    return handleError(function (arg0, arg1, arg2) {
      return addHeapObject(
        getObject(arg0).call(getObject(arg1), getObject(arg2))
      );
    }, arguments);
  };
  imports.wbg.__wbg_new_b1d61b5687f5e73a = function (arg0, arg1) {
    const state0 = { a: arg0, b: arg1 };
    try {
      const cb0 = (arg0, arg1) => {
        const a = state0.a;
        state0.a = 0;
        try {
          return __wbg_adapter_65(a, state0.b, arg0, arg1);
        } finally {
          state0.a = a;
        }
      };
      return addHeapObject(new Promise(cb0));
    } finally {
      state0.a = state0.b = 0;
    }
  };
  imports.wbg.__wbg_resolve_d23068002f584f22 = function (arg0) {
    return addHeapObject(Promise.resolve(getObject(arg0)));
  };
  imports.wbg.__wbg_then_2fcac196782070cc = function (arg0, arg1) {
    return addHeapObject(getObject(arg0).then(getObject(arg1)));
  };
  imports.wbg.__wbg_then_8c2d62e8ae5978f7 = function (arg0, arg1, arg2) {
    return addHeapObject(
      getObject(arg0).then(getObject(arg1), getObject(arg2))
    );
  };
  imports.wbg.__wbg_buffer_397eaa4d72ee94dd = function (arg0) {
    return addHeapObject(getObject(arg0).buffer);
  };
  imports.wbg.__wbg_new_a7ce447f15ff496f = function (arg0) {
    return addHeapObject(new Uint8Array(getObject(arg0)));
  };
  imports.wbg.__wbg_set_969ad0a60e51d320 = function (arg0, arg1, arg2) {
    getObject(arg0).set(getObject(arg1), arg2 >>> 0);
  };
  imports.wbg.__wbg_length_1eb8fc608a0d4cdb = function (arg0) {
    return getObject(arg0).length;
  };
  imports.wbg.__wbg_newwithbyteoffsetandlength_63181699967b1b75 = function (
    arg0,
    arg1,
    arg2
  ) {
    return addHeapObject(
      new Uint16Array(getObject(arg0), arg1 >>> 0, arg2 >>> 0)
    );
  };
  imports.wbg.__wbg_instanceof_Uint8Array_08a1f3a179095e76 = function (arg0) {
    return getObject(arg0) instanceof Uint8Array;
  };
  imports.wbg.__wbg_byteLength_3e250b41a8915757 = function (arg0) {
    return getObject(arg0).byteLength;
  };
  imports.wbg.__wbg_newwithlength_f70b25b8528b60fe = function (arg0) {
    return addHeapObject(new Uint16Array(arg0 >>> 0));
  };
  imports.wbg.__wbindgen_debug_string = function (arg0, arg1) {
    const ptr0 = passStringToWasm0(
      debugString(getObject(arg1)),
      wasm.__wbindgen_malloc,
      wasm.__wbindgen_realloc
    );
    getInt32Memory0()[arg0 / 4 + 1] = WASM_VECTOR_LEN;
    getInt32Memory0()[arg0 / 4] = ptr0;
  };
  imports.wbg.__wbindgen_throw = function (arg0, arg1) {
    throw new Error(getStringFromWasm0(arg0, arg1));
  };
  imports.wbg.__wbindgen_memory = function () {
    return addHeapObject(wasm.memory);
  };
  imports.wbg.__wbindgen_closure_wrapper248 = function (arg0, arg1) {
    return addHeapObject(makeMutClosure(arg0, arg1, 93, __wbg_adapter_22));
  };

  if (
    typeof input === "string" ||
    (typeof Request === "function" && input instanceof Request) ||
    (typeof URL === "function" && input instanceof URL)
  ) {
    input = fetch(input);
  }

  const { instance, module } = await load(await input, imports);

  wasm = instance.exports;
  init.__wbindgen_wasm_module = module;

  return wasm;
}

export default init;
