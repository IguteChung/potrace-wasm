

// The Module object: Our interface to the outside world. We import
// and export values on it. There are various ways Module can be used:
// 1. Not defined. We create it here
// 2. A function parameter, function(Module) { ..generated code.. }
// 3. pre-run appended it, var Module = {}; ..generated code..
// 4. External script tag defines var Module.
// We need to check if Module already exists (e.g. case 3 above).
// Substitution will be replaced with actual code on later stage of the build,
// this way Closure Compiler will not mangle it (e.g. case 4. above).
// Note that if you want to run closure, and also to use Module
// after the generated code, you will need to define   var Module = {};
// before the code. Then that object will be used in the code, and you
// can continue to use Module afterwards as well.
var Module = typeof Module !== 'undefined' ? Module : {};

// --pre-jses are emitted after the Module integration code, so that they can
// refer to Module (if they choose; they can also define Module)


// Sometimes an existing Module object exists with properties
// meant to overwrite the default module functionality. Here
// we collect those properties and reapply _after_ we configure
// the current environment's defaults to avoid having to be so
// defensive during initialization.
var moduleOverrides = {};
var key;
for (key in Module) {
  if (Module.hasOwnProperty(key)) {
    moduleOverrides[key] = Module[key];
  }
}

var arguments_ = [];
var thisProgram = './this.program';
var quit_ = function(status, toThrow) {
  throw toThrow;
};

// Determine the runtime environment we are in. You can customize this by
// setting the ENVIRONMENT setting at compile time (see settings.js).

var ENVIRONMENT_IS_WEB = false;
var ENVIRONMENT_IS_WORKER = false;
var ENVIRONMENT_IS_NODE = false;
var ENVIRONMENT_IS_SHELL = false;
ENVIRONMENT_IS_WEB = typeof window === 'object';
ENVIRONMENT_IS_WORKER = typeof importScripts === 'function';
// N.b. Electron.js environment is simultaneously a NODE-environment, but
// also a web environment.
ENVIRONMENT_IS_NODE = typeof process === 'object' && typeof process.versions === 'object' && typeof process.versions.node === 'string';
ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;

if (Module['ENVIRONMENT']) {
  throw new Error('Module.ENVIRONMENT has been deprecated. To force the environment, use the ENVIRONMENT compile-time option (for example, -s ENVIRONMENT=web or -s ENVIRONMENT=node)');
}

// `/` should be present at the end if `scriptDirectory` is not empty
var scriptDirectory = '';
function locateFile(path) {
  if (Module['locateFile']) {
    return Module['locateFile'](path, scriptDirectory);
  }
  return scriptDirectory + path;
}

// Hooks that are implemented differently in different runtime environments.
var read_,
    readAsync,
    readBinary,
    setWindowTitle;

var nodeFS;
var nodePath;

if (ENVIRONMENT_IS_NODE) {
  if (ENVIRONMENT_IS_WORKER) {
    scriptDirectory = require('path').dirname(scriptDirectory) + '/';
  } else {
    scriptDirectory = __dirname + '/';
  }

// include: node_shell_read.js


read_ = function shell_read(filename, binary) {
  var ret = tryParseAsDataURI(filename);
  if (ret) {
    return binary ? ret : ret.toString();
  }
  if (!nodeFS) nodeFS = require('fs');
  if (!nodePath) nodePath = require('path');
  filename = nodePath['normalize'](filename);
  return nodeFS['readFileSync'](filename, binary ? null : 'utf8');
};

readBinary = function readBinary(filename) {
  var ret = read_(filename, true);
  if (!ret.buffer) {
    ret = new Uint8Array(ret);
  }
  assert(ret.buffer);
  return ret;
};

// end include: node_shell_read.js
  if (process['argv'].length > 1) {
    thisProgram = process['argv'][1].replace(/\\/g, '/');
  }

  arguments_ = process['argv'].slice(2);

  if (typeof module !== 'undefined') {
    module['exports'] = Module;
  }

  process['on']('uncaughtException', function(ex) {
    // suppress ExitStatus exceptions from showing an error
    if (!(ex instanceof ExitStatus)) {
      throw ex;
    }
  });

  process['on']('unhandledRejection', abort);

  quit_ = function(status) {
    process['exit'](status);
  };

  Module['inspect'] = function () { return '[Emscripten Module object]'; };

} else
if (ENVIRONMENT_IS_SHELL) {

  if (typeof read != 'undefined') {
    read_ = function shell_read(f) {
      var data = tryParseAsDataURI(f);
      if (data) {
        return intArrayToString(data);
      }
      return read(f);
    };
  }

  readBinary = function readBinary(f) {
    var data;
    data = tryParseAsDataURI(f);
    if (data) {
      return data;
    }
    if (typeof readbuffer === 'function') {
      return new Uint8Array(readbuffer(f));
    }
    data = read(f, 'binary');
    assert(typeof data === 'object');
    return data;
  };

  if (typeof scriptArgs != 'undefined') {
    arguments_ = scriptArgs;
  } else if (typeof arguments != 'undefined') {
    arguments_ = arguments;
  }

  if (typeof quit === 'function') {
    quit_ = function(status) {
      quit(status);
    };
  }

  if (typeof print !== 'undefined') {
    // Prefer to use print/printErr where they exist, as they usually work better.
    if (typeof console === 'undefined') console = /** @type{!Console} */({});
    console.log = /** @type{!function(this:Console, ...*): undefined} */ (print);
    console.warn = console.error = /** @type{!function(this:Console, ...*): undefined} */ (typeof printErr !== 'undefined' ? printErr : print);
  }

} else

// Note that this includes Node.js workers when relevant (pthreads is enabled).
// Node.js workers are detected as a combination of ENVIRONMENT_IS_WORKER and
// ENVIRONMENT_IS_NODE.
if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
  if (ENVIRONMENT_IS_WORKER) { // Check worker, not web, since window could be polyfilled
    scriptDirectory = self.location.href;
  } else if (typeof document !== 'undefined' && document.currentScript) { // web
    scriptDirectory = document.currentScript.src;
  }
  // blob urls look like blob:http://site.com/etc/etc and we cannot infer anything from them.
  // otherwise, slice off the final part of the url to find the script directory.
  // if scriptDirectory does not contain a slash, lastIndexOf will return -1,
  // and scriptDirectory will correctly be replaced with an empty string.
  if (scriptDirectory.indexOf('blob:') !== 0) {
    scriptDirectory = scriptDirectory.substr(0, scriptDirectory.lastIndexOf('/')+1);
  } else {
    scriptDirectory = '';
  }

  // Differentiate the Web Worker from the Node Worker case, as reading must
  // be done differently.
  {

// include: web_or_worker_shell_read.js


  read_ = function(url) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);
      xhr.send(null);
      return xhr.responseText;
    } catch (err) {
      var data = tryParseAsDataURI(url);
      if (data) {
        return intArrayToString(data);
      }
      throw err;
    }
  };

  if (ENVIRONMENT_IS_WORKER) {
    readBinary = function(url) {
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, false);
        xhr.responseType = 'arraybuffer';
        xhr.send(null);
        return new Uint8Array(/** @type{!ArrayBuffer} */(xhr.response));
      } catch (err) {
        var data = tryParseAsDataURI(url);
        if (data) {
          return data;
        }
        throw err;
      }
    };
  }

  readAsync = function(url, onload, onerror) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function() {
      if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) { // file URLs can return 0
        onload(xhr.response);
        return;
      }
      var data = tryParseAsDataURI(url);
      if (data) {
        onload(data.buffer);
        return;
      }
      onerror();
    };
    xhr.onerror = onerror;
    xhr.send(null);
  };

// end include: web_or_worker_shell_read.js
  }

  setWindowTitle = function(title) { document.title = title };
} else
{
  throw new Error('environment detection error');
}

// Set up the out() and err() hooks, which are how we can print to stdout or
// stderr, respectively.
var out = Module['print'] || console.log.bind(console);
var err = Module['printErr'] || console.warn.bind(console);

// Merge back in the overrides
for (key in moduleOverrides) {
  if (moduleOverrides.hasOwnProperty(key)) {
    Module[key] = moduleOverrides[key];
  }
}
// Free the object hierarchy contained in the overrides, this lets the GC
// reclaim data used e.g. in memoryInitializerRequest, which is a large typed array.
moduleOverrides = null;

// Emit code to handle expected values on the Module object. This applies Module.x
// to the proper local x. This has two benefits: first, we only emit it if it is
// expected to arrive, and second, by using a local everywhere else that can be
// minified.

if (Module['arguments']) arguments_ = Module['arguments'];
if (!Object.getOwnPropertyDescriptor(Module, 'arguments')) {
  Object.defineProperty(Module, 'arguments', {
    configurable: true,
    get: function() {
      abort('Module.arguments has been replaced with plain arguments_ (the initial value can be provided on Module, but after startup the value is only looked for on a local variable of that name)')
    }
  });
}

if (Module['thisProgram']) thisProgram = Module['thisProgram'];
if (!Object.getOwnPropertyDescriptor(Module, 'thisProgram')) {
  Object.defineProperty(Module, 'thisProgram', {
    configurable: true,
    get: function() {
      abort('Module.thisProgram has been replaced with plain thisProgram (the initial value can be provided on Module, but after startup the value is only looked for on a local variable of that name)')
    }
  });
}

if (Module['quit']) quit_ = Module['quit'];
if (!Object.getOwnPropertyDescriptor(Module, 'quit')) {
  Object.defineProperty(Module, 'quit', {
    configurable: true,
    get: function() {
      abort('Module.quit has been replaced with plain quit_ (the initial value can be provided on Module, but after startup the value is only looked for on a local variable of that name)')
    }
  });
}

// perform assertions in shell.js after we set up out() and err(), as otherwise if an assertion fails it cannot print the message
// Assertions on removed incoming Module JS APIs.
assert(typeof Module['memoryInitializerPrefixURL'] === 'undefined', 'Module.memoryInitializerPrefixURL option was removed, use Module.locateFile instead');
assert(typeof Module['pthreadMainPrefixURL'] === 'undefined', 'Module.pthreadMainPrefixURL option was removed, use Module.locateFile instead');
assert(typeof Module['cdInitializerPrefixURL'] === 'undefined', 'Module.cdInitializerPrefixURL option was removed, use Module.locateFile instead');
assert(typeof Module['filePackagePrefixURL'] === 'undefined', 'Module.filePackagePrefixURL option was removed, use Module.locateFile instead');
assert(typeof Module['read'] === 'undefined', 'Module.read option was removed (modify read_ in JS)');
assert(typeof Module['readAsync'] === 'undefined', 'Module.readAsync option was removed (modify readAsync in JS)');
assert(typeof Module['readBinary'] === 'undefined', 'Module.readBinary option was removed (modify readBinary in JS)');
assert(typeof Module['setWindowTitle'] === 'undefined', 'Module.setWindowTitle option was removed (modify setWindowTitle in JS)');
assert(typeof Module['TOTAL_MEMORY'] === 'undefined', 'Module.TOTAL_MEMORY has been renamed Module.INITIAL_MEMORY');

if (!Object.getOwnPropertyDescriptor(Module, 'read')) {
  Object.defineProperty(Module, 'read', {
    configurable: true,
    get: function() {
      abort('Module.read has been replaced with plain read_ (the initial value can be provided on Module, but after startup the value is only looked for on a local variable of that name)')
    }
  });
}

if (!Object.getOwnPropertyDescriptor(Module, 'readAsync')) {
  Object.defineProperty(Module, 'readAsync', {
    configurable: true,
    get: function() {
      abort('Module.readAsync has been replaced with plain readAsync (the initial value can be provided on Module, but after startup the value is only looked for on a local variable of that name)')
    }
  });
}

if (!Object.getOwnPropertyDescriptor(Module, 'readBinary')) {
  Object.defineProperty(Module, 'readBinary', {
    configurable: true,
    get: function() {
      abort('Module.readBinary has been replaced with plain readBinary (the initial value can be provided on Module, but after startup the value is only looked for on a local variable of that name)')
    }
  });
}

if (!Object.getOwnPropertyDescriptor(Module, 'setWindowTitle')) {
  Object.defineProperty(Module, 'setWindowTitle', {
    configurable: true,
    get: function() {
      abort('Module.setWindowTitle has been replaced with plain setWindowTitle (the initial value can be provided on Module, but after startup the value is only looked for on a local variable of that name)')
    }
  });
}
var IDBFS = 'IDBFS is no longer included by default; build with -lidbfs.js';
var PROXYFS = 'PROXYFS is no longer included by default; build with -lproxyfs.js';
var WORKERFS = 'WORKERFS is no longer included by default; build with -lworkerfs.js';
var NODEFS = 'NODEFS is no longer included by default; build with -lnodefs.js';




var STACK_ALIGN = 16;

function alignMemory(size, factor) {
  if (!factor) factor = STACK_ALIGN; // stack alignment (16-byte) by default
  return Math.ceil(size / factor) * factor;
}

function getNativeTypeSize(type) {
  switch (type) {
    case 'i1': case 'i8': return 1;
    case 'i16': return 2;
    case 'i32': return 4;
    case 'i64': return 8;
    case 'float': return 4;
    case 'double': return 8;
    default: {
      if (type[type.length-1] === '*') {
        return 4; // A pointer
      } else if (type[0] === 'i') {
        var bits = Number(type.substr(1));
        assert(bits % 8 === 0, 'getNativeTypeSize invalid bits ' + bits + ', type ' + type);
        return bits / 8;
      } else {
        return 0;
      }
    }
  }
}

function warnOnce(text) {
  if (!warnOnce.shown) warnOnce.shown = {};
  if (!warnOnce.shown[text]) {
    warnOnce.shown[text] = 1;
    err(text);
  }
}

// include: runtime_functions.js


// Wraps a JS function as a wasm function with a given signature.
function convertJsFunctionToWasm(func, sig) {

  // If the type reflection proposal is available, use the new
  // "WebAssembly.Function" constructor.
  // Otherwise, construct a minimal wasm module importing the JS function and
  // re-exporting it.
  if (typeof WebAssembly.Function === "function") {
    var typeNames = {
      'i': 'i32',
      'j': 'i64',
      'f': 'f32',
      'd': 'f64'
    };
    var type = {
      parameters: [],
      results: sig[0] == 'v' ? [] : [typeNames[sig[0]]]
    };
    for (var i = 1; i < sig.length; ++i) {
      type.parameters.push(typeNames[sig[i]]);
    }
    return new WebAssembly.Function(type, func);
  }

  // The module is static, with the exception of the type section, which is
  // generated based on the signature passed in.
  var typeSection = [
    0x01, // id: section,
    0x00, // length: 0 (placeholder)
    0x01, // count: 1
    0x60, // form: func
  ];
  var sigRet = sig.slice(0, 1);
  var sigParam = sig.slice(1);
  var typeCodes = {
    'i': 0x7f, // i32
    'j': 0x7e, // i64
    'f': 0x7d, // f32
    'd': 0x7c, // f64
  };

  // Parameters, length + signatures
  typeSection.push(sigParam.length);
  for (var i = 0; i < sigParam.length; ++i) {
    typeSection.push(typeCodes[sigParam[i]]);
  }

  // Return values, length + signatures
  // With no multi-return in MVP, either 0 (void) or 1 (anything else)
  if (sigRet == 'v') {
    typeSection.push(0x00);
  } else {
    typeSection = typeSection.concat([0x01, typeCodes[sigRet]]);
  }

  // Write the overall length of the type section back into the section header
  // (excepting the 2 bytes for the section id and length)
  typeSection[1] = typeSection.length - 2;

  // Rest of the module is static
  var bytes = new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, // magic ("\0asm")
    0x01, 0x00, 0x00, 0x00, // version: 1
  ].concat(typeSection, [
    0x02, 0x07, // import section
      // (import "e" "f" (func 0 (type 0)))
      0x01, 0x01, 0x65, 0x01, 0x66, 0x00, 0x00,
    0x07, 0x05, // export section
      // (export "f" (func 0 (type 0)))
      0x01, 0x01, 0x66, 0x00, 0x00,
  ]));

   // We can compile this wasm module synchronously because it is very small.
  // This accepts an import (at "e.f"), that it reroutes to an export (at "f")
  var module = new WebAssembly.Module(bytes);
  var instance = new WebAssembly.Instance(module, {
    'e': {
      'f': func
    }
  });
  var wrappedFunc = instance.exports['f'];
  return wrappedFunc;
}

var freeTableIndexes = [];

// Weak map of functions in the table to their indexes, created on first use.
var functionsInTableMap;

function getEmptyTableSlot() {
  // Reuse a free index if there is one, otherwise grow.
  if (freeTableIndexes.length) {
    return freeTableIndexes.pop();
  }
  // Grow the table
  try {
    wasmTable.grow(1);
  } catch (err) {
    if (!(err instanceof RangeError)) {
      throw err;
    }
    throw 'Unable to grow wasm table. Set ALLOW_TABLE_GROWTH.';
  }
  return wasmTable.length - 1;
}

// Add a wasm function to the table.
function addFunctionWasm(func, sig) {
  // Check if the function is already in the table, to ensure each function
  // gets a unique index. First, create the map if this is the first use.
  if (!functionsInTableMap) {
    functionsInTableMap = new WeakMap();
    for (var i = 0; i < wasmTable.length; i++) {
      var item = wasmTable.get(i);
      // Ignore null values.
      if (item) {
        functionsInTableMap.set(item, i);
      }
    }
  }
  if (functionsInTableMap.has(func)) {
    return functionsInTableMap.get(func);
  }

  // It's not in the table, add it now.

  var ret = getEmptyTableSlot();

  // Set the new value.
  try {
    // Attempting to call this with JS function will cause of table.set() to fail
    wasmTable.set(ret, func);
  } catch (err) {
    if (!(err instanceof TypeError)) {
      throw err;
    }
    assert(typeof sig !== 'undefined', 'Missing signature argument to addFunction: ' + func);
    var wrapped = convertJsFunctionToWasm(func, sig);
    wasmTable.set(ret, wrapped);
  }

  functionsInTableMap.set(func, ret);

  return ret;
}

function removeFunction(index) {
  functionsInTableMap.delete(wasmTable.get(index));
  freeTableIndexes.push(index);
}

// 'sig' parameter is required for the llvm backend but only when func is not
// already a WebAssembly function.
function addFunction(func, sig) {
  assert(typeof func !== 'undefined');

  return addFunctionWasm(func, sig);
}

// end include: runtime_functions.js
// include: runtime_debug.js


// end include: runtime_debug.js
var tempRet0 = 0;

var setTempRet0 = function(value) {
  tempRet0 = value;
};

var getTempRet0 = function() {
  return tempRet0;
};



// === Preamble library stuff ===

// Documentation for the public APIs defined in this file must be updated in:
//    site/source/docs/api_reference/preamble.js.rst
// A prebuilt local version of the documentation is available at:
//    site/build/text/docs/api_reference/preamble.js.txt
// You can also build docs locally as HTML or other formats in site/
// An online HTML version (which may be of a different version of Emscripten)
//    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html

var wasmBinary;
if (Module['wasmBinary']) wasmBinary = Module['wasmBinary'];
if (!Object.getOwnPropertyDescriptor(Module, 'wasmBinary')) {
  Object.defineProperty(Module, 'wasmBinary', {
    configurable: true,
    get: function() {
      abort('Module.wasmBinary has been replaced with plain wasmBinary (the initial value can be provided on Module, but after startup the value is only looked for on a local variable of that name)')
    }
  });
}
var noExitRuntime = Module['noExitRuntime'] || true;
if (!Object.getOwnPropertyDescriptor(Module, 'noExitRuntime')) {
  Object.defineProperty(Module, 'noExitRuntime', {
    configurable: true,
    get: function() {
      abort('Module.noExitRuntime has been replaced with plain noExitRuntime (the initial value can be provided on Module, but after startup the value is only looked for on a local variable of that name)')
    }
  });
}

if (typeof WebAssembly !== 'object') {
  abort('no native wasm support detected');
}

// include: runtime_safe_heap.js


// In MINIMAL_RUNTIME, setValue() and getValue() are only available when building with safe heap enabled, for heap safety checking.
// In traditional runtime, setValue() and getValue() are always available (although their use is highly discouraged due to perf penalties)

/** @param {number} ptr
    @param {number} value
    @param {string} type
    @param {number|boolean=} noSafe */
function setValue(ptr, value, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch (type) {
      case 'i1': HEAP8[((ptr)>>0)] = value; break;
      case 'i8': HEAP8[((ptr)>>0)] = value; break;
      case 'i16': HEAP16[((ptr)>>1)] = value; break;
      case 'i32': HEAP32[((ptr)>>2)] = value; break;
      case 'i64': (tempI64 = [value>>>0,(tempDouble=value,(+(Math.abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? ((Math.min((+(Math.floor((tempDouble)/4294967296.0))), 4294967295.0))|0)>>>0 : (~~((+(Math.ceil((tempDouble - +(((~~(tempDouble)))>>>0))/4294967296.0)))))>>>0) : 0)],HEAP32[((ptr)>>2)] = tempI64[0],HEAP32[(((ptr)+(4))>>2)] = tempI64[1]); break;
      case 'float': HEAPF32[((ptr)>>2)] = value; break;
      case 'double': HEAPF64[((ptr)>>3)] = value; break;
      default: abort('invalid type for setValue: ' + type);
    }
}

/** @param {number} ptr
    @param {string} type
    @param {number|boolean=} noSafe */
function getValue(ptr, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch (type) {
      case 'i1': return HEAP8[((ptr)>>0)];
      case 'i8': return HEAP8[((ptr)>>0)];
      case 'i16': return HEAP16[((ptr)>>1)];
      case 'i32': return HEAP32[((ptr)>>2)];
      case 'i64': return HEAP32[((ptr)>>2)];
      case 'float': return HEAPF32[((ptr)>>2)];
      case 'double': return HEAPF64[((ptr)>>3)];
      default: abort('invalid type for getValue: ' + type);
    }
  return null;
}

// end include: runtime_safe_heap.js
// Wasm globals

var wasmMemory;

//========================================
// Runtime essentials
//========================================

// whether we are quitting the application. no code should run after this.
// set in exit() and abort()
var ABORT = false;

// set by exit() and abort().  Passed to 'onExit' handler.
// NOTE: This is also used as the process return code code in shell environments
// but only when noExitRuntime is false.
var EXITSTATUS;

/** @type {function(*, string=)} */
function assert(condition, text) {
  if (!condition) {
    abort('Assertion failed: ' + text);
  }
}

// Returns the C function with a specified identifier (for C++, you need to do manual name mangling)
function getCFunc(ident) {
  var func = Module['_' + ident]; // closure exported function
  assert(func, 'Cannot call unknown function ' + ident + ', make sure it is exported');
  return func;
}

// C calling interface.
/** @param {string|null=} returnType
    @param {Array=} argTypes
    @param {Arguments|Array=} args
    @param {Object=} opts */
function ccall(ident, returnType, argTypes, args, opts) {
  // For fast lookup of conversion functions
  var toC = {
    'string': function(str) {
      var ret = 0;
      if (str !== null && str !== undefined && str !== 0) { // null string
        // at most 4 bytes per UTF-8 code point, +1 for the trailing '\0'
        var len = (str.length << 2) + 1;
        ret = stackAlloc(len);
        stringToUTF8(str, ret, len);
      }
      return ret;
    },
    'array': function(arr) {
      var ret = stackAlloc(arr.length);
      writeArrayToMemory(arr, ret);
      return ret;
    }
  };

  function convertReturnValue(ret) {
    if (returnType === 'string') return UTF8ToString(ret);
    if (returnType === 'boolean') return Boolean(ret);
    return ret;
  }

  var func = getCFunc(ident);
  var cArgs = [];
  var stack = 0;
  assert(returnType !== 'array', 'Return type should not be "array".');
  if (args) {
    for (var i = 0; i < args.length; i++) {
      var converter = toC[argTypes[i]];
      if (converter) {
        if (stack === 0) stack = stackSave();
        cArgs[i] = converter(args[i]);
      } else {
        cArgs[i] = args[i];
      }
    }
  }
  var ret = func.apply(null, cArgs);

  ret = convertReturnValue(ret);
  if (stack !== 0) stackRestore(stack);
  return ret;
}

/** @param {string=} returnType
    @param {Array=} argTypes
    @param {Object=} opts */
function cwrap(ident, returnType, argTypes, opts) {
  return function() {
    return ccall(ident, returnType, argTypes, arguments, opts);
  }
}

// We used to include malloc/free by default in the past. Show a helpful error in
// builds with assertions.
function _malloc() {
  abort("malloc() called but not included in the build - add '_malloc' to EXPORTED_FUNCTIONS");
}
function _free() {
  // Show a helpful error since we used to include free by default in the past.
  abort("free() called but not included in the build - add '_free' to EXPORTED_FUNCTIONS");
}

var ALLOC_NORMAL = 0; // Tries to use _malloc()
var ALLOC_STACK = 1; // Lives for the duration of the current function call

// allocate(): This is for internal use. You can use it yourself as well, but the interface
//             is a little tricky (see docs right below). The reason is that it is optimized
//             for multiple syntaxes to save space in generated code. So you should
//             normally not use allocate(), and instead allocate memory using _malloc(),
//             initialize it with setValue(), and so forth.
// @slab: An array of data.
// @allocator: How to allocate memory, see ALLOC_*
/** @type {function((Uint8Array|Array<number>), number)} */
function allocate(slab, allocator) {
  var ret;
  assert(typeof allocator === 'number', 'allocate no longer takes a type argument')
  assert(typeof slab !== 'number', 'allocate no longer takes a number as arg0')

  if (allocator == ALLOC_STACK) {
    ret = stackAlloc(slab.length);
  } else {
    ret = abort('malloc was not included, but is needed in allocate. Adding "_malloc" to EXPORTED_FUNCTIONS should fix that. This may be a bug in the compiler, please file an issue.');;
  }

  if (slab.subarray || slab.slice) {
    HEAPU8.set(/** @type {!Uint8Array} */(slab), ret);
  } else {
    HEAPU8.set(new Uint8Array(slab), ret);
  }
  return ret;
}

// include: runtime_strings.js


// runtime_strings.js: Strings related runtime functions that are part of both MINIMAL_RUNTIME and regular runtime.

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the given array that contains uint8 values, returns
// a copy of that string as a Javascript String object.

var UTF8Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf8') : undefined;

/**
 * @param {number} idx
 * @param {number=} maxBytesToRead
 * @return {string}
 */
function UTF8ArrayToString(heap, idx, maxBytesToRead) {
  var endIdx = idx + maxBytesToRead;
  var endPtr = idx;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  // (As a tiny code save trick, compare endPtr against endIdx using a negation, so that undefined means Infinity)
  while (heap[endPtr] && !(endPtr >= endIdx)) ++endPtr;

  if (endPtr - idx > 16 && heap.subarray && UTF8Decoder) {
    return UTF8Decoder.decode(heap.subarray(idx, endPtr));
  } else {
    var str = '';
    // If building with TextDecoder, we have already computed the string length above, so test loop end condition against that
    while (idx < endPtr) {
      // For UTF8 byte structure, see:
      // http://en.wikipedia.org/wiki/UTF-8#Description
      // https://www.ietf.org/rfc/rfc2279.txt
      // https://tools.ietf.org/html/rfc3629
      var u0 = heap[idx++];
      if (!(u0 & 0x80)) { str += String.fromCharCode(u0); continue; }
      var u1 = heap[idx++] & 63;
      if ((u0 & 0xE0) == 0xC0) { str += String.fromCharCode(((u0 & 31) << 6) | u1); continue; }
      var u2 = heap[idx++] & 63;
      if ((u0 & 0xF0) == 0xE0) {
        u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
      } else {
        if ((u0 & 0xF8) != 0xF0) warnOnce('Invalid UTF-8 leading byte 0x' + u0.toString(16) + ' encountered when deserializing a UTF-8 string in wasm memory to a JS string!');
        u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | (heap[idx++] & 63);
      }

      if (u0 < 0x10000) {
        str += String.fromCharCode(u0);
      } else {
        var ch = u0 - 0x10000;
        str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
      }
    }
  }
  return str;
}

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the emscripten HEAP, returns a
// copy of that string as a Javascript String object.
// maxBytesToRead: an optional length that specifies the maximum number of bytes to read. You can omit
//                 this parameter to scan the string until the first \0 byte. If maxBytesToRead is
//                 passed, and the string at [ptr, ptr+maxBytesToReadr[ contains a null byte in the
//                 middle, then the string will cut short at that byte index (i.e. maxBytesToRead will
//                 not produce a string of exact length [ptr, ptr+maxBytesToRead[)
//                 N.B. mixing frequent uses of UTF8ToString() with and without maxBytesToRead may
//                 throw JS JIT optimizations off, so it is worth to consider consistently using one
//                 style or the other.
/**
 * @param {number} ptr
 * @param {number=} maxBytesToRead
 * @return {string}
 */
function UTF8ToString(ptr, maxBytesToRead) {
  return ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead) : '';
}

// Copies the given Javascript String object 'str' to the given byte array at address 'outIdx',
// encoded in UTF8 form and null-terminated. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   heap: the array to copy to. Each index in this array is assumed to be one 8-byte element.
//   outIdx: The starting offset in the array to begin the copying.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array.
//                    This count should include the null terminator,
//                    i.e. if maxBytesToWrite=1, only the null terminator will be written and nothing else.
//                    maxBytesToWrite=0 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8Array(str, heap, outIdx, maxBytesToWrite) {
  if (!(maxBytesToWrite > 0)) // Parameter maxBytesToWrite is not optional. Negative values, 0, null, undefined and false each don't write out any bytes.
    return 0;

  var startIdx = outIdx;
  var endIdx = outIdx + maxBytesToWrite - 1; // -1 for string null terminator.
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) {
      var u1 = str.charCodeAt(++i);
      u = 0x10000 + ((u & 0x3FF) << 10) | (u1 & 0x3FF);
    }
    if (u <= 0x7F) {
      if (outIdx >= endIdx) break;
      heap[outIdx++] = u;
    } else if (u <= 0x7FF) {
      if (outIdx + 1 >= endIdx) break;
      heap[outIdx++] = 0xC0 | (u >> 6);
      heap[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0xFFFF) {
      if (outIdx + 2 >= endIdx) break;
      heap[outIdx++] = 0xE0 | (u >> 12);
      heap[outIdx++] = 0x80 | ((u >> 6) & 63);
      heap[outIdx++] = 0x80 | (u & 63);
    } else {
      if (outIdx + 3 >= endIdx) break;
      if (u >= 0x200000) warnOnce('Invalid Unicode code point 0x' + u.toString(16) + ' encountered when serializing a JS string to a UTF-8 string in wasm memory! (Valid unicode code points should be in range 0-0x1FFFFF).');
      heap[outIdx++] = 0xF0 | (u >> 18);
      heap[outIdx++] = 0x80 | ((u >> 12) & 63);
      heap[outIdx++] = 0x80 | ((u >> 6) & 63);
      heap[outIdx++] = 0x80 | (u & 63);
    }
  }
  // Null-terminate the pointer to the buffer.
  heap[outIdx] = 0;
  return outIdx - startIdx;
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF8 form. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8(str, outPtr, maxBytesToWrite) {
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF8(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  return stringToUTF8Array(str, HEAPU8,outPtr, maxBytesToWrite);
}

// Returns the number of bytes the given Javascript string takes if encoded as a UTF8 byte array, EXCLUDING the null terminator byte.
function lengthBytesUTF8(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) ++len;
    else if (u <= 0x7FF) len += 2;
    else if (u <= 0xFFFF) len += 3;
    else len += 4;
  }
  return len;
}

// end include: runtime_strings.js
// include: runtime_strings_extra.js


// runtime_strings_extra.js: Strings related runtime functions that are available only in regular runtime.

// Given a pointer 'ptr' to a null-terminated ASCII-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function AsciiToString(ptr) {
  var str = '';
  while (1) {
    var ch = HEAPU8[((ptr++)>>0)];
    if (!ch) return str;
    str += String.fromCharCode(ch);
  }
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in ASCII form. The copy will require at most str.length+1 bytes of space in the HEAP.

function stringToAscii(str, outPtr) {
  return writeAsciiToMemory(str, outPtr, false);
}

// Given a pointer 'ptr' to a null-terminated UTF16LE-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

var UTF16Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-16le') : undefined;

function UTF16ToString(ptr, maxBytesToRead) {
  assert(ptr % 2 == 0, 'Pointer passed to UTF16ToString must be aligned to two bytes!');
  var endPtr = ptr;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  var idx = endPtr >> 1;
  var maxIdx = idx + maxBytesToRead / 2;
  // If maxBytesToRead is not passed explicitly, it will be undefined, and this
  // will always evaluate to true. This saves on code size.
  while (!(idx >= maxIdx) && HEAPU16[idx]) ++idx;
  endPtr = idx << 1;

  if (endPtr - ptr > 32 && UTF16Decoder) {
    return UTF16Decoder.decode(HEAPU8.subarray(ptr, endPtr));
  } else {
    var str = '';

    // If maxBytesToRead is not passed explicitly, it will be undefined, and the for-loop's condition
    // will always evaluate to true. The loop is then terminated on the first null char.
    for (var i = 0; !(i >= maxBytesToRead / 2); ++i) {
      var codeUnit = HEAP16[(((ptr)+(i*2))>>1)];
      if (codeUnit == 0) break;
      // fromCharCode constructs a character from a UTF-16 code unit, so we can pass the UTF16 string right through.
      str += String.fromCharCode(codeUnit);
    }

    return str;
  }
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF16 form. The copy will require at most str.length*4+2 bytes of space in the HEAP.
// Use the function lengthBytesUTF16() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=2, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<2 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF16(str, outPtr, maxBytesToWrite) {
  assert(outPtr % 2 == 0, 'Pointer passed to stringToUTF16 must be aligned to two bytes!');
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF16(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 2) return 0;
  maxBytesToWrite -= 2; // Null terminator.
  var startPtr = outPtr;
  var numCharsToWrite = (maxBytesToWrite < str.length*2) ? (maxBytesToWrite / 2) : str.length;
  for (var i = 0; i < numCharsToWrite; ++i) {
    // charCodeAt returns a UTF-16 encoded code unit, so it can be directly written to the HEAP.
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    HEAP16[((outPtr)>>1)] = codeUnit;
    outPtr += 2;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP16[((outPtr)>>1)] = 0;
  return outPtr - startPtr;
}

// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF16(str) {
  return str.length*2;
}

function UTF32ToString(ptr, maxBytesToRead) {
  assert(ptr % 4 == 0, 'Pointer passed to UTF32ToString must be aligned to four bytes!');
  var i = 0;

  var str = '';
  // If maxBytesToRead is not passed explicitly, it will be undefined, and this
  // will always evaluate to true. This saves on code size.
  while (!(i >= maxBytesToRead / 4)) {
    var utf32 = HEAP32[(((ptr)+(i*4))>>2)];
    if (utf32 == 0) break;
    ++i;
    // Gotcha: fromCharCode constructs a character from a UTF-16 encoded code (pair), not from a Unicode code point! So encode the code point to UTF-16 for constructing.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    if (utf32 >= 0x10000) {
      var ch = utf32 - 0x10000;
      str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
    } else {
      str += String.fromCharCode(utf32);
    }
  }
  return str;
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF32 form. The copy will require at most str.length*4+4 bytes of space in the HEAP.
// Use the function lengthBytesUTF32() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=4, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<4 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF32(str, outPtr, maxBytesToWrite) {
  assert(outPtr % 4 == 0, 'Pointer passed to stringToUTF32 must be aligned to four bytes!');
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF32(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 4) return 0;
  var startPtr = outPtr;
  var endPtr = startPtr + maxBytesToWrite - 4;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) {
      var trailSurrogate = str.charCodeAt(++i);
      codeUnit = 0x10000 + ((codeUnit & 0x3FF) << 10) | (trailSurrogate & 0x3FF);
    }
    HEAP32[((outPtr)>>2)] = codeUnit;
    outPtr += 4;
    if (outPtr + 4 > endPtr) break;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP32[((outPtr)>>2)] = 0;
  return outPtr - startPtr;
}

// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF32(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i);
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) ++i; // possibly a lead surrogate, so skip over the tail surrogate.
    len += 4;
  }

  return len;
}

// Allocate heap space for a JS string, and write it there.
// It is the responsibility of the caller to free() that memory.
function allocateUTF8(str) {
  var size = lengthBytesUTF8(str) + 1;
  var ret = abort('malloc was not included, but is needed in allocateUTF8. Adding "_malloc" to EXPORTED_FUNCTIONS should fix that. This may be a bug in the compiler, please file an issue.');;
  if (ret) stringToUTF8Array(str, HEAP8, ret, size);
  return ret;
}

// Allocate stack space for a JS string, and write it there.
function allocateUTF8OnStack(str) {
  var size = lengthBytesUTF8(str) + 1;
  var ret = stackAlloc(size);
  stringToUTF8Array(str, HEAP8, ret, size);
  return ret;
}

// Deprecated: This function should not be called because it is unsafe and does not provide
// a maximum length limit of how many bytes it is allowed to write. Prefer calling the
// function stringToUTF8Array() instead, which takes in a maximum length that can be used
// to be secure from out of bounds writes.
/** @deprecated
    @param {boolean=} dontAddNull */
function writeStringToMemory(string, buffer, dontAddNull) {
  warnOnce('writeStringToMemory is deprecated and should not be called! Use stringToUTF8() instead!');

  var /** @type {number} */ lastChar, /** @type {number} */ end;
  if (dontAddNull) {
    // stringToUTF8Array always appends null. If we don't want to do that, remember the
    // character that existed at the location where the null will be placed, and restore
    // that after the write (below).
    end = buffer + lengthBytesUTF8(string);
    lastChar = HEAP8[end];
  }
  stringToUTF8(string, buffer, Infinity);
  if (dontAddNull) HEAP8[end] = lastChar; // Restore the value under the null character.
}

function writeArrayToMemory(array, buffer) {
  assert(array.length >= 0, 'writeArrayToMemory array must have a length (should be an array or typed array)')
  HEAP8.set(array, buffer);
}

/** @param {boolean=} dontAddNull */
function writeAsciiToMemory(str, buffer, dontAddNull) {
  for (var i = 0; i < str.length; ++i) {
    assert(str.charCodeAt(i) === str.charCodeAt(i)&0xff);
    HEAP8[((buffer++)>>0)] = str.charCodeAt(i);
  }
  // Null-terminate the pointer to the HEAP.
  if (!dontAddNull) HEAP8[((buffer)>>0)] = 0;
}

// end include: runtime_strings_extra.js
// Memory management

function alignUp(x, multiple) {
  if (x % multiple > 0) {
    x += multiple - (x % multiple);
  }
  return x;
}

var HEAP,
/** @type {ArrayBuffer} */
  buffer,
/** @type {Int8Array} */
  HEAP8,
/** @type {Uint8Array} */
  HEAPU8,
/** @type {Int16Array} */
  HEAP16,
/** @type {Uint16Array} */
  HEAPU16,
/** @type {Int32Array} */
  HEAP32,
/** @type {Uint32Array} */
  HEAPU32,
/** @type {Float32Array} */
  HEAPF32,
/** @type {Float64Array} */
  HEAPF64;

function updateGlobalBufferAndViews(buf) {
  buffer = buf;
  Module['HEAP8'] = HEAP8 = new Int8Array(buf);
  Module['HEAP16'] = HEAP16 = new Int16Array(buf);
  Module['HEAP32'] = HEAP32 = new Int32Array(buf);
  Module['HEAPU8'] = HEAPU8 = new Uint8Array(buf);
  Module['HEAPU16'] = HEAPU16 = new Uint16Array(buf);
  Module['HEAPU32'] = HEAPU32 = new Uint32Array(buf);
  Module['HEAPF32'] = HEAPF32 = new Float32Array(buf);
  Module['HEAPF64'] = HEAPF64 = new Float64Array(buf);
}

var TOTAL_STACK = 5242880;
if (Module['TOTAL_STACK']) assert(TOTAL_STACK === Module['TOTAL_STACK'], 'the stack size can no longer be determined at runtime')

var INITIAL_MEMORY = Module['INITIAL_MEMORY'] || 16777216;
if (!Object.getOwnPropertyDescriptor(Module, 'INITIAL_MEMORY')) {
  Object.defineProperty(Module, 'INITIAL_MEMORY', {
    configurable: true,
    get: function() {
      abort('Module.INITIAL_MEMORY has been replaced with plain INITIAL_MEMORY (the initial value can be provided on Module, but after startup the value is only looked for on a local variable of that name)')
    }
  });
}

assert(INITIAL_MEMORY >= TOTAL_STACK, 'INITIAL_MEMORY should be larger than TOTAL_STACK, was ' + INITIAL_MEMORY + '! (TOTAL_STACK=' + TOTAL_STACK + ')');

// check for full engine support (use string 'subarray' to avoid closure compiler confusion)
assert(typeof Int32Array !== 'undefined' && typeof Float64Array !== 'undefined' && Int32Array.prototype.subarray !== undefined && Int32Array.prototype.set !== undefined,
       'JS engine does not provide full typed array support');

// If memory is defined in wasm, the user can't provide it.
assert(!Module['wasmMemory'], 'Use of `wasmMemory` detected.  Use -s IMPORTED_MEMORY to define wasmMemory externally');
assert(INITIAL_MEMORY == 16777216, 'Detected runtime INITIAL_MEMORY setting.  Use -s IMPORTED_MEMORY to define wasmMemory dynamically');

// include: runtime_init_table.js
// In regular non-RELOCATABLE mode the table is exported
// from the wasm module and this will be assigned once
// the exports are available.
var wasmTable;

// end include: runtime_init_table.js
// include: runtime_stack_check.js


// Initializes the stack cookie. Called at the startup of main and at the startup of each thread in pthreads mode.
function writeStackCookie() {
  var max = _emscripten_stack_get_end();
  assert((max & 3) == 0);
  // The stack grows downwards
  HEAPU32[(max >> 2)+1] = 0x2135467;
  HEAPU32[(max >> 2)+2] = 0x89BACDFE;
  // Also test the global address 0 for integrity.
  HEAP32[0] = 0x63736d65; /* 'emsc' */
}

function checkStackCookie() {
  if (ABORT) return;
  var max = _emscripten_stack_get_end();
  var cookie1 = HEAPU32[(max >> 2)+1];
  var cookie2 = HEAPU32[(max >> 2)+2];
  if (cookie1 != 0x2135467 || cookie2 != 0x89BACDFE) {
    abort('Stack overflow! Stack cookie has been overwritten, expected hex dwords 0x89BACDFE and 0x2135467, but received 0x' + cookie2.toString(16) + ' ' + cookie1.toString(16));
  }
  // Also test the global address 0 for integrity.
  if (HEAP32[0] !== 0x63736d65 /* 'emsc' */) abort('Runtime error: The application has corrupted its heap memory area (address zero)!');
}

// end include: runtime_stack_check.js
// include: runtime_assertions.js


// Endianness check
(function() {
  var h16 = new Int16Array(1);
  var h8 = new Int8Array(h16.buffer);
  h16[0] = 0x6373;
  if (h8[0] !== 0x73 || h8[1] !== 0x63) throw 'Runtime error: expected the system to be little-endian! (Run with -s SUPPORT_BIG_ENDIAN=1 to bypass)';
})();

// end include: runtime_assertions.js
var __ATPRERUN__  = []; // functions called before the runtime is initialized
var __ATINIT__    = []; // functions called during startup
var __ATMAIN__    = []; // functions called when main() is to be run
var __ATEXIT__    = []; // functions called during shutdown
var __ATPOSTRUN__ = []; // functions called after the main() is called

var runtimeInitialized = false;
var runtimeExited = false;

function preRun() {

  if (Module['preRun']) {
    if (typeof Module['preRun'] == 'function') Module['preRun'] = [Module['preRun']];
    while (Module['preRun'].length) {
      addOnPreRun(Module['preRun'].shift());
    }
  }

  callRuntimeCallbacks(__ATPRERUN__);
}

function initRuntime() {
  checkStackCookie();
  assert(!runtimeInitialized);
  runtimeInitialized = true;

  
  callRuntimeCallbacks(__ATINIT__);
}

function exitRuntime() {
  checkStackCookie();
  runtimeExited = true;
}

function postRun() {
  checkStackCookie();

  if (Module['postRun']) {
    if (typeof Module['postRun'] == 'function') Module['postRun'] = [Module['postRun']];
    while (Module['postRun'].length) {
      addOnPostRun(Module['postRun'].shift());
    }
  }

  callRuntimeCallbacks(__ATPOSTRUN__);
}

function addOnPreRun(cb) {
  __ATPRERUN__.unshift(cb);
}

function addOnInit(cb) {
  __ATINIT__.unshift(cb);
}

function addOnPreMain(cb) {
  __ATMAIN__.unshift(cb);
}

function addOnExit(cb) {
}

function addOnPostRun(cb) {
  __ATPOSTRUN__.unshift(cb);
}

// include: runtime_math.js


// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/imul

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/fround

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/clz32

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/trunc

assert(Math.imul, 'This browser does not support Math.imul(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill');
assert(Math.fround, 'This browser does not support Math.fround(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill');
assert(Math.clz32, 'This browser does not support Math.clz32(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill');
assert(Math.trunc, 'This browser does not support Math.trunc(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill');

// end include: runtime_math.js
// A counter of dependencies for calling run(). If we need to
// do asynchronous work before running, increment this and
// decrement it. Incrementing must happen in a place like
// Module.preRun (used by emcc to add file preloading).
// Note that you can add dependencies in preRun, even though
// it happens right before run - run will be postponed until
// the dependencies are met.
var runDependencies = 0;
var runDependencyWatcher = null;
var dependenciesFulfilled = null; // overridden to take different actions when all run dependencies are fulfilled
var runDependencyTracking = {};

function getUniqueRunDependency(id) {
  var orig = id;
  while (1) {
    if (!runDependencyTracking[id]) return id;
    id = orig + Math.random();
  }
}

function addRunDependency(id) {
  runDependencies++;

  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }

  if (id) {
    assert(!runDependencyTracking[id]);
    runDependencyTracking[id] = 1;
    if (runDependencyWatcher === null && typeof setInterval !== 'undefined') {
      // Check for missing dependencies every few seconds
      runDependencyWatcher = setInterval(function() {
        if (ABORT) {
          clearInterval(runDependencyWatcher);
          runDependencyWatcher = null;
          return;
        }
        var shown = false;
        for (var dep in runDependencyTracking) {
          if (!shown) {
            shown = true;
            err('still waiting on run dependencies:');
          }
          err('dependency: ' + dep);
        }
        if (shown) {
          err('(end of list)');
        }
      }, 10000);
    }
  } else {
    err('warning: run dependency added without ID');
  }
}

function removeRunDependency(id) {
  runDependencies--;

  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }

  if (id) {
    assert(runDependencyTracking[id]);
    delete runDependencyTracking[id];
  } else {
    err('warning: run dependency removed without ID');
  }
  if (runDependencies == 0) {
    if (runDependencyWatcher !== null) {
      clearInterval(runDependencyWatcher);
      runDependencyWatcher = null;
    }
    if (dependenciesFulfilled) {
      var callback = dependenciesFulfilled;
      dependenciesFulfilled = null;
      callback(); // can add another dependenciesFulfilled
    }
  }
}

Module["preloadedImages"] = {}; // maps url to image data
Module["preloadedAudios"] = {}; // maps url to audio data

/** @param {string|number=} what */
function abort(what) {
  if (Module['onAbort']) {
    Module['onAbort'](what);
  }

  what += '';
  err(what);

  ABORT = true;
  EXITSTATUS = 1;

  var output = 'abort(' + what + ') at ' + stackTrace();
  what = output;

  // Use a wasm runtime error, because a JS error might be seen as a foreign
  // exception, which means we'd run destructors on it. We need the error to
  // simply make the program stop.
  var e = new WebAssembly.RuntimeError(what);

  // Throw the error whether or not MODULARIZE is set because abort is used
  // in code paths apart from instantiation where an exception is expected
  // to be thrown when abort is called.
  throw e;
}

// {{MEM_INITIALIZER}}

// include: memoryprofiler.js


// end include: memoryprofiler.js
// show errors on likely calls to FS when it was not included
var FS = {
  error: function() {
    abort('Filesystem support (FS) was not included. The problem is that you are using files from JS, but files were not used from C/C++, so filesystem support was not auto-included. You can force-include filesystem support with  -s FORCE_FILESYSTEM=1');
  },
  init: function() { FS.error() },
  createDataFile: function() { FS.error() },
  createPreloadedFile: function() { FS.error() },
  createLazyFile: function() { FS.error() },
  open: function() { FS.error() },
  mkdev: function() { FS.error() },
  registerDevice: function() { FS.error() },
  analyzePath: function() { FS.error() },
  loadFilesFromDB: function() { FS.error() },

  ErrnoError: function ErrnoError() { FS.error() },
};
Module['FS_createDataFile'] = FS.createDataFile;
Module['FS_createPreloadedFile'] = FS.createPreloadedFile;

// include: URIUtils.js


// Prefix of data URIs emitted by SINGLE_FILE and related options.
var dataURIPrefix = 'data:application/octet-stream;base64,';

// Indicates whether filename is a base64 data URI.
function isDataURI(filename) {
  // Prefix of data URIs emitted by SINGLE_FILE and related options.
  return filename.startsWith(dataURIPrefix);
}

// Indicates whether filename is delivered via file protocol (as opposed to http/https)
function isFileURI(filename) {
  return filename.startsWith('file://');
}

// end include: URIUtils.js
function createExportWrapper(name, fixedasm) {
  return function() {
    var displayName = name;
    var asm = fixedasm;
    if (!fixedasm) {
      asm = Module['asm'];
    }
    assert(runtimeInitialized, 'native function `' + displayName + '` called before runtime initialization');
    assert(!runtimeExited, 'native function `' + displayName + '` called after runtime exit (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
    if (!asm[name]) {
      assert(asm[name], 'exported native function `' + displayName + '` not found');
    }
    return asm[name].apply(null, arguments);
  };
}

  var wasmBinaryFile = 'data:application/octet-stream;base64,AGFzbQEAAAAB8IGAgAAiYAF/AX9gAn9/AX9gA39/fwF/YAF/AGACf38AYAABf2ADf39/AGAEf39/fwF/YAV/f39/fwF/YAN/fn8BfmAAAGAEf39/fwBgBX9/f39/AGADf39/AXxgAn9/AXxgBH9/f38BfGADf3x8AGAGf3x/f39/AX9gAn5/AX9gBH9+fn8AYAd/f39/f399AX9gAn98AGACf3wBf2AEf3x/fwBgB39/f398f38Bf2AGf39/f39/AXxgBn98f39/fwBgAnx/AXxgB39/f39/f38Bf2ADfn9/AX9gAXwBfmACfn4BfGAEf39+fwF+YAR/fn9/AX8CvIGAgAAHA2VudgRleGl0AAMWd2FzaV9zbmFwc2hvdF9wcmV2aWV3MQhmZF9jbG9zZQAAFndhc2lfc25hcHNob3RfcHJldmlldzEIZmRfd3JpdGUABwNlbnYWZW1zY3JpcHRlbl9yZXNpemVfaGVhcAAAA2VudhVlbXNjcmlwdGVuX21lbWNweV9iaWcAAgNlbnYLc2V0VGVtcFJldDAAAxZ3YXNpX3NuYXBzaG90X3ByZXZpZXcxB2ZkX3NlZWsACAOUgYCAAJIBCgcLBwYGBgwEBAYFAwMDAQQCAAMCCAQEAwEBAgsEBAQAAQAUAQMEAQABAwEAAAAAAxUWAQECAQ0MDhcODRgGDg8PGRoNEBAFAQABAQEJAgAJAAAAAAICBQoAGwgcBgsAHRISDAIRBB4CAAcCAwABAQIBAgMDAAUTHxMAAwEBAQQFAAICAAIAAwAFAwAKBQUgCCEEhYCAgAABcAEKCgWHgICAAAEBgAKAgAIGk4CAgAADfwFBoMrAAgt/AUEAC38BQQALB+uBgIAADQZtZW1vcnkCABFfX3dhc21fY2FsbF9jdG9ycwAHBmZmbHVzaABYEF9fZXJybm9fbG9jYXRpb24ATgVzdGFydAAqGV9faW5kaXJlY3RfZnVuY3Rpb25fdGFibGUBAAlzdGFja1NhdmUAkAEMc3RhY2tSZXN0b3JlAJEBCnN0YWNrQWxsb2MAkgEVZW1zY3JpcHRlbl9zdGFja19pbml0AJMBGWVtc2NyaXB0ZW5fc3RhY2tfZ2V0X2ZyZWUAlAEYZW1zY3JpcHRlbl9zdGFja19nZXRfZW5kAJUBDGR5bkNhbGxfamlqaQCXAQmPgICAAAEA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LyAsaiEwIDAgqgE3AwAgAykDACGrASAHIKsBNwNwQbgBITEgByAxaiEyQfAAITMgByAzaiE0IDIgNBAQQdABITUgByA1aiE2IDYhN0G4ASE4IAcgOGohOSA5ITogOikCACGsASA3IKwBNwIAIAcoAuABITtBACE8IDwoAsglIT0gOyA9ayE+IAcgPjYCtAEgBygC5AEhP0EAIUAgQCgCzCUhQSA/IEFrIUIgByBCNgKwASAHKALYASFDQQAhRCBEKALIJSFFIEMgRWshRiAHIEY2AqwBIAcoAtwBIUdBACFIIEgoAswlIUkgRyBJayFKIAcgSjYCqAEgBygC0AEhS0EAIUwgTCgCyCUhTSBLIE1rIU4gByBONgKkASAHKALUASFPQQAhUCBQKALMJSFRIE8gUWshUiAHIFI2AqABIAcoAugBIVNBACFUIFMhVSBUIVYgVSBWRyFXQQEhWCBXIFhxIVkCQAJAIFlFDQAgBygCtAEhWiBatyGuASAHKALoASFbIFsrAxAhrwEgrgEgrwGiIbABILABtiHGASAHIMYBOAKcASAHKAKwASFcIFy3IbEBIAcoAugBIV0gXSsDGCGyASCxASCyAaIhswEgswG2IccBIAcgxwE4ApgBIAcoAqwBIV4gXrchtAEgBygC6AEhXyBfKwMQIbUBILQBILUBoiG2ASC2AbYhyAEgByDIATgClAEgBygCqAEhYCBgtyG3ASAHKALoASFhIGErAxghuAEgtwEguAGiIbkBILkBtiHJASAHIMkBOAKQASAHKAKkASFiIGK3IboBIAcoAugBIWMgYysDECG7ASC6ASC7AaIhvAEgvAG2IcoBIAcgygE4AowBIAcoAqABIWQgZLchvQEgBygC6AEhZSBlKwMYIb4BIL0BIL4BoiG/ASC/AbYhywEgByDLATgCiAFBywghZiAHIGY2AoQBQQAhZyBnLQDEJSFoQRghaSBoIGl0IWogaiBpdSFrQeMAIWwgayFtIGwhbiBtIG5GIW9BASFwIG8gcHEhcQJAIHFFDQAgBygChAEhckEBIXMgciBzaiF0IAcgdDYChAELIAcoAuwBIXUgBygChAEhdiAHKgKcASHMASDMAbshwAEgByoCmAEhzQEgzQG7IcEBIAcqApQBIc4BIM4BuyHCASAHKgKQASHPASDPAbshwwEgByoCjAEh0AEg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KAIIISYgAiAmNgIMDAELIAIoAgghJyAnEIIBIAIoAgQhKCAoEIIBQQAhKSACICk2AgwLIAIoAgwhKkEQISsgAiAraiEsICwkACAqDwvRAgErfyMAIQFBECECIAEgAmshAyADJAAgAyAANgIMIAMoAgwhBEEAIQUgBCEGIAUhByAGIAdHIQhBASEJIAggCXEhCgJAIApFDQAgAygCDCELIAsoAiAhDEEAIQ0gDCEOIA0hDyAOIA9HIRBBASERIBAgEXEhEgJAIBJFDQAgAygCDCETIBMoAiAhFCAUKAIEIRUgFRCCASADKAIMIRYgFigCICEXIBcoAgghGCAYEIIBIAMoAgwhGSAZKAIgIRogGigCFCEbIBsQggEgAygCDCEcIBwoAiAhHSAdKAIcIR4gHhCCASADKAIMIR8gHygCICEgQSAhISAgICFqISIgIhAUIAMoAgwhIyAjKAIgISRBwAAhJSAkICVqISYgJhAUCyADKAIMIScgJygCICEoICgQggELIAMoAgwhKSApEIIBQRAhKiADICpqISsgKyQADwugAQERfyMAIQFBECECIAEgAmshAyADJAAgAyAANgIMIAMoAgwhBCAEKAIEIQUgBRCCASADKAIMIQYgBigCCCEHIAcQggEgAygCDCEIIAgoAhAhCSAJEIIBIAMoAgwhCiAKKAIUIQsgCxCCASADKAIMIQwgDCgCGCENIA0QggEgAygCDCEOIA4oAhwhDyAPEIIBQRAhECADIBBqIREgESQADwvPAQEXfyMAIQFBECECIAEgAmshAyADJAAgAyAANgIMIAMoAgwhBCADIAQ2AggDQCADKAIIIQVBACEGIAUhByAGIQggByAIRyEJQQEhCiAJIApxIQsCQAJAIAtFDQAgAygCCCEMIAwoAhQhDSADIA02AgwgAygCCCEOQQAhDyAOIA82AhRBASEQIBAhEQwBC0EAIRIgEiERCyARIRMCQCATRQ0AIAMoAgghFCAUEBMgAygCDCEVIAMgFTYCCAwBCwtBECEWIAMgFmohFyAXJAAPC+kFAll/AX4jACECQRAhAyACIANrIQQgBCQAIAQgADYCCCAEIAE2AgQgBCgCCCEFQgAhWyAFIFs3AgBBGCEGIAUgBmohByAHIFs3AgBBECEIIAUgCGohCSAJIFs3AgBBCCEKIAUgCmohCyALIFs3AgAgBCgCBCEMIAQoAgghDSANIAw2AgAgBCgCBCEOQQQhDyAOIA8QgwEhECAEKAIIIREgESAQNgIEQQAhEiAQIRMgEiEUIBMgFEYhFUEBIRYgFSAWcSEXAkACQAJAIBdFDQAMAQsgBCgCBCEYQTAhGSAYIBkQgwEhGiAEKAIIIRsgGyAaNgIIQQAhHCAaIR0gHCEeIB0gHkYhH0EBISAgHyAgcSEhAkAgIUUNAAwBCyAEKAIEISJBECEjICIgIxCDASEkIAQoAgghJSAlICQ2AhBBACEmICQhJyAmISggJyAoRiEpQQEhKiApICpxISsCQCArRQ0ADAELIAQoAgQhLEEIIS0gLCAtEIMBIS4gBCgCCCEvIC8gLjYCFEEAITAgLiExIDAhMiAxIDJGITNBASE0IDMgNHEhNQJAIDVFDQAMAQsgBCgCBCE2QQghNyA2IDcQgwEhOCAEKAIIITkgOSA4NgIYQQAhOiA4ITsgOiE8IDsgPEYhPUEBIT4gPSA+cSE/AkAgP0UNAAwBCyAEKAIEIUBBCCFBIEAgQRCDASFCIAQoAgghQyBDIEI2AhxBACFEIEIhRSBEIUYgRSBGRiFHQQEhSCBHIEhxIUkCQCBJRQ0ADAELQQAhSiAEIEo2AgwMAQsgBCgCCCFLIEsoAgQhTCBMEIIBIAQoAgghTSBNKAIIIU4gThCCASAEKAIIIU8gTygCECFQIFAQggEgBCgCCCFRIFEoAhQhUiBSEIIBIAQoAgghUyBTKAIYIVQgVBCCASAEKAIIIVUgVSgCHCFWIFYQggFBASFXIAQgVzYCDAsgBCgCDCFYQRAhWSAEIFlqIVogWiQAIFgPC3YBDH8jACECQRAhAyACIANrIQQgBCAANgIMIAQgATYCCCAEKAIMIQUgBSgCACEGIAQoAgghByAHIAY2AgAgBCgCDCEIIAgoAgQhCSAEKAIIIQogCiAJNgIEIAQoAgwhCyALKAIIIQwgBCgCCCENIA0gDDYCCA8LvgoCmgF/CH4jACEDQTAhBCADIARrIQUgBSQAIAUgADYCKCAFIAE2AiQgBSACNgIgQQAhBiAFIAY2AhBBECEHIAUgB2ohCCAIIQkgBSAJNgIMQQAhCiAFIAo2AgggBSgCKCELIAsQGSEMIAUgDDYCCCAFKAIIIQ1BACEOIA0hDyAOIRAgDyAQRyERQQEhEiARIBJxIRMCQAJAAkAgEw0ADAELIAUoAgghFCAUEBpBACEVIAUgFTYCHCAFKAIIIRYgFigCBCEXQQEhGCAXIBhrIRkgBSAZNgIYAkADQCAFKAIIIRpBHCEbIAUgG2ohHCAcIR1BGCEeIAUgHmohHyAfISAgGiAdICAQGyEhICENASAFKAIcISJBACEjICIhJCAjISUgJCAlTiEmQQEhJyAmICdxISgCQAJAIChFDQAgBSgCHCEpIAUoAighKiAqKAIAISsgKSEsICshLSAsIC1IIS5BASEvIC4gL3EhMCAwRQ0AIAUoAhghMUEAITIgMSEzIDIhNCAzIDROITVBASE2IDUgNnEhNyA3RQ0AIAUoAhghOCAFKAIoITkgOSgCBCE6IDghOyA6ITwgOyA8SCE9QQEhPiA9ID5xIT8gP0UNACAFKAIoIUAgQCgCDCFBIAUoAhghQiAFKAIoIUMgQygCCCFEIEIgRGwhRUEDIUYgRSBGdCFHIEEgR2ohSCAFKAIcIUlBwAAhSiBJIEptIUtBAyFMIEsgTHQhTSBIIE1qIU4gTikDACGdASAFKAIcIU9BPyFQIE8gUHEhUSBRIVIgUq0hngFCgICAgICAgICAfyGfASCfASCeAYghoAEgnQEgoAGDIaEBQgAhogEgoQEhowEgogEhpAEgowEgpAFSIVNBASFUIFMgVHEhVSBVIVYMAQtBACFXIFchVgsgViFYQSshWUEtIVogWSBaIFgbIVsgBSBbNgIEIAUoAgghXCAFKAIcIV0gBSgCGCFeQQEhXyBeIF9qIWAgBSgCBCFhIAUoAiAhYiBiKAIEIWMgXCBdIGAgYSBjEBwhZCAFIGQ2AhQgBSgCFCFlQQAhZiBlIWcgZiFoIGcgaEYhaUEBIWogaSBqcSFrAkAga0UNAAwDCyAFKAIIIWwgBSgCFCFtIGwgbRAdIAUoAhQhbiBuKAIAIW8gBSgCICFwIHAoAgAhcSBvIXIgcSFzIHIgc0whdEEBIXUgdCB1cSF2AkACQCB2RQ0AIAUoAhQhdyB3EBMMAQsgBSgCDCF4IHgoAgAheSAFKAIUIXogeiB5NgIUIAUoAhQheyAFKAIMIXwgfCB7NgIAIAUoAhQhfUEUIX4gfSB+aiF/IAUgfzYCDAsMAAsACyAFKAIQIYABIAUoAgghgQEggAEggQEQHiAFKAIIIYIBIIIBEB8gBSgCECGDASAFKAIkIYQBIIQBIIMBNgIAQQAhhQEgBSCFATYCLAwBCyAFKAIIIYYBIIYBEB8gBSgCECGHASAFIIcBNgIUA0AgBSgCFCGIAUEAIYkBIIgBIYoBIIkBIYsBIIoBIIsBRyGMAUEBIY0BIIwBII0BcSGOAQJAAkAgjgFFDQAgBSgCFCGPASCPASgCFCGQASAFIJABNgIQIAUoAhQhkQFBACGSASCRASCSATYCFEEBIZMBIJMBIZQBDAELQQAhlQEglQEhlAELIJQBIZYBAkAglgFFDQAgBSgCFCGXASCXARATIAUoAhAhmAEgBSCYATYCFAwBCwtBfyGZASAFIJkBNgIsCyAFKAIsIZoBQTAhmwEgBSCbAWohnAEgnAEkACCaAQ8LqAMBNn8jACEBQRAhAiABIAJrIQMgAyQAIAMgADYCCCADKAIIIQQgBCgCACEFIAMoAgghBiAGKAIEIQcgBSAHECAhCCADIAg2AgQgAygCBCEJQQAhCiAJIQsgCiEMIAsgDEchDUEBIQ4gDSAOcSEPAkACQCAPDQBBACEQIAMgEDYCDAwBC0EAIREgAyARNgIAAkADQCADKAIAIRIgAygCCCETIBMoAgQhFCASIRUgFCEWIBUgFkghF0EBIRggFyAYcSEZIBlFDQEgAygCBCEaIBooAgwhGyADKAIAIRwgAygCBCEdIB0oAgghHiAcIB5sIR9BAyEgIB8gIHQhISAbICFqISIgAygCCCEjICMoAgwhJCADKAIAISUgAygCCCEmICYoAgghJyAlICdsIShBAyEpICggKXQhKiAkICpqISsgAygCBCEsICwoAgghLUEDIS4gLSAudCEvICIgKyAvEIkBGiADKAIAITBBASExIDAgMWohMiADIDI2AgAMAAsACyADKAIEITMgAyAzNgIMCyADKAIMITRBECE1IAMgNWohNiA2JAAgNA8L5QICKn8GfiMAIQFBICECIAEgAmshAyADIAA2AhwgAygCHCEEIAQoAgAhBUHAACEGIAUgBm8hBwJAIAdFDQAgAygCHCEIIAgoAgAhCUHAACEKIAkgCm8hC0HAACEMIAwgC2shDSANIQ4gDq0hK0J/ISwgLCArhiEtIAMgLTcDEEEAIQ8gAyAPNgIMAkADQCADKAIMIRAgAygCHCERIBEoAgQhEiAQIRMgEiEUIBMgFEghFUEBIRYgFSAWcSEXIBdFDQEgAykDECEuIAMoAhwhGCAYKAIMIRkgAygCDCEaIAMoAhwhGyAbKAIIIRwgGiAcbCEdQQMhHiAdIB50IR8gGSAfaiEgIAMoAhwhISAhKAIAISJBwAAhIyAiICNtISRBAyElICQgJXQhJiAgICZqIScgJykDACEvIC8gLoMhMCAnIDA3AwAgAygCDCEoQQEhKSAoIClqISogAyAqNgIMDAALAAsLDwu8CAKFAX8MfiMAIQNBICEEIAMgBGshBSAFIAA2AhggBSABNgIUIAUgAjYCECAFKAIUIQYgBigCACEHQUAhCCAHIAhxIQkgBSAJNgIEIAUoAhAhCiAKKAIAIQsgBSALNgIIAkACQANAIAUoAgghDEEAIQ0gDCEOIA0hDyAOIA9OIRBBASERIBAgEXEhEiASRQ0BIAUoAgQhEyAFIBM2AgwDQCAFKAIMIRQgBSgCGCEVIBUoAgAhFiAUIRcgFiEYIBcgGEghGUEAIRpBASEbIBkgG3EhHCAaIR0CQCAcRQ0AIAUoAgwhHkEAIR8gHiEgIB8hISAgICFOISIgIiEdCyAdISNBASEkICMgJHEhJQJAICVFDQAgBSgCGCEmICYoAgwhJyAFKAIIISggBSgCGCEpICkoAgghKiAoICpsIStBAyEsICsgLHQhLSAnIC1qIS4gBSgCDCEvQcAAITAgLyAwbSExQQMhMiAxIDJ0ITMgLiAzaiE0IDQpAwAhiAFCACGJASCIASGKASCJASGLASCKASCLAVIhNUEBITYgNSA2cSE3AkAgN0UNAANAIAUoAgwhOEEAITkgOCE6IDkhOyA6IDtOITxBASE9IDwgPXEhPgJAAkAgPkUNACAFKAIMIT8gBSgCGCFAIEAoAgAhQSA/IUIgQSFDIEIgQ0ghREEBIUUgRCBFcSFGIEZFDQAgBSgCCCFHQQAhSCBHIUkgSCFKIEkgSk4hS0EBIUwgSyBMcSFNIE1FDQAgBSgCCCFOIAUoAhghTyBPKAIEIVAgTiFRIFAhUiBRIFJIIVNBASFUIFMgVHEhVSBVRQ0AIAUoAhghViBWKAIMIVcgBSgCCCFYIAUoAhghWSBZKAIIIVogWCBabCFbQQMhXCBbIFx0IV0gVyBdaiFeIAUoAgwhX0HAACFgIF8gYG0hYUEDIWIgYSBidCFjIF4gY2ohZCBkKQMAIYwBIAUoAgwhZUE/IWYgZSBmcSFnIGchaCBorSGNAUKAgICAgICAgIB/IY4BII4BII0BiCGPASCMASCPAYMhkAFCACGRASCQASGSASCRASGTASCSASCTAVIhaUEBIWogaSBqcSFrIGshbAwBC0EAIW0gbSFsCyBsIW5BACFvIG4hcCBvIXEgcCBxRyFyQX8hcyByIHNzIXRBASF1IHQgdXEhdgJAIHZFDQAgBSgCDCF3QQEheCB3IHhqIXkgBSB5NgIMDAELCyAFKAIMIXogBSgCFCF7IHsgejYCACAFKAIIIXwgBSgCECF9IH0gfDYCAEEAIX4gBSB+NgIcDAULIAUoAgwhf0HAACGAASB/IIABaiGBASAFIIEBNgIMDAELC0EAIYIBIAUgggE2AgQgBSgCCCGDAUF/IYQBIIMBIIQBaiGFASAFIIUBNgIIDAALAAtBASGGASAFIIYBNgIcCyAFKAIcIYcBIIcBDwvmHgOeA38cfgV8IwAhBUHQACEGIAUgBmshByAHJAAgByAANgJIIAcgATYCRCAHIAI2AkAgByADNgI8IAcgBDYCOEEAIQggByAINgIAIAcoAkQhCSAHIAk2AjQgBygCQCEKIAcgCjYCMEEAIQsgByALNgIsQX8hDCAHIAw2AihBACENIAcgDTYCIEEAIQ4gByAONgIkQQAhDyAHIA82AghCACGjAyAHIKMDNwMYAkACQANAIAcoAiQhECAHKAIgIREgECESIBEhEyASIBNOIRRBASEVIBQgFXEhFgJAIBZFDQAgBygCICEXQeQAIRggFyAYaiEZIAcgGTYCICAHKAIgIRogGrchvwNEzczMzMzM9D8hwAMgwAMgvwOiIcEDIMEDmSHCA0QAAAAAAADgQSHDAyDCAyDDA2MhGyAbRSEcAkACQCAcDQAgwQOqIR0gHSEeDAELQYCAgIB4IR8gHyEeCyAeISAgByAgNgIgIAcoAgghISAHKAIgISJBAyEjICIgI3QhJCAhICQQhAEhJSAHICU2AgQgBygCBCEmQQAhJyAmISggJyEpICggKUchKkEBISsgKiArcSEsAkAgLA0ADAMLIAcoAgQhLSAHIC02AggLIAcoAjQhLiAHKAIIIS8gBygCJCEwQQMhMSAwIDF0ITIgLyAyaiEzIDMgLjYCACAHKAIwITQgBygCCCE1IAcoAiQhNkEDITcgNiA3dCE4IDUgOGohOSA5IDQ2AgQgBygCJCE6QQEhOyA6IDtqITwgByA8NgIkIAcoAiwhPSAHKAI0IT4gPiA9aiE/IAcgPzYCNCAHKAIoIUAgBygCMCFBIEEgQGohQiAHIEI2AjAgBygCNCFDIAcoAighRCBDIERsIUUgRSFGIEasIaQDIAcpAxghpQMgpQMgpAN8IaYDIAcgpgM3AxggBygCNCFHIAcoAkQhSCBHIUkgSCFKIEkgSkYhS0EBIUwgSyBMcSFNAkACQCBNRQ0AIAcoAjAhTiAHKAJAIU8gTiFQIE8hUSBQIFFGIVJBASFTIFIgU3EhVCBURQ0ADAELIAcoAjQhVSAHKAIsIVYgBygCKCFXIFYgV2ohWEEBIVkgWCBZayFaQQIhWyBaIFttIVwgVSBcaiFdQQAhXiBdIV8gXiFgIF8gYE4hYUEBIWIgYSBicSFjAkACQCBjRQ0AIAcoAjQhZCAHKAIsIWUgBygCKCFmIGUgZmohZ0EBIWggZyBoayFpQQIhaiBpIGptIWsgZCBraiFsIAcoAkghbSBtKAIAIW4gbCFvIG4hcCBvIHBIIXFBASFyIHEgcnEhcyBzRQ0AIAcoAjAhdCAHKAIoIXUgBygCLCF2IHUgdmshd0EBIXggdyB4ayF5QQIheiB5IHptIXsgdCB7aiF8QQAhfSB8IX4gfSF/IH4gf04hgAFBASGBASCAASCBAXEhggEgggFFDQAgBygCMCGDASAHKAIoIYQBIAcoAiwhhQEghAEghQFrIYYBQQEhhwEghgEghwFrIYgBQQIhiQEgiAEgiQFtIYoBIIMBIIoBaiGLASAHKAJIIYwBIIwBKAIEIY0BIIsBIY4BII0BIY8BII4BII8BSCGQAUEBIZEBIJABIJEBcSGSASCSAUUNACAHKAJIIZMBIJMBKAIMIZQBIAcoAjAhlQEgBygCKCGWASAHKAIsIZcBIJYBIJcBayGYAUEBIZkBIJgBIJkBayGaAUECIZsBIJoBIJsBbSGcASCVASCcAWohnQEgBygCSCGeASCeASgCCCGfASCdASCfAWwhoAFBAyGhASCgASChAXQhogEglAEgogFqIaMBIAcoAjQhpAEgBygCLCGlASAHKAIoIaYBIKUBIKYBaiGnAUEBIagBIKcBIKgBayGpAUECIaoBIKkBIKoBbSGrASCkASCrAWohrAFBwAAhrQEgrAEgrQFtIa4BQQMhrwEgrgEgrwF0IbABIKMBILABaiGxASCxASkDACGnAyAHKAI0IbIBIAcoAiwhswEgBygCKCG0ASCzASC0AWohtQFBASG2ASC1ASC2AWshtwFBAiG4ASC3ASC4AW0huQEgsgEguQFqIboBQT8huwEgugEguwFxIbwBILwBIb0BIL0BrSGoA0KAgICAgICAgIB/IakDIKkDIKgDiCGqAyCnAyCqA4MhqwNCACGsAyCrAyGtAyCsAyGuAyCtAyCuA1IhvgFBASG/ASC+ASC/AXEhwAEgwAEhwQEMAQtBACHCASDCASHBAQsgwQEhwwEgByDDATYCFCAHKAI0IcQBIAcoAiwhxQEgBygCKCHGASDFASDGAWshxwFBASHIASDHASDIAWshyQFBAiHKASDJASDKAW0hywEgxAEgywFqIcwBQQAhzQEgzAEhzgEgzQEhzwEgzgEgzwFOIdABQQEh0QEg0AEg0QFxIdIBAkACQCDSAUUNACAHKAI0IdMBIAcoAiwh1AEgBygCKCHVASDUASDVAWsh1gFBASHXASDWASDXAWsh2AFBAiHZASDYASDZAW0h2gEg0wEg2gFqIdsBIAcoAkgh3AEg3AEoAgAh3QEg2wEh3gEg3QEh3wEg3gEg3wFIIeABQQEh4QEg4AEg4QFxIeIBIOIBRQ0AIAcoAjAh4wEgBygCKCHkASAHKAIsIeUBIOQBIOUBaiHmAUEBIecBIOYBIOcBayHoAUECIekBIOgBIOkBbSHqASDjASDqAWoh6wFBACHsASDrASHtASDsASHuASDtASDuAU4h7wFBASHwASDvASDwAXEh8QEg8QFFDQAgBygCMCHyASAHKAIoIfMBIAcoAiwh9AEg8wEg9AFqIfUBQQEh9gEg9QEg9gFrIfcBQQIh+AEg9wEg+AFtIfkBIPIBIPkBaiH6ASAHKAJIIfsBIPsBKAIEIfwBIPoBIf0BIPwBIf4BIP0BIP4BSCH/AUEBIYACIP8BIIACcSGBAiCBAkUNACAHKAJIIYICIIICKAIMIYMCIAcoAjAhhAIgBygCKCGFAiAHKAIsIYYCIIUCIIYCaiGHAkEBIYgCIIcCIIgCayGJAkECIYoCIIkCIIoCbSGLAiCEAiCLAmohjAIgBygCSCGNAiCNAigCCCGOAiCMAiCOAmwhjwJBAyGQAiCPAiCQAnQhkQIggwIgkQJqIZICIAcoAjQhkwIgBygCLCGUAiAHKAIoIZUCIJQCIJUCayGWAkEBIZcCIJYCIJcCayGYAkECIZkCIJgCIJkCbSGaAiCTAiCaAmohmwJBwAAhnAIgmwIgnAJtIZ0CQQMhngIgnQIgngJ0IZ8CIJICIJ8CaiGgAiCgAikDACGvAyAHKAI0IaECIAcoAiwhogIgBygCKCGjAiCiAiCjAmshpAJBASGlAiCkAiClAmshpgJBAiGnAiCmAiCnAm0hqAIgoQIgqAJqIakCQT8hqgIgqQIgqgJxIasCIKsCIawCIKwCrSGwA0KAgICAgICAgIB/IbEDILEDILADiCGyAyCvAyCyA4MhswNCACG0AyCzAyG1AyC0AyG2AyC1AyC2A1IhrQJBASGuAiCtAiCuAnEhrwIgrwIhsAIMAQtBACGxAiCxAiGwAgsgsAIhsgIgByCyAjYCECAHKAIUIbMCAkACQCCzAkUNACAHKAIQIbQCILQCDQAgBygCOCG1AkEDIbYCILUCIbcCILYCIbgCILcCILgCRiG5AkEBIboCILkCILoCcSG7AgJAAkACQCC7Ag0AIAcoAjghvAICQCC8Ag0AIAcoAjwhvQJBKyG+AiC9AiG/AiC+AiHAAiC/AiDAAkYhwQJBASHCAiDBAiDCAnEhwwIgwwINAQsgBygCOCHEAkEBIcUCIMQCIcYCIMUCIccCIMYCIMcCRiHIAkEBIckCIMgCIMkCcSHKAgJAIMoCRQ0AIAcoAjwhywJBLSHMAiDLAiHNAiDMAiHOAiDNAiDOAkYhzwJBASHQAiDPAiDQAnEh0QIg0QINAQsgBygCOCHSAkEGIdMCINICIdQCINMCIdUCINQCINUCRiHWAkEBIdcCINYCINcCcSHYAgJAINgCRQ0AIAcoAjQh2QIgBygCMCHaAiDZAiDaAhAhIdsCINsCDQELIAcoAjgh3AJBBSHdAiDcAiHeAiDdAiHfAiDeAiDfAkYh4AJBASHhAiDgAiDhAnEh4gICQCDiAkUNACAHKAJIIeMCIAcoAjQh5AIgBygCMCHlAiDjAiDkAiDlAhAiIeYCIOYCDQELIAcoAjgh5wJBBCHoAiDnAiHpAiDoAiHqAiDpAiDqAkYh6wJBASHsAiDrAiDsAnEh7QIg7QJFDQEgBygCSCHuAiAHKAI0Ie8CIAcoAjAh8AIg7gIg7wIg8AIQIiHxAiDxAg0BCyAHKAIsIfICIAcg8gI2AgwgBygCKCHzAiAHIPMCNgIsIAcoAgwh9AJBACH1AiD1AiD0Amsh9gIgByD2AjYCKAwBCyAHKAIsIfcCIAcg9wI2AgwgBygCKCH4AkEAIfkCIPkCIPgCayH6AiAHIPoCNgIsIAcoAgwh+wIgByD7AjYCKAsMAQsgBygCFCH8AgJAAkAg/AJFDQAgBygCLCH9AiAHIP0CNgIMIAcoAigh/gIgByD+AjYCLCAHKAIMIf8CQQAhgAMggAMg/wJrIYEDIAcggQM2AigMAQsgBygCECGCAwJAIIIDDQAgBygCLCGDAyAHIIMDNgIMIAcoAighhANBACGFAyCFAyCEA2shhgMgByCGAzYCLCAHKAIMIYcDIAcghwM2AigLCwsMAQsLEBIhiAMgByCIAzYCACAHKAIAIYkDQQAhigMgiQMhiwMgigMhjAMgiwMgjANHIY0DQQEhjgMgjQMgjgNxIY8DAkAgjwMNAAwBCyAHKAIIIZADIAcoAgAhkQMgkQMoAiAhkgMgkgMgkAM2AgQgBygCJCGTAyAHKAIAIZQDIJQDKAIgIZUDIJUDIJMDNgIAIAcpAxghtwNC/////wchuAMgtwMhuQMguAMhugMguQMgugNYIZYDQQEhlwMglgMglwNxIZgDAkACQCCYA0UNACAHKQMYIbsDILsDIbwDDAELQv////8HIb0DIL0DIbwDCyC8AyG+AyC+A6chmQMgBygCACGaAyCaAyCZAzYCACAHKAI8IZsDIAcoAgAhnAMgnAMgmwM2AgQgBygCACGdAyAHIJ0DNgJMDAELIAcoAgghngMgngMQggFBACGfAyAHIJ8DNgJMCyAHKAJMIaADQdAAIaEDIAcgoQNqIaIDIKIDJAAgoAMPC4EFAVN/IwAhAkEgIQMgAiADayEEIAQkACAEIAA2AhwgBCABNgIYIAQoAhghBSAFKAIgIQYgBigCACEHQQAhCCAHIQkgCCEKIAkgCkwhC0EBIQwgCyAMcSENAkACQCANRQ0ADAELIAQoAhghDiAOKAIgIQ8gDygCBCEQIAQoAhghESARKAIgIRIgEigCACETQQEhFCATIBRrIRVBAyEWIBUgFnQhFyAQIBdqIRggGCgCBCEZIAQgGTYCBCAEKAIYIRogGigCICEbIBsoAgQhHCAcKAIAIR1BQCEeIB0gHnEhHyAEIB82AhRBACEgIAQgIDYCCANAIAQoAgghISAEKAIYISIgIigCICEjICMoAgAhJCAhISUgJCEmICUgJkghJ0EBISggJyAocSEpIClFDQEgBCgCGCEqICooAiAhKyArKAIEISwgBCgCCCEtQQMhLiAtIC50IS8gLCAvaiEwIDAoAgAhMSAEIDE2AhAgBCgCGCEyIDIoAiAhMyAzKAIEITQgBCgCCCE1QQMhNiA1IDZ0ITcgNCA3aiE4IDgoAgQhOSAEIDk2AgwgBCgCDCE6IAQoAgQhOyA6ITwgOyE9IDwgPUchPkEBIT8gPiA/cSFAAkAgQEUNACAEKAIcIUEgBCgCECFCIAQoAgwhQyAEKAIEIUQgQyFFIEQhRiBFIEZIIUdBASFIIEcgSHEhSQJAAkAgSUUNACAEKAIMIUogSiFLDAELIAQoAgQhTCBMIUsLIEshTSAEKAIUIU4gQSBCIE0gThAjIAQoAgwhTyAEIE82AgQLIAQoAgghUEEBIVEgUCBRaiFSIAQgUjYCCAwACwALQSAhUyAEIFNqIVQgVCQADwvtFwLCAn8IfiMAIQJB0AAhAyACIANrIQQgBCQAIAQgADYCTCAEIAE2AkggBCgCSCEFQQAhBiAFIAYQJCAEKAJMIQcgBCAHNgJEAkADQCAEKAJEIQhBACEJIAghCiAJIQsgCiALRyEMQQEhDSAMIA1xIQ4gDkUNASAEKAJEIQ8gDygCFCEQIAQoAkQhESARIBA2AhwgBCgCRCESQQAhEyASIBM2AhggBCgCRCEUIBQoAhQhFSAEIBU2AkQMAAsACyAEKAJMIRYgBCAWNgI8AkADQCAEKAI8IRdBACEYIBchGSAYIRogGSAaRyEbQQEhHCAbIBxxIR0gHUUNASAEKAI8IR4gBCAeNgI0IAQoAjwhHyAfKAIYISAgBCAgNgI8IAQoAjQhIUEAISIgISAiNgIYIAQoAjQhIyAEICM2AjAgBCgCNCEkICQoAhQhJSAEICU2AjQgBCgCMCEmQQAhJyAmICc2AhQgBCgCSCEoIAQoAjAhKSAoICkQHSAEKAIwISpBECErIAQgK2ohLCAsIS0gLSAqECUgBCgCMCEuQRghLyAuIC9qITAgBCAwNgIoIAQoAjAhMUEUITIgMSAyaiEzIAQgMzYCJCAEKAI0ITQgBCA0NgJEA0AgBCgCRCE1QQAhNiA1ITcgNiE4IDcgOEchOUEBITogOSA6cSE7AkACQCA7RQ0AIAQoAkQhPCA8KAIUIT0gBCA9NgI0IAQoAkQhPkEAIT8gPiA/NgIUQQEhQCBAIUEMAQtBACFCIEIhQQsgQSFDAkAgQ0UNACAEKAJEIUQgRCgCICFFIEUoAgQhRiBGKAIEIUcgBCgCGCFIIEchSSBIIUogSSBKTCFLQQEhTCBLIExxIU0CQCBNRQ0AIAQoAiQhTiBOKAIAIU8gBCgCRCFQIFAgTzYCFCAEKAJEIVEgBCgCJCFSIFIgUTYCACAEKAJEIVNBFCFUIFMgVGohVSAEIFU2AiQgBCgCNCFWIAQoAiQhVyBXIFY2AgAMAQsgBCgCRCFYIFgoAiAhWSBZKAIEIVogWigCACFbQQAhXCBbIV0gXCFeIF0gXk4hX0EBIWAgXyBgcSFhAkACQAJAAkAgYUUNACAEKAJEIWIgYigCICFjIGMoAgQhZCBkKAIAIWUgBCgCSCFmIGYoAgAhZyBlIWggZyFpIGggaUghakEBIWsgaiBrcSFsIGxFDQAgBCgCRCFtIG0oAiAhbiBuKAIEIW8gbygCBCFwQQEhcSBwIHFrIXJBACFzIHIhdCBzIXUgdCB1TiF2QQEhdyB2IHdxIXggeEUNACAEKAJEIXkgeSgCICF6IHooAgQheyB7KAIEIXxBASF9IHwgfWshfiAEKAJIIX8gfygCBCGAASB+IYEBIIABIYIBIIEBIIIBSCGDAUEBIYQBIIMBIIQBcSGFASCFAUUNACAEKAJIIYYBIIYBKAIMIYcBIAQoAkQhiAEgiAEoAiAhiQEgiQEoAgQhigEgigEoAgQhiwFBASGMASCLASCMAWshjQEgBCgCSCGOASCOASgCCCGPASCNASCPAWwhkAFBAyGRASCQASCRAXQhkgEghwEgkgFqIZMBIAQoAkQhlAEglAEoAiAhlQEglQEoAgQhlgEglgEoAgAhlwFBwAAhmAEglwEgmAFtIZkBQQMhmgEgmQEgmgF0IZsBIJMBIJsBaiGcASCcASkDACHEAiAEKAJEIZ0BIJ0BKAIgIZ4BIJ4BKAIEIZ8BIJ8BKAIAIaABQT8hoQEgoAEgoQFxIaIBIKIBIaMBIKMBrSHFAkKAgICAgICAgIB/IcYCIMYCIMUCiCHHAiDEAiDHAoMhyAJCACHJAiDIAiHKAiDJAiHLAiDKAiDLAlIhpAFBASGlASCkASClAXEhpgEgpgENAQwCC0EAIacBQQEhqAEgpwEgqAFxIakBIKkBRQ0BCyAEKAIoIaoBIKoBKAIAIasBIAQoAkQhrAEgrAEgqwE2AhQgBCgCRCGtASAEKAIoIa4BIK4BIK0BNgIAIAQoAkQhrwFBFCGwASCvASCwAWohsQEgBCCxATYCKAwBCyAEKAIkIbIBILIBKAIAIbMBIAQoAkQhtAEgtAEgswE2AhQgBCgCRCG1ASAEKAIkIbYBILYBILUBNgIAIAQoAkQhtwFBFCG4ASC3ASC4AWohuQEgBCC5ATYCJAsgBCgCNCG6ASAEILoBNgJEDAELCyAEKAJIIbsBQRAhvAEgBCC8AWohvQEgvQEhvgEguwEgvgEQJiAEKAIwIb8BIL8BKAIUIcABQQAhwQEgwAEhwgEgwQEhwwEgwgEgwwFHIcQBQQEhxQEgxAEgxQFxIcYBAkAgxgFFDQAgBCgCPCHHASAEKAIwIcgBIMgBKAIUIckBIMkBIMcBNgIYIAQoAjAhygEgygEoAhQhywEgBCDLATYCPAsgBCgCMCHMASDMASgCGCHNAUEAIc4BIM0BIc8BIM4BIdABIM8BINABRyHRAUEBIdIBINEBINIBcSHTAQJAINMBRQ0AIAQoAjwh1AEgBCgCMCHVASDVASgCGCHWASDWASDUATYCGCAEKAIwIdcBINcBKAIYIdgBIAQg2AE2AjwLDAALAAsgBCgCTCHZASAEINkBNgJEAkADQCAEKAJEIdoBQQAh2wEg2gEh3AEg2wEh3QEg3AEg3QFHId4BQQEh3wEg3gEg3wFxIeABIOABRQ0BIAQoAkQh4QEg4QEoAhwh4gEgBCDiATYCQCAEKAJEIeMBIOMBKAIUIeQBIAQoAkQh5QEg5QEg5AE2AhwgBCgCQCHmASAEIOYBNgJEDAALAAsgBCgCTCHnASAEIOcBNgI8IAQoAjwh6AFBACHpASDoASHqASDpASHrASDqASDrAUch7AFBASHtASDsASDtAXEh7gECQCDuAUUNACAEKAI8Ie8BQQAh8AEg7wEg8AE2AhQLQQAh8QEgBCDxATYCTEHMACHyASAEIPIBaiHzASDzASH0ASAEIPQBNgIsAkADQCAEKAI8IfUBQQAh9gEg9QEh9wEg9gEh+AEg9wEg+AFHIfkBQQEh+gEg+QEg+gFxIfsBIPsBRQ0BIAQoAjwh/AEg/AEoAhQh/QEgBCD9ATYCOCAEKAI8If4BIAQg/gE2AkQCQANAIAQoAkQh/wFBACGAAiD/ASGBAiCAAiGCAiCBAiCCAkchgwJBASGEAiCDAiCEAnEhhQIghQJFDQEgBCgCLCGGAiCGAigCACGHAiAEKAJEIYgCIIgCIIcCNgIUIAQoAkQhiQIgBCgCLCGKAiCKAiCJAjYCACAEKAJEIYsCQRQhjAIgiwIgjAJqIY0CIAQgjQI2AiwgBCgCRCGOAiCOAigCGCGPAiAEII8CNgJAAkADQCAEKAJAIZACQQAhkQIgkAIhkgIgkQIhkwIgkgIgkwJHIZQCQQEhlQIglAIglQJxIZYCIJYCRQ0BIAQoAiwhlwIglwIoAgAhmAIgBCgCQCGZAiCZAiCYAjYCFCAEKAJAIZoCIAQoAiwhmwIgmwIgmgI2AgAgBCgCQCGcAkEUIZ0CIJwCIJ0CaiGeAiAEIJ4CNgIsIAQoAkAhnwIgnwIoAhghoAJBACGhAiCgAiGiAiChAiGjAiCiAiCjAkchpAJBASGlAiCkAiClAnEhpgICQCCmAkUNAEE4IacCIAQgpwJqIagCIKgCIakCIAQgqQI2AgwCQANAIAQoAgwhqgIgqgIoAgAhqwJBACGsAiCrAiGtAiCsAiGuAiCtAiCuAkchrwJBASGwAiCvAiCwAnEhsQIgsQJFDQEgBCgCDCGyAiCyAigCACGzAkEUIbQCILMCILQCaiG1AiAEILUCNgIMDAALAAsgBCgCDCG2AiC2AigCACG3AiAEKAJAIbgCILgCKAIYIbkCILkCILcCNgIUIAQoAkAhugIgugIoAhghuwIgBCgCDCG8AiC8AiC7AjYCAAsgBCgCQCG9AiC9AigCHCG+AiAEIL4CNgJADAALAAsgBCgCRCG/AiC/AigCHCHAAiAEIMACNgJEDAALAAsgBCgCOCHBAiAEIMECNgI8DAALAAtB0AAhwgIgBCDCAmohwwIgwwIkAA8LqgEBF38jACEBQRAhAiABIAJrIQMgAyQAIAMgADYCDCADKAIMIQRBACEFIAQhBiAFIQcgBiAHRyEIQQEhCSAIIAlxIQoCQCAKRQ0AIAMoAgwhCyALKAIMIQxBACENIAwhDiANIQ8gDiAPRyEQQQEhESAQIBFxIRIgEkUNACADKAIMIRMgExAnIRQgFBCCAQsgAygCDCEVIBUQggFBECEWIAMgFmohFyAXJAAPC5kEAT9/IwAhAkEgIQMgAiADayEEIAQkACAEIAA2AhggBCABNgIUIAQoAhghBQJAAkAgBQ0AQQAhBiAGIQcMAQsgBCgCGCEIQQEhCSAIIAlrIQpBwAAhCyAKIAttIQxBASENIAwgDWohDiAOIQcLIAchDyAEIA82AgwgBCgCDCEQIAQoAhQhESAQIBEQKCESIAQgEjYCCCAEKAIIIRNBACEUIBMhFSAUIRYgFSAWSCEXQQEhGCAXIBhxIRkCQAJAIBlFDQAQTiEaQTAhGyAaIBs2AgBBACEcIAQgHDYCHAwBCyAEKAIIIR0CQCAdDQBBCCEeIAQgHjYCCAtBECEfIB8QgQEhICAEICA2AhAgBCgCECEhQQAhIiAhISMgIiEkICMgJEchJUEBISYgJSAmcSEnAkAgJw0AQQAhKCAEICg2AhwMAQsgBCgCGCEpIAQoAhAhKiAqICk2AgAgBCgCFCErIAQoAhAhLCAsICs2AgQgBCgCDCEtIAQoAhAhLiAuIC02AgggBCgCCCEvQQEhMCAwIC8QgwEhMSAEKAIQITIgMiAxNgIMIAQoAhAhMyAzKAIMITRBACE1IDQhNiA1ITcgNiA3RyE4QQEhOSA4IDlxIToCQCA6DQAgBCgCECE7IDsQggFBACE8IAQgPDYCHAwBCyAEKAIQIT0gBCA9NgIcCyAEKAIcIT5BICE/IAQgP2ohQCBAJAAgPg8LvAIBLH8jACECQRAhAyACIANrIQQgBCAANgIMIAQgATYCCCAEKAIMIQVB9cbPJSEGIAUgBmwhByAEKAIIIQggByAIcyEJQZPfoy0hCiAJIApsIQsgBCALNgIEIAQoAgQhDEH/ASENIAwgDXEhDiAOLQDgDCEPQf8BIRAgDyAQcSERIAQoAgQhEkEIIRMgEiATdiEUQf8BIRUgFCAVcSEWIBYtAOAMIRdB/wEhGCAXIBhxIRkgESAZcyEaIAQoAgQhG0EQIRwgGyAcdiEdQf8BIR4gHSAecSEfIB8tAOAMISBB/wEhISAgICFxISIgGiAicyEjIAQoAgQhJEEYISUgJCAldiEmQf8BIScgJiAncSEoICgtAOAMISlB/wEhKiApICpxISsgIyArcyEsIAQgLDYCBCAEKAIEIS0gLQ8LxhkC9gJ/IH4jACEDQSAhBCADIARrIQUgBSAANgIYIAUgATYCFCAFIAI2AhBBAiEGIAUgBjYCDAJAAkADQCAFKAIMIQdBBSEIIAchCSAIIQogCSAKSCELQQEhDCALIAxxIQ0gDUUNAUEAIQ4gBSAONgIEIAUoAgwhD0EAIRAgECAPayERQQEhEiARIBJqIRMgBSATNgIIAkADQCAFKAIIIRQgBSgCDCEVQQEhFiAVIBZrIRcgFCEYIBchGSAYIBlMIRpBASEbIBogG3EhHCAcRQ0BIAUoAhQhHSAFKAIIIR4gHSAeaiEfQQAhICAfISEgICEiICEgIk4hI0EBISQgIyAkcSElAkACQCAlRQ0AIAUoAhQhJiAFKAIIIScgJiAnaiEoIAUoAhghKSApKAIAISogKCErICohLCArICxIIS1BASEuIC0gLnEhLyAvRQ0AIAUoAhAhMCAFKAIMITEgMCAxaiEyQQEhMyAyIDNrITRBACE1IDQhNiA1ITcgNiA3TiE4QQEhOSA4IDlxITogOkUNACAFKAIQITsgBSgCDCE8IDsgPGohPUEBIT4gPSA+ayE/IAUoAhghQCBAKAIEIUEgPyFCIEEhQyBCIENIIURBASFFIEQgRXEhRiBGRQ0AIAUoAhghRyBHKAIMIUggBSgCECFJIAUoAgwhSiBJIEpqIUtBASFMIEsgTGshTSAFKAIYIU4gTigCCCFPIE0gT2whUEEDIVEgUCBRdCFSIEggUmohUyAFKAIUIVQgBSgCCCFVIFQgVWohVkHAACFXIFYgV20hWEEDIVkgWCBZdCFaIFMgWmohWyBbKQMAIfkCIAUoAhQhXCAFKAIIIV0gXCBdaiFeQT8hXyBeIF9xIWAgYCFhIGGtIfoCQoCAgICAgICAgH8h+wIg+wIg+gKIIfwCIPkCIPwCgyH9AkIAIf4CIP0CIf8CIP4CIYADIP8CIIADUiFiQQEhYyBiIGNxIWQgZCFlDAELQQAhZiBmIWULIGUhZ0EBIWhBfyFpIGggaSBnGyFqIAUoAgQhayBrIGpqIWwgBSBsNgIEIAUoAhQhbSAFKAIMIW4gbSBuaiFvQQEhcCBvIHBrIXFBACFyIHEhcyByIXQgcyB0TiF1QQEhdiB1IHZxIXcCQAJAIHdFDQAgBSgCFCF4IAUoAgwheSB4IHlqIXpBASF7IHoge2shfCAFKAIYIX0gfSgCACF+IHwhfyB+IYABIH8ggAFIIYEBQQEhggEggQEgggFxIYMBIIMBRQ0AIAUoAhAhhAEgBSgCCCGFASCEASCFAWohhgFBASGHASCGASCHAWshiAFBACGJASCIASGKASCJASGLASCKASCLAU4hjAFBASGNASCMASCNAXEhjgEgjgFFDQAgBSgCECGPASAFKAIIIZABII8BIJABaiGRAUEBIZIBIJEBIJIBayGTASAFKAIYIZQBIJQBKAIEIZUBIJMBIZYBIJUBIZcBIJYBIJcBSCGYAUEBIZkBIJgBIJkBcSGaASCaAUUNACAFKAIYIZsBIJsBKAIMIZwBIAUoAhAhnQEgBSgCCCGeASCdASCeAWohnwFBASGgASCfASCgAWshoQEgBSgCGCGiASCiASgCCCGjASChASCjAWwhpAFBAyGlASCkASClAXQhpgEgnAEgpgFqIacBIAUoAhQhqAEgBSgCDCGpASCoASCpAWohqgFBASGrASCqASCrAWshrAFBwAAhrQEgrAEgrQFtIa4BQQMhrwEgrgEgrwF0IbABIKcBILABaiGxASCxASkDACGBAyAFKAIUIbIBIAUoAgwhswEgsgEgswFqIbQBQQEhtQEgtAEgtQFrIbYBQT8htwEgtgEgtwFxIbgBILgBIbkBILkBrSGCA0KAgICAgICAgIB/IYMDIIMDIIIDiCGEAyCBAyCEA4MhhQNCACGGAyCFAyGHAyCGAyGIAyCHAyCIA1IhugFBASG7ASC6ASC7AXEhvAEgvAEhvQEMAQtBACG+ASC+ASG9AQsgvQEhvwFBASHAAUF/IcEBIMABIMEBIL8BGyHCASAFKAIEIcMBIMMBIMIBaiHEASAFIMQBNgIEIAUoAhQhxQEgBSgCCCHGASDFASDGAWohxwFBASHIASDHASDIAWshyQFBACHKASDJASHLASDKASHMASDLASDMAU4hzQFBASHOASDNASDOAXEhzwECQAJAIM8BRQ0AIAUoAhQh0AEgBSgCCCHRASDQASDRAWoh0gFBASHTASDSASDTAWsh1AEgBSgCGCHVASDVASgCACHWASDUASHXASDWASHYASDXASDYAUgh2QFBASHaASDZASDaAXEh2wEg2wFFDQAgBSgC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IZIBII8BIJIBaiGTASCTASgCACGUASCOASGVASCUASGWASCVASCWAUwhlwFBASGYASCXASCYAXEhmQEgmQFFDQEgAygCRCGaASADKAIkIZsBIAMoAkAhnAFBAiGdASCcASCdAXQhngEgmwEgngFqIZ8BIJ8BIJoBNgIAIAMoAkAhoAFBASGhASCgASChAWohogEgAyCiATYCQAwACwALIAMoAkQhowFBASGkASCjASCkAWohpQEgAyClATYCRAwACwALQQAhpgEgAyCmATYCREEAIacBIAMgpwE2AkACQANAIAMoAkQhqAEgAygCNCGpASCoASGqASCpASGrASCqASCrAUghrAFBASGtASCsASCtAXEhrgEgrgFFDQEgAygCRCGvASADKAIgIbABIAMoAkAhsQFBAiGyASCxASCyAXQhswEgsAEgswFqIbQBILQBIK8BNgIAIAMoAightQEgAygCRCG2AUECIbcBILYBILcBdCG4ASC1ASC4AWohuQEguQEoAgAhugEgAyC6ATYCRCADKAJAIbsBQQEhvAEguwEgvAFqIb0BIAMgvQE2AkAMAAsACyADKAI0Ib4BIAMoAiAhvwEgAygCQCHAAUECIcEBIMABIMEBdCHCASC/ASDCAWohwwEgwwEgvgE2AgAgAygCQCHEASADIMQBNgI8IAMoAjQhxQEgAyDFATYCRCADKAI8IcYBIAMgxgE2AkACQANAIAMoAkAhxwFBACHIASDHASHJASDIASHKASDJASDKAUohywFBASHMASDLASDMAXEhzQEgzQFFDQEgAygCRCHOASADKAIcIc8BIAMoAkAh0AFBAiHRASDQASDRAXQh0gEgzwEg0gFqIdMBINMBIM4BNgIAIAMoAiQh1AEgAygCRCHVAUECIdYBINUBINYBdCHXASDUASDXAWoh2AEg2AEoAgAh2QEgAyDZATYCRCADKAJAIdoBQX8h2wEg2gEg2wFqIdwBIAMg3AE2AkAMAAsACyADKAIcId0BQQAh3gEg3QEg3gE2AgAgAygCMCHfAUEAIeABIOABtyHqAiDfASDqAjkDAEEBIeEBIAMg4QE2AkACQANAIAMoAkAh4gEgAygCPCHjASDiASHkASDjASHlASDkASDlAUwh5gFBASHnASDmASDnAXEh6AEg6AFFDQEgAygCHCHpASADKAJAIeoBQQIh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CqIh+gogCSgCnAsh0ggg0ggrAwAh+wog+wog+gqgIfwKINIIIPwKOQMACyAJKAL8CiHTCCAJINMINgKACwwACwALQQAh1AggCSDUCDYCrAsLIAkoAqwLIdUIQbALIdYIIAkg1ghqIdcIINcIJAAg1QgPC7wCAhB8Hn8gAisDACEDIAErAwAhBCADIAShIQVBACETIBO3IQYgBSAGZCEUQQEhFSAUIBVxIRYCQAJAIBZFDQBBASEXIBchGAwBCyACKwMAIQcgASsDACEIIAcgCKEhCUEAIRkgGbchCiAJIApjIRpBfyEbQQAhHEEBIR0gGiAdcSEeIBsgHCAeGyEfIB8hGAsgGCEgIAAgIDYCBCACKwMIIQsgASsDCCEMIAsgDKEhDUEAISEgIbchDiANIA5kISJBASEjICIgI3EhJAJAAkAgJEUNAEEBISUgJSEmDAELIAIrAwghDyABKwMIIRAgDyAQoSERQQAhJyAntyESIBEgEmMhKEF/ISlBACEqQQEhKyAoICtxISwgKSAqICwbIS0gLSEmCyAmIS5BACEvIC8gLmshMCAAIDA2AgAPC3UBEHwgACsDACECIAErAwAhAyACIAOhIQQgACsDACEFIAErAwAhBiAFIAahIQcgBCAHoiEIIAArAwghCSABKwMIIQogCSAKoSELIAArAwghDCABKwMIIQ0gDCANoSEOIAsgDqIhDyAIIA+gIRAgEJ8hESARDwu5AQIDfxN8IwAhBEEgIQUgBCAFayEGIAErAwAhByAAKwMAIQggByAIoSEJIAYgCTkDGCABKwMIIQogACsDCCELIAogC6EhDCAGIAw5AxAgAysDACENIAIrAwAhDiANIA6hIQ8gBiAPOQMIIAMrAwghECACKwMIIREgECARoSESIAYgEjkDACAGKwMYIRMgBisDACEUIBMgFKIhFSAGKwMIIRYgBisDECEXIBYgF6IhGCAVIBihIRkgGQ8LuQECA38TfCMAIQRBICEFIAQgBWshBiABKwMAIQcgACsDACEIIAcgCKEhCSAGIAk5AxggASsDCCEKIAArAwghCyAKIAuhIQwgBiAMOQMQIAMrAwAhDSACKwMAIQ4gDSAOoSEPIAYgDzkDCCADKwMIIRAgAisDCCERIBAgEaEhEiAGIBI5AwAgBisDGCETIAYrAwghFCATIBSiIRUgBisDECEWIAYrAwAhFyAWIBeiIRggFSAYoCEZIBkPC+YNA2Z/GH4+fCMAIQZBoAIhByAGIAdrIQggCCQAQQghCSAAIAlqIQogCikDACFsQTghCyAIIAtqIQwgDCAJaiENIA0gbDcDACAAKQMAIW0gCCBtNwM4IAEgCWohDiAOKQMAIW5BKCEPIAggD2ohECAQIAlqIREgESBuNwMAIAEpAwAhbyAIIG83AyggBCAJaiESIBIpAwAhcEEYIRMgCCATaiEUIBQgCWohFSAVIHA3AwAgBCkDACFxIAggcTcDGCAFIAlqIRYgFikDACFyQQghFyAIIBdqIRggGCAJaiEZIBkgcjcDACAFKQMAIXMgCCBzNwMIQTghGiAIIBpqIRtBKCEcIAggHGohHUEYIR4gCCAeaiEfQQghICAIICBqISEgGyAdIB8gIRBHIYQBIAgghAE5A5ACQQghIiABICJqISMgIykDACF0QfgAISQgCCAkaiElICUgImohJiAmIHQ3AwAgASkDACF1IAggdTcDeCACICJqIScgJykDACF2QegAISggCCAoaiEpICkgImohKiAqIHY3AwAgAikDACF3IAggdzcDaCAEICJqISsgKykDACF4QdgAISwgCCAsaiEtIC0gImohLiAuIHg3AwAgBCkDACF5IAggeTcDWCAFICJqIS8gLykDACF6QcgAITAgCCAwaiExIDEgImohMiAyIHo3AwAgBSkDACF7IAggezcDSEH4ACEzIAggM2ohNEHoACE1IAggNWohNkHYACE3IAggN2ohOEHIACE5IAggOWohOiA0IDYgOCA6EEchhQEgCCCFATkDiAJBCCE7IAIgO2ohPCA8KQMAIXxBuAEhPSAIID1qIT4gPiA7aiE/ID8gfDcDACACKQMAIX0gCCB9NwO4ASADIDtqIUAgQCkDACF+QagBIUEgCCBBaiFCIEIgO2ohQyBDIH43AwAgAykDACF/IAggfzcDqAEgBCA7aiFEIEQpAwAhgAFBmAEhRSAIIEVqIUYgRiA7aiFHIEcggAE3AwAgBCkDACGBASAIIIEBNwOYASAFIDtqIUggSCkDACGCAUGIASFJIAggSWohSiBKIDtqIUsgSyCCATcDACAFKQMAIYMBIAgggwE3A4gBQbgBIUwgCCBMaiFNQagBIU4gCCBOaiFPQZgBIVAgCCBQaiFRQYgBIVIgCCBSaiFTIE0gTyBRIFMQRyGGASAIIIYBOQOAAiAIKwOQAiGHASAIKwOIAiGIAUQAAAAAAAAAQCGJASCJASCIAaIhigEghwEgigGhIYsBIAgrA4ACIYwBIIsBIIwBoCGNASAIII0BOQP4ASAIKwOQAiGOAUQAAAAAAAAAwCGPASCPASCOAaIhkAEgCCsDiAIhkQFEAAAAAAAAAEAhkgEgkgEgkQGiIZMBIJABIJMBoCGUASAIIJQBOQPwASAIKwOQAiGVASAIIJUBOQPoASAIKwPwASGWASAIKwPwASGXASCWASCXAaIhmAEgCCsD+AEhmQFEAAAAAAAAEEAhmgEgmgEgmQGiIZsBIAgrA+gBIZwBIJsBIJwBoiGdASCYASCdAaEhngEgCCCeATkD4AEgCCsD+AEhnwFBACFUIFS3IaABIJ8BIKABYSFVQQEhViBVIFZxIVcCQAJAAkAgVw0AIAgrA+ABIaEBQQAhWCBYtyGiASChASCiAWMhWUEBIVogWSBacSFbIFtFDQELRAAAAAAAAPC/IaMBIAggowE5A5gCDAELIAgrA+ABIaQBIKQBnyGlASAIIKUBOQPYASAIKwPwASGmASCmAZohpwEgCCsD2AEhqAEgpwEgqAGgIakBIAgrA/gBIaoBRAAAAAAAAABAIasBIKsBIKoBoiGsASCpASCsAaMhrQEgCCCtATkD0AEgCCsD8AEhrgEgrgGaIa8BIAgrA9gBIbABIK8BILABoSGxASAIKwP4ASGyAUQAAAAAAAAAQCGzASCzASCyAaIhtAEgsQEgtAGjIbUBIAggtQE5A8gBIAgrA9ABIbYBQQAhXCBctyG3ASC2ASC3AWYhXUEBIV4gXSBecSFfAkAgX0UNACAIKwPQASG4AUQAAAAAAADwPyG5ASC4ASC5AWUhYEEBIWEgYCBhcSFiIGJFDQAgCCsD0AEhugEgCCC6ATkDmAIMAQsgCCsDyAEhuwFBACFjIGO3IbwBILsBILwBZiFkQQEhZSBkIGVxIWYCQCBmRQ0AIAgrA8gBIb0BRAAAAAAAAPA/Ib4BIL0BIL4BZSFnQQEhaCBnIGhxIWkgaUUNACAIKwPIASG/ASAIIL8BOQOYAgwBC0QAAAAAAADwvyHAASAIIMABOQOYAgsgCCsDmAIhwQFBoAIhaiAIIGpqIWsgayQAIMEBDwvFBAIDf0l8IwAhBkEQIQcgBiAHayEIIAggATkDCCAIKwMIIQlEAAAAAAAA8D8hCiAKIAmhIQsgCCALOQMAIAgrAwAhDCAIKwMAIQ0gDCANoiEOIAgrAwAhDyAOIA+iIRAgAisDACERIBAgEaIhEiAIKwMAIRMgCCsDACEUIBMgFKIhFSAIKwMIIRYgFSAWoiEXRAAAAAAAAAhAIRggGCAXoiEZIAMrAwAhGiAZIBqiIRsgEiAboCEcIAgrAwghHSAIKwMIIR4gHSAeoiEfIAgrAwAhICAfICCiISFEAAAAAAAACEAhIiAiICGiISMgBCsDACEkICMgJKIhJSAcICWgISYgCCsDCCEnIAgrAwghKCAnICiiISkgCCsDCCEqICkgKqIhKyAFKwMAISwgKyAsoiEtICYgLaAhLiAAIC45AwAgCCsDACEvIAgrAwAhMCAvIDCiITEgCCsDACEyIDEgMqIhMyACKwMIITQgMyA0oiE1IAgrAwAhNiAIKwMAITcgNiA3oiE4IAgrAwghOSA4IDmiITpEAAAAAAAACEAhOyA7IDqiITwgAysDCCE9IDwgPaIhPiA1ID6gIT8gCCsDCCFAIAgrAwghQSBAIEGiIUIgCCsDACFDIEIgQ6IhREQAAAAAAAAIQCFFIEUgRKIhRiAEKwMIIUcgRiBHoiFIID8gSKAhSSAIKwMIIUogCCsDCCFLIEogS6IhTCAIKwMIIU0gTCBNoiFOIAUrAwghTyBOIE+iIVAgSSBQoCFRIAAgUTkDCA8LuQECA38TfCMAIQNBICEEIAMgBGshBSABKwMAIQYgACsDACEHIAYgB6EhCCAFIAg5AxggASsDCCEJIAArAwghCiAJIAqhIQsgBSALOQMQIAIrAwAhDCAAKwMAIQ0gDCANoSEOIAUgDjkDCCACKwMIIQ8gACsDCCEQIA8gEKEhESAFIBE5AwAgBSsDGCESIAUrAwghEyASIBOiIRQgBSsDECEVIAUrAwAhFiAVIBaiIRcgFCAXoCEYIBgPC5UCAhF/CnwjACEDQSAhBCADIARrIQUgBSAANgIcIAUgATkDECAFIAI5AwggBSsDECEUIAUoAhwhBiAGIBQ5AwAgBSsDCCEVIAUoAhwhByAHIBU5AwggBSgCHCEIQQAhCSAJtyEWIAggFjkDECAFKAIcIQpBACELIAu3IRcgCiAXOQMYIAUoAhwhDEQAAAAAAADwPyEYIAwgGDkDICAFKAIcIQ1BACEOIA63IRkgDSAZOQMoIAUoAhwhD0EAIRAgELchGiAPIBo5AzAgBSgCHCERRAAAAAAAAPA/IRsgESAbOQM4IAUoAhwhEkQAAAAAAADwPyEcIBIgHDkDQCAFKAIcIRNEAAAAAAAA8D8hHSATIB05A0gPC4EFAht/LnwjACEDQTAhBCADIARrIQUgBSAANgIsIAUgATkDICAFIAI5AxggBSsDICEeIAUoAiwhBiAGKwMAIR8gHiAfoyEgIAUgIDkDECAFKwMYISEgBSgCLCEHIAcrAwghIiAhICKjISMgBSAjOQMIIAUrAyAhJCAFKAIsIQggCCAkOQMAIAUrAxghJSAFKAIsIQkgCSAlOQMIIAUrAxAhJiAFKAIsIQogCisDECEnICcgJqIhKCAKICg5AxAgBSsDCCEpIAUoAiwhCyALKwMYISogKiApoiErIAsgKzkDGCAFKwMQISwgBSgCLCEMIAwrAyAhLSAtICyiIS4gDCAuOQMgIAUrAwghLyAFKAIsIQ0gDSsDKCEwIDAgL6IhMSANIDE5AyggBSsDECEyIAUoAiwhDiAOKwMwITMgMyAyoiE0IA4gNDkDMCAFKwMIITUgBSgCLCEPIA8rAzghNiA2IDWiITcgDyA3OQM4IAUrAxAhOCAFKAIsIRAgECsDQCE5IDkgOKIhOiAQIDo5A0AgBSsDCCE7IAUoAiwhESARKwNIITwgPCA7oiE9IBEgPTkDSCAFKwMgIT5BACESIBK3IT8gPiA/YyETQQEhFCATIBRxIRUCQCAVRQ0AIAUrAyAhQCAFKAIsIRYgFisDECFBIEEgQKEhQiAWIEI5AxAgBSsDICFDIEOaIUQgBSgCLCEXIBcgRDkDAAsgBSsDGCFFQQAhGCAYtyFGIEUgRmMhGUEBIRogGSAacSEbAkAgG0UNACAFKwMYIUcgBSgCLCEcIBwrAxghSCBIIEehIUkgHCBJOQMYIAUrAxghSiBKmiFLIAUoAiwhHSAdIEs5AwgLDwsGAEHQxQALeAEDf0EAIQICQAJAAkADQCACQeAOai0AACAARg0BQdcAIQMgAkEBaiICQdcARw0ADAILAAsgAiEDIAINAEHADyEEDAELQcAPIQIDQCACLQAAIQAgAkEBaiIEIQIgAA0AIAQhAiADQX9qIgMNAAsLIAQgASgCFBBSCwwAIAAQfSgCrAEQTwsEACAACwgAIAAgARBRC9YBAQJ/QQAhAgJAQagJEIEBIgNFDQACQEEBEIEBIgINACADEIIBQQAPCyADQQBBqAEQigEaIAMgATYClAEgAyAANgKQASADIANBkAFqNgJUIAFBADYCACADQgA3AqABIANBADYCmAEgACACNgIAIAMgAjYCnAEgAkEAOgAAIANBfzYCPCADQQQ2AgAgA0H/AToASyADQYAINgIwIAMgA0GoAWo2AiwgA0EENgIoIANBBTYCJCADQQY2AgwCQEHcxQAoAgQNACADQX82AkwLIAMQcCECCyACC4wBAQF/IwBBEGsiAyQAAkACQCACQQNPDQAgACgCVCEAIANBADYCBCADIAAoAgg2AgggAyAAKAIQNgIMQQAgA0EEaiACQQJ0aigCACICa6wgAVUNAEH/////ByACa60gAVMNACAAIAIgAadqIgI2AgggAq0hAQwBCxBOQRw2AgBCfyEBCyADQRBqJAAgAQvwAQEEfyAAKAJUIQMCQAJAIAAoAhQgACgCHCIEayIFRQ0AIAAgBDYCFEEAIQYgACAEIAUQVSAFSQ0BCwJAIAMoAggiACACaiIEIAMoAhQiBUkNAAJAIAMoAgwgBEEBaiAFQQF0ckEBciIAEIQBIgQNAEEADwsgAyAENgIMIAMoAgAgBDYCACADKAIMIAMoAhQiBGpBACAAIARrEIoBGiADIAA2AhQgAygCCCEACyADKAIMIABqIAEgAhCJARogAyADKAIIIAJqIgA2AggCQCAAIAMoAhBJDQAgAyAANgIQCyADKAIEIAA2AgAgAiEGCyAGCwQAQQALOwEBfyMAQRBrIgMkACAAKAI8IAEgAkH/AXEgA0EIahCYARB8IQAgAykDCCEBIANBEGokAEJ/IAEgABsLsAEBAn8CQAJAIABFDQACQCAAKAJMQX9KDQAgABBZDwsgABCNASEBIAAQWSECIAFFDQEgABCOASACDwtBACECAkBBACgCnEZFDQBBACgCnEYQWCECCwJAEF4oAgAiAEUNAANAQQAhAQJAIAAoAkxBAEgNACAAEI0BIQELAkAgACgCFCAAKAIcTQ0AIAAQWSACciECCwJAIAFFDQAgABCOAQsgACgCOCIADQALCxBfCyACC2sBAn8CQCAAKAIUIAAoAhxN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YSB0dHkAUGVybWlzc2lvbiBkZW5pZWQAT3BlcmF0aW9uIG5vdCBwZXJtaXR0ZWQATm8gc3VjaCBmaWxlIG9yIGRpcmVjdG9yeQBObyBzdWNoIHByb2Nlc3MARmlsZSBleGlzdHMAVmFsdWUgdG9vIGxhcmdlIGZvciBkYXRhIHR5cGUATm8gc3BhY2UgbGVmdCBvbiBkZXZpY2UAT3V0IG9mIG1lbW9yeQBSZXNvdXJjZSBidXN5AEludGVycnVwdGVkIHN5c3RlbSBjYWxsAFJlc291cmNlIHRlbXBvcmFyaWx5IHVuYXZhaWxhYmxlAEludmFsaWQgc2VlawBDcm9zcy1kZXZpY2UgbGluawBSZWFkLW9ubHkgZmlsZSBzeXN0ZW0ARGlyZWN0b3J5IG5vdCBlbXB0eQBDb25uZWN0aW9uIHJlc2V0IGJ5IHBlZXIAT3BlcmF0aW9uIHRpbWVkIG91dABDb25uZWN0aW9uIHJlZnVzZWQASG9zdCBpcyBkb3duAEhvc3QgaXMgdW5yZWFjaGFibGUAQWRkcmVzcyBpbiB1c2UAQnJva2VuIHBpcGUASS9PIGVycm9yAE5vIHN1Y2ggZGV2aWNlIG9yIGFkZHJlc3MAQmxvY2sgZGV2aWNlIHJlcXVpcmVkAE5vIHN1Y2ggZGV2aWNlAE5vdCBhIGRpcmVjdG9yeQBJcyBhIGRpcmVjdG9yeQBUZXh0IGZpbGUgYnVzeQBFeGVjIGZvcm1hdCBlcnJvcgBJbnZhbGlkIGFyZ3VtZW50AEFyZ3VtZW50IGxpc3QgdG9vIGxvbmcAU3ltYm9saWMgbGluayBsb29wAEZpbGVuYW1lIHRvbyBsb25nAFRvbyBtYW55IG9wZW4gZmlsZXMgaW4gc3lzdGVtAE5vIGZpbGUgZGVzY3JpcHRvcnMgYXZhaWxhYmxlAEJhZCBmaWxlIGRlc2NyaXB0b3IATm8gY2hpbGQgcHJvY2VzcwBCYWQgYWRkcmVzcwBGaWxlIHRvbyBsYXJnZQBUb28gbWFueSBsaW5rcwBObyBsb2NrcyBhdmFpbGFibGUAUmVzb3VyY2UgZGVhZGxvY2sgd291bGQgb2NjdXIAU3RhdGUgbm90IHJlY292ZXJhYmxlAFByZXZpb3VzIG93bmVyIGRpZWQAT3BlcmF0aW9uIGNhbmNlbGVkAEZ1bmN0aW9uIG5vdCBpbXBsZW1lbnRlZABObyBtZXNzYWdlIG9mIGRlc2lyZWQgdHlwZQBJZGVudGlmaWVyIHJlbW92ZWQARGV2aWNlIG5vdCBhIHN0cmVhbQBObyBkYXRhIGF2YWlsYWJsZQBEZXZpY2UgdGltZW91dABPdXQgb2Ygc3RyZWFtcyByZXNvdXJjZXMATGluayBoYXMgYmVlbiBzZXZlcmVkAFByb3RvY29sIGVycm9yAEJhZCBtZXNzYWdlAEZpbGUgZGVzY3JpcHRvciBpbiBiYWQgc3RhdGUATm90IGEgc29ja2V0AERlc3RpbmF0aW9uIGFkZHJlc3MgcmVxdWlyZWQATWVzc2FnZSB0b28gbGFyZ2UAUHJvdG9jb2wgd3JvbmcgdHlwZSBmb3Igc29ja2V0AFByb3RvY29sIG5vdCBhdmFpbGFibGUAUHJvdG9jb2wgbm90IHN1cHBvcnRlZABTb2NrZXQgdHlwZSBub3Qgc3VwcG9ydGVkAE5vdCBzdXBwb3J0ZWQAUHJvdG9jb2wgZmFtaWx5IG5vdCBzdXBwb3J0ZWQAQWRkcmVzcyBmYW1pbHkgbm90IHN1cHBvcnRlZCBieSBwcm90b2NvbABBZGRyZXNzIG5vdCBhdmFpbGFibGUATmV0d29yayBpcyBkb3duAE5ldHdvcmsgdW5yZWFjaGFibGUAQ29ubmVjdGlvbiByZXNldCBieSBuZXR3b3JrAENvbm5lY3Rpb24gYWJvcnRlZABObyBidWZmZXIgc3BhY2UgYXZhaWxhYmxlAFNvY2tldCBpcyBjb25uZWN0ZWQAU29ja2V0IG5vdCBjb25uZWN0ZWQAQ2Fubm90IHNlbmQgYWZ0ZXIgc29ja2V0IHNodXRkb3duAE9wZXJhdGlvbiBhbHJlYWR5IGluIHByb2dyZXNzAE9wZXJhdGlvbiBpbiBwcm9ncmVzcwBTdGFsZSBmaWxlIGhhbmRsZQBSZW1vdGUgSS9PIGVycm9yAFF1b3RhIGV4Y2VlZGVkAE5vIG1lZGl1bSBmb3VuZABXcm9uZyBtZWRpdW0gdHlwZQBObyBlcnJvciBpbmZvcm1hdGlvbgAASBEAABEACgAREREAAAAABQAAAAAAAAkAAAAACwAAAAAAAAAAEQAPChEREQMKBwABAAkLCwAACQYLAAALAAYRAAAAERERAAAAAAAAAAAAAAAAAAAAAAsAAAAAAAAAABEACgoREREACgAAAgAJCwAAAAkACwAACwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAMAAAAAAwAAAAACQwAAAAAAAwAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAAAAAAAAAAAAAADQAAAAQNAAAAAAkOAAAAAAAOAAAOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAA8AAAAADwAAAAAJEAAAAAAAEAAAEAAAEgAAABISEgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAASAAAAEhISAAAAAAAACQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACwAAAAAAAAAAAAAACgAAAAAKAAAAAAkLAAAAAAALAAALAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAAAwAAAAADAAAAAAJDAAAAAAADAAADAAAMDEyMzQ1Njc4OUFCQ0RFRgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP//////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABBwCILgAMBAAAAAAAAAAUAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAADAAAA3CIAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAP//////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEIwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAlUAA=';
  if (!isDataURI(wasmBinaryFile)) {
    wasmBinaryFile = locateFile(wasmBinaryFile);
  }

function getBinary(file) {
  try {
    if (file == wasmBinaryFile && wasmBinary) {
      return new Uint8Array(wasmBinary);
    }
    var binary = tryParseAsDataURI(file);
    if (binary) {
      return binary;
    }
    if (readBinary) {
      return readBinary(file);
    } else {
      throw "both async and sync fetching of the wasm failed";
    }
  }
  catch (err) {
    abort(err);
  }
}

function getBinaryPromise() {
  // If we don't have the binary yet, try to to load it asynchronously.
  // Fetch has some additional restrictions over XHR, like it can't be used on a file:// url.
  // See https://github.com/github/fetch/pull/92#issuecomment-140665932
  // Cordova or Electron apps are typically loaded from a file:// url.
  // So use fetch if it is available and the url is not a file, otherwise fall back to XHR.
  if (!wasmBinary && (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER)) {
    if (typeof fetch === 'function'
      && !isFileURI(wasmBinaryFile)
    ) {
      return fetch(wasmBinaryFile, { credentials: 'same-origin' }).then(function(response) {
        if (!response['ok']) {
          throw "failed to load wasm binary file at '" + wasmBinaryFile + "'";
        }
        return response['arrayBuffer']();
      }).catch(function () {
          return getBinary(wasmBinaryFile);
      });
    }
    else {
      if (readAsync) {
        // fetch is not available or url is file => try XHR (readAsync uses XHR internally)
        return new Promise(function(resolve, reject) {
          readAsync(wasmBinaryFile, function(response) { resolve(new Uint8Array(/** @type{!ArrayBuffer} */(response))) }, reject)
        });
      }
    }
  }

  // Otherwise, getBinary should be able to get it synchronously
  return Promise.resolve().then(function() { return getBinary(wasmBinaryFile); });
}

// Create the wasm instance.
// Receives the wasm imports, returns the exports.
function createWasm() {
  // prepare imports
  var info = {
    'env': asmLibraryArg,
    'wasi_snapshot_preview1': asmLibraryArg,
  };
  // Load the wasm module and create an instance of using native support in the JS engine.
  // handle a generated wasm instance, receiving its exports and
  // performing other necessary setup
  /** @param {WebAssembly.Module=} module*/
  function receiveInstance(instance, module) {
    var exports = instance.exports;

    Module['asm'] = exports;

    wasmMemory = Module['asm']['memory'];
    assert(wasmMemory, "memory not found in wasm exports");
    // This assertion doesn't hold when emscripten is run in --post-link
    // mode.
    // TODO(sbc): Read INITIAL_MEMORY out of the wasm file in post-link mode.
    //assert(wasmMemory.buffer.byteLength === 16777216);
    updateGlobalBufferAndViews(wasmMemory.buffer);

    wasmTable = Module['asm']['__indirect_function_table'];
    assert(wasmTable, "table not found in wasm exports");

    addOnInit(Module['asm']['__wasm_call_ctors']);

    removeRunDependency('wasm-instantiate');
  }
  // we can't run yet (except in a pthread, where we have a custom sync instantiator)
  addRunDependency('wasm-instantiate');

  // Prefer streaming instantiation if available.
  // Async compilation can be confusing when an error on the page overwrites Module
  // (for example, if the order of elements is wrong, and the one defining Module is
  // later), so we save Module and check it later.
  var trueModule = Module;
  function receiveInstantiationResult(result) {
    // 'result' is a ResultObject object which has both the module and instance.
    // receiveInstance() will swap in the exports (to Module.asm) so they can be called
    assert(Module === trueModule, 'the Module object should not be replaced during async compilation - perhaps the order of HTML elements is wrong?');
    trueModule = null;
    // TODO: Due to Closure regression https://github.com/google/closure-compiler/issues/3193, the above line no longer optimizes out down to the following line.
    // When the regression is fixed, can restore the above USE_PTHREADS-enabled path.
    receiveInstance(result['instance']);
  }

  function instantiateArrayBuffer(receiver) {
    return getBinaryPromise().then(function(binary) {
      var result = WebAssembly.instantiate(binary, info);
      return result;
    }).then(receiver, function(reason) {
      err('failed to asynchronously prepare wasm: ' + reason);

      // Warn on some common problems.
      if (isFileURI(wasmBinaryFile)) {
        err('warning: Loading from a file URI (' + wasmBinaryFile + ') is not supported in most browsers. See https://emscripten.org/docs/getting_started/FAQ.html#how-do-i-run-a-local-webserver-for-testing-why-does-my-program-stall-in-downloading-or-preparing');
      }
      abort(reason);
    });
  }

  function instantiateAsync() {
    if (!wasmBinary &&
        typeof WebAssembly.instantiateStreaming === 'function' &&
        !isDataURI(wasmBinaryFile) &&
        // Don't use streaming for file:// delivered objects in a webview, fetch them synchronously.
        !isFileURI(wasmBinaryFile) &&
        typeof fetch === 'function') {
      return fetch(wasmBinaryFile, { credentials: 'same-origin' }).then(function (response) {
        var result = WebAssembly.instantiateStreaming(response, info);
        return result.then(receiveInstantiationResult, function(reason) {
            // We expect the most common failure cause to be a bad MIME type for the binary,
            // in which case falling back to ArrayBuffer instantiation should work.
            err('wasm streaming compile failed: ' + reason);
            err('falling back to ArrayBuffer instantiation');
            return instantiateArrayBuffer(receiveInstantiationResult);
          });
      });
    } else {
      return instantiateArrayBuffer(receiveInstantiationResult);
    }
  }

  // User shell pages can write their own Module.instantiateWasm = function(imports, successCallback) callback
  // to manually instantiate the Wasm module themselves. This allows pages to run the instantiation parallel
  // to any other async startup actions they are performing.
  if (Module['instantiateWasm']) {
    try {
      var exports = Module['instantiateWasm'](info, receiveInstance);
      return exports;
    } catch(e) {
      err('Module.instantiateWasm callback failed with error: ' + e);
      return false;
    }
  }

  instantiateAsync();
  return {}; // no exports yet; we'll fill them in later
}

// Globals used by JS i64 conversions (see makeSetValue)
var tempDouble;
var tempI64;

// === Body ===

var ASM_CONSTS = {
  
};






  function callRuntimeCallbacks(callbacks) {
      while (callbacks.length > 0) {
        var callback = callbacks.shift();
        if (typeof callback == 'function') {
          callback(Module); // Pass the module as the first argument.
          continue;
        }
        var func = callback.func;
        if (typeof func === 'number') {
          if (callback.arg === undefined) {
            wasmTable.get(func)();
          } else {
            wasmTable.get(func)(callback.arg);
          }
        } else {
          func(callback.arg === undefined ? null : callback.arg);
        }
      }
    }

  function demangle(func) {
      warnOnce('warning: build with  -s DEMANGLE_SUPPORT=1  to link in libcxxabi demangling');
      return func;
    }

  function demangleAll(text) {
      var regex =
        /\b_Z[\w\d_]+/g;
      return text.replace(regex,
        function(x) {
          var y = demangle(x);
          return x === y ? x : (y + ' [' + x + ']');
        });
    }

  function jsStackTrace() {
      var error = new Error();
      if (!error.stack) {
        // IE10+ special cases: It does have callstack info, but it is only populated if an Error object is thrown,
        // so try that as a special-case.
        try {
          throw new Error();
        } catch(e) {
          error = e;
        }
        if (!error.stack) {
          return '(no stack trace available)';
        }
      }
      return error.stack.toString();
    }

  var runtimeKeepaliveCounter=0;
  function keepRuntimeAlive() {
      return noExitRuntime || runtimeKeepaliveCounter > 0;
    }

  function stackTrace() {
      var js = jsStackTrace();
      if (Module['extraStackTrace']) js += '\n' + Module['extraStackTrace']();
      return demangleAll(js);
    }

  function _emscripten_memcpy_big(dest, src, num) {
      HEAPU8.copyWithin(dest, src, src + num);
    }

  function emscripten_realloc_buffer(size) {
      try {
        // round size grow request up to wasm page size (fixed 64KB per spec)
        wasmMemory.grow((size - buffer.byteLength + 65535) >>> 16); // .grow() takes a delta compared to the previous size
        updateGlobalBufferAndViews(wasmMemory.buffer);
        return 1 /*success*/;
      } catch(e) {
        console.error('emscripten_realloc_buffer: Attempted to grow heap from ' + buffer.byteLength  + ' bytes to ' + size + ' bytes, but got error: ' + e);
      }
      // implicit 0 return to save code size (caller will cast "undefined" into 0
      // anyhow)
    }
  function _emscripten_resize_heap(requestedSize) {
      var oldSize = HEAPU8.length;
      requestedSize = requestedSize >>> 0;
      // With pthreads, races can happen (another thread might increase the size in between), so return a failure, and let the caller retry.
      assert(requestedSize > oldSize);
  
      // Memory resize rules:
      // 1. Always increase heap size to at least the requested size, rounded up to next page multiple.
      // 2a. If MEMORY_GROWTH_LINEAR_STEP == -1, excessively resize the heap geometrically: increase the heap size according to 
      //                                         MEMORY_GROWTH_GEOMETRIC_STEP factor (default +20%),
      //                                         At most overreserve by MEMORY_GROWTH_GEOMETRIC_CAP bytes (default 96MB).
      // 2b. If MEMORY_GROWTH_LINEAR_STEP != -1, excessively resize the heap linearly: increase the heap size by at least MEMORY_GROWTH_LINEAR_STEP bytes.
      // 3. Max size for the heap is capped at 2048MB-WASM_PAGE_SIZE, or by MAXIMUM_MEMORY, or by ASAN limit, depending on which is smallest
      // 4. If we were unable to allocate as much memory, it may be due to over-eager decision to excessively reserve due to (3) above.
      //    Hence if an allocation fails, cut down on the amount of excess growth, in an attempt to succeed to perform a smaller allocation.
  
      // A limit is set for how much we can grow. We should not exceed that
      // (the wasm binary specifies it, so if we tried, we'd fail anyhow).
      // In CAN_ADDRESS_2GB mode, stay one Wasm page short of 4GB: while e.g. Chrome is able to allocate full 4GB Wasm memories, the size will wrap
      // back to 0 bytes in Wasm side for any code that deals with heap sizes, which would require special casing all heap size related code to treat
      // 0 specially.
      var maxHeapSize = 2147483648;
      if (requestedSize > maxHeapSize) {
        err('Cannot enlarge memory, asked to go up to ' + requestedSize + ' bytes, but the limit is ' + maxHeapSize + ' bytes!');
        return false;
      }
  
      // Loop through potential heap size increases. If we attempt a too eager reservation that fails, cut down on the
      // attempted size and reserve a smaller bump instead. (max 3 times, chosen somewhat arbitrarily)
      for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
        var overGrownHeapSize = oldSize * (1 + 0.2 / cutDown); // ensure geometric growth
        // but limit overreserving (default to capping at +96MB overgrowth at most)
        overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296 );
  
        var newSize = Math.min(maxHeapSize, alignUp(Math.max(requestedSize, overGrownHeapSize), 65536));
  
        var replacement = emscripten_realloc_buffer(newSize);
        if (replacement) {
  
          return true;
        }
      }
      err('Failed to grow the heap from ' + oldSize + ' bytes to ' + newSize + ' bytes, not enough memory!');
      return false;
    }

  function _exit(status) {
      // void _exit(int status);
      // http://pubs.opengroup.org/onlinepubs/000095399/functions/exit.html
      exit(status);
    }

  var SYSCALLS={mappings:{},buffers:[null,[],[]],printChar:function(stream, curr) {
        var buffer = SYSCALLS.buffers[stream];
        assert(buffer);
        if (curr === 0 || curr === 10) {
          (stream === 1 ? out : err)(UTF8ArrayToString(buffer, 0));
          buffer.length = 0;
        } else {
          buffer.push(curr);
        }
      },varargs:undefined,get:function() {
        assert(SYSCALLS.varargs != undefined);
        SYSCALLS.varargs += 4;
        var ret = HEAP32[(((SYSCALLS.varargs)-(4))>>2)];
        return ret;
      },getStr:function(ptr) {
        var ret = UTF8ToString(ptr);
        return ret;
      },get64:function(low, high) {
        if (low >= 0) assert(high === 0);
        else assert(high === -1);
        return low;
      }};
  function _fd_close(fd) {
      abort('it should not be possible to operate on streams when !SYSCALLS_REQUIRE_FILESYSTEM');
      return 0;
    }

  function _fd_seek(fd, offset_low, offset_high, whence, newOffset) {
  abort('it should not be possible to operate on streams when !SYSCALLS_REQUIRE_FILESYSTEM');
  }

  function flush_NO_FILESYSTEM() {
      // flush anything remaining in the buffers during shutdown
      if (typeof _fflush !== 'undefined') _fflush(0);
      var buffers = SYSCALLS.buffers;
      if (buffers[1].length) SYSCALLS.printChar(1, 10);
      if (buffers[2].length) SYSCALLS.printChar(2, 10);
    }
  function _fd_write(fd, iov, iovcnt, pnum) {
      // hack to support printf in SYSCALLS_REQUIRE_FILESYSTEM=0
      var num = 0;
      for (var i = 0; i < iovcnt; i++) {
        var ptr = HEAP32[(((iov)+(i*8))>>2)];
        var len = HEAP32[(((iov)+(i*8 + 4))>>2)];
        for (var j = 0; j < len; j++) {
          SYSCALLS.printChar(fd, HEAPU8[ptr+j]);
        }
        num += len;
      }
      HEAP32[((pnum)>>2)] = num
      return 0;
    }

  function _setTempRet0(val) {
      setTempRet0(val);
    }
var ASSERTIONS = true;



/** @type {function(string, boolean=, number=)} */
function intArrayFromString(stringy, dontAddNull, length) {
  var len = length > 0 ? length : lengthBytesUTF8(stringy)+1;
  var u8array = new Array(len);
  var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
  if (dontAddNull) u8array.length = numBytesWritten;
  return u8array;
}

function intArrayToString(array) {
  var ret = [];
  for (var i = 0; i < array.length; i++) {
    var chr = array[i];
    if (chr > 0xFF) {
      if (ASSERTIONS) {
        assert(false, 'Character code ' + chr + ' (' + String.fromCharCode(chr) + ')  at offset ' + i + ' not in 0x00-0xFF.');
      }
      chr &= 0xFF;
    }
    ret.push(String.fromCharCode(chr));
  }
  return ret.join('');
}


// Copied from https://github.com/strophe/strophejs/blob/e06d027/src/polyfills.js#L149

// This code was written by Tyler Akins and has been placed in the
// public domain.  It would be nice if you left this header intact.
// Base64 code from Tyler Akins -- http://rumkin.com

/**
 * Decodes a base64 string.
 * @param {string} input The string to decode.
 */
var decodeBase64 = typeof atob === 'function' ? atob : function (input) {
  var keyStr = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

  var output = '';
  var chr1, chr2, chr3;
  var enc1, enc2, enc3, enc4;
  var i = 0;
  // remove all characters that are not A-Z, a-z, 0-9, +, /, or =
  input = input.replace(/[^A-Za-z0-9\+\/\=]/g, '');
  do {
    enc1 = keyStr.indexOf(input.charAt(i++));
    enc2 = keyStr.indexOf(input.charAt(i++));
    enc3 = keyStr.indexOf(input.charAt(i++));
    enc4 = keyStr.indexOf(input.charAt(i++));

    chr1 = (enc1 << 2) | (enc2 >> 4);
    chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    chr3 = ((enc3 & 3) << 6) | enc4;

    output = output + String.fromCharCode(chr1);

    if (enc3 !== 64) {
      output = output + String.fromCharCode(chr2);
    }
    if (enc4 !== 64) {
      output = output + String.fromCharCode(chr3);
    }
  } while (i < input.length);
  return output;
};

// Converts a string of base64 into a byte array.
// Throws error on invalid input.
function intArrayFromBase64(s) {
  if (typeof ENVIRONMENT_IS_NODE === 'boolean' && ENVIRONMENT_IS_NODE) {
    var buf;
    try {
      // TODO: Update Node.js externs, Closure does not recognize the following Buffer.from()
      /**@suppress{checkTypes}*/
      buf = Buffer.from(s, 'base64');
    } catch (_) {
      buf = new Buffer(s, 'base64');
    }
    return new Uint8Array(buf['buffer'], buf['byteOffset'], buf['byteLength']);
  }

  try {
    var decoded = decodeBase64(s);
    var bytes = new Uint8Array(decoded.length);
    for (var i = 0 ; i < decoded.length ; ++i) {
      bytes[i] = decoded.charCodeAt(i);
    }
    return bytes;
  } catch (_) {
    throw new Error('Converting base64 string to bytes failed.');
  }
}

// If filename is a base64 data URI, parses and returns data (Buffer on node,
// Uint8Array otherwise). If filename is not a base64 data URI, returns undefined.
function tryParseAsDataURI(filename) {
  if (!isDataURI(filename)) {
    return;
  }

  return intArrayFromBase64(filename.slice(dataURIPrefix.length));
}


var asmLibraryArg = {
  "emscripten_memcpy_big": _emscripten_memcpy_big,
  "emscripten_resize_heap": _emscripten_resize_heap,
  "exit": _exit,
  "fd_close": _fd_close,
  "fd_seek": _fd_seek,
  "fd_write": _fd_write,
  "setTempRet0": _setTempRet0
};
var asm = createWasm();
/** @type {function(...*):?} */
var ___wasm_call_ctors = Module["___wasm_call_ctors"] = createExportWrapper("__wasm_call_ctors");

/** @type {function(...*):?} */
var _fflush = Module["_fflush"] = createExportWrapper("fflush");

/** @type {function(...*):?} */
var ___errno_location = Module["___errno_location"] = createExportWrapper("__errno_location");

/** @type {function(...*):?} */
var _start = Module["_start"] = createExportWrapper("start");

/** @type {function(...*):?} */
var stackSave = Module["stackSave"] = createExportWrapper("stackSave");

/** @type {function(...*):?} */
var stackRestore = Module["stackRestore"] = createExportWrapper("stackRestore");

/** @type {function(...*):?} */
var stackAlloc = Module["stackAlloc"] = createExportWrapper("stackAlloc");

/** @type {function(...*):?} */
var _emscripten_stack_init = Module["_emscripten_stack_init"] = function() {
  return (_emscripten_stack_init = Module["_emscripten_stack_init"] = Module["asm"]["emscripten_stack_init"]).apply(null, arguments);
};

/** @type {function(...*):?} */
var _emscripten_stack_get_free = Module["_emscripten_stack_get_free"] = function() {
  return (_emscripten_stack_get_free = Module["_emscripten_stack_get_free"] = Module["asm"]["emscripten_stack_get_free"]).apply(null, arguments);
};

/** @type {function(...*):?} */
var _emscripten_stack_get_end = Module["_emscripten_stack_get_end"] = function() {
  return (_emscripten_stack_get_end = Module["_emscripten_stack_get_end"] = Module["asm"]["emscripten_stack_get_end"]).apply(null, arguments);
};

/** @type {function(...*):?} */
var dynCall_jiji = Module["dynCall_jiji"] = createExportWrapper("dynCall_jiji");





// === Auto-generated postamble setup entry stuff ===

if (!Object.getOwnPropertyDescriptor(Module, "intArrayFromString")) Module["intArrayFromString"] = function() { abort("'intArrayFromString' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "intArrayToString")) Module["intArrayToString"] = function() { abort("'intArrayToString' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "ccall")) Module["ccall"] = function() { abort("'ccall' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "cwrap")) Module["cwrap"] = function() { abort("'cwrap' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "setValue")) Module["setValue"] = function() { abort("'setValue' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "getValue")) Module["getValue"] = function() { abort("'getValue' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "allocate")) Module["allocate"] = function() { abort("'allocate' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "UTF8ArrayToString")) Module["UTF8ArrayToString"] = function() { abort("'UTF8ArrayToString' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "UTF8ToString")) Module["UTF8ToString"] = function() { abort("'UTF8ToString' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "stringToUTF8Array")) Module["stringToUTF8Array"] = function() { abort("'stringToUTF8Array' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "stringToUTF8")) Module["stringToUTF8"] = function() { abort("'stringToUTF8' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "lengthBytesUTF8")) Module["lengthBytesUTF8"] = function() { abort("'lengthBytesUTF8' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "stackTrace")) Module["stackTrace"] = function() { abort("'stackTrace' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "addOnPreRun")) Module["addOnPreRun"] = function() { abort("'addOnPreRun' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "addOnInit")) Module["addOnInit"] = function() { abort("'addOnInit' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "addOnPreMain")) Module["addOnPreMain"] = function() { abort("'addOnPreMain' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "addOnExit")) Module["addOnExit"] = function() { abort("'addOnExit' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "addOnPostRun")) Module["addOnPostRun"] = function() { abort("'addOnPostRun' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "writeStringToMemory")) Module["writeStringToMemory"] = function() { abort("'writeStringToMemory' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "writeArrayToMemory")) Module["writeArrayToMemory"] = function() { abort("'writeArrayToMemory' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "writeAsciiToMemory")) Module["writeAsciiToMemory"] = function() { abort("'writeAsciiToMemory' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "addRunDependency")) Module["addRunDependency"] = function() { abort("'addRunDependency' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Object.getOwnPropertyDescriptor(Module, "removeRunDependency")) Module["removeRunDependency"] = function() { abort("'removeRunDependency' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Object.getOwnPropertyDescriptor(Module, "FS_createFolder")) Module["FS_createFolder"] = function() { abort("'FS_createFolder' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "FS_createPath")) Module["FS_createPath"] = function() { abort("'FS_createPath' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Object.getOwnPropertyDescriptor(Module, "FS_createDataFile")) Module["FS_createDataFile"] = function() { abort("'FS_createDataFile' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Object.getOwnPropertyDescriptor(Module, "FS_createPreloadedFile")) Module["FS_createPreloadedFile"] = function() { abort("'FS_createPreloadedFile' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Object.getOwnPropertyDescriptor(Module, "FS_createLazyFile")) Module["FS_createLazyFile"] = function() { abort("'FS_createLazyFile' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Object.getOwnPropertyDescriptor(Module, "FS_createLink")) Module["FS_createLink"] = function() { abort("'FS_createLink' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "FS_createDevice")) Module["FS_createDevice"] = function() { abort("'FS_createDevice' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Object.getOwnPropertyDescriptor(Module, "FS_unlink")) Module["FS_unlink"] = function() { abort("'FS_unlink' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Object.getOwnPropertyDescriptor(Module, "getLEB")) Module["getLEB"] = function() { abort("'getLEB' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "getFunctionTables")) Module["getFunctionTables"] = function() { abort("'getFunctionTables' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "alignFunctionTables")) Module["alignFunctionTables"] = function() { abort("'alignFunctionTables' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "registerFunctions")) Module["registerFunctions"] = function() { abort("'registerFunctions' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "addFunction")) Module["addFunction"] = function() { abort("'addFunction' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "removeFunction")) Module["removeFunction"] = function() { abort("'removeFunction' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "getFuncWrapper")) Module["getFuncWrapper"] = function() { abort("'getFuncWrapper' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "prettyPrint")) Module["prettyPrint"] = function() { abort("'prettyPrint' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "dynCall")) Module["dynCall"] = function() { abort("'dynCall' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "getCompilerSetting")) Module["getCompilerSetting"] = function() { abort("'getCompilerSetting' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "print")) Module["print"] = function() { abort("'print' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "printErr")) Module["printErr"] = function() { abort("'printErr' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "getTempRet0")) Module["getTempRet0"] = function() { abort("'getTempRet0' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "setTempRet0")) Module["setTempRet0"] = function() { abort("'setTempRet0' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "callMain")) Module["callMain"] = function() { abort("'callMain' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "abort")) Module["abort"] = function() { abort("'abort' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "stringToNewUTF8")) Module["stringToNewUTF8"] = function() { abort("'stringToNewUTF8' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "setFileTime")) Module["setFileTime"] = function() { abort("'setFileTime' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "emscripten_realloc_buffer")) Module["emscripten_realloc_buffer"] = function() { abort("'emscripten_realloc_buffer' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "ENV")) Module["ENV"] = function() { abort("'ENV' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "ERRNO_CODES")) Module["ERRNO_CODES"] = function() { abort("'ERRNO_CODES' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "ERRNO_MESSAGES")) Module["ERRNO_MESSAGES"] = function() { abort("'ERRNO_MESSAGES' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "setErrNo")) Module["setErrNo"] = function() { abort("'setErrNo' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "inetPton4")) Module["inetPton4"] = function() { abort("'inetPton4' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "inetNtop4")) Module["inetNtop4"] = function() { abort("'inetNtop4' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "inetPton6")) Module["inetPton6"] = function() { abort("'inetPton6' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "inetNtop6")) Module["inetNtop6"] = function() { abort("'inetNtop6' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "readSockaddr")) Module["readSockaddr"] = function() { abort("'readSockaddr' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "writeSockaddr")) Module["writeSockaddr"] = function() { abort("'writeSockaddr' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "DNS")) Module["DNS"] = function() { abort("'DNS' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "getHostByName")) Module["getHostByName"] = function() { abort("'getHostByName' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "GAI_ERRNO_MESSAGES")) Module["GAI_ERRNO_MESSAGES"] = function() { abort("'GAI_ERRNO_MESSAGES' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "Protocols")) Module["Protocols"] = function() { abort("'Protocols' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "Sockets")) Module["Sockets"] = function() { abort("'Sockets' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "getRandomDevice")) Module["getRandomDevice"] = function() { abort("'getRandomDevice' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "traverseStack")) Module["traverseStack"] = function() { abort("'traverseStack' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "UNWIND_CACHE")) Module["UNWIND_CACHE"] = function() { abort("'UNWIND_CACHE' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "withBuiltinMalloc")) Module["withBuiltinMalloc"] = function() { abort("'withBuiltinMalloc' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "readAsmConstArgsArray")) Module["readAsmConstArgsArray"] = function() { abort("'readAsmConstArgsArray' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "readAsmConstArgs")) Module["readAsmConstArgs"] = function() { abort("'readAsmConstArgs' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "mainThreadEM_ASM")) Module["mainThreadEM_ASM"] = function() { abort("'mainThreadEM_ASM' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "jstoi_q")) Module["jstoi_q"] = function() { abort("'jstoi_q' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "jstoi_s")) Module["jstoi_s"] = function() { abort("'jstoi_s' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "getExecutableName")) Module["getExecutableName"] = function() { abort("'getExecutableName' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "listenOnce")) Module["listenOnce"] = function() { abort("'listenOnce' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "autoResumeAudioContext")) Module["autoResumeAudioContext"] = function() { abort("'autoResumeAudioContext' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "dynCallLegacy")) Module["dynCallLegacy"] = function() { abort("'dynCallLegacy' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "getDynCaller")) Module["getDynCaller"] = function() { abort("'getDynCaller' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "dynCall")) Module["dynCall"] = function() { abort("'dynCall' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "callRuntimeCallbacks")) Module["callRuntimeCallbacks"] = function() { abort("'callRuntimeCallbacks' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "runtimeKeepaliveCounter")) Module["runtimeKeepaliveCounter"] = function() { abort("'runtimeKeepaliveCounter' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "keepRuntimeAlive")) Module["keepRuntimeAlive"] = function() { abort("'keepRuntimeAlive' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "runtimeKeepalivePush")) Module["runtimeKeepalivePush"] = function() { abort("'runtimeKeepalivePush' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "runtimeKeepalivePop")) Module["runtimeKeepalivePop"] = function() { abort("'runtimeKeepalivePop' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "callUserCallback")) Module["callUserCallback"] = function() { abort("'callUserCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "maybeExit")) Module["maybeExit"] = function() { abort("'maybeExit' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "asmjsMangle")) Module["asmjsMangle"] = function() { abort("'asmjsMangle' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "reallyNegative")) Module["reallyNegative"] = function() { abort("'reallyNegative' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "unSign")) Module["unSign"] = function() { abort("'unSign' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "reSign")) Module["reSign"] = function() { abort("'reSign' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "formatString")) Module["formatString"] = function() { abort("'formatString' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "PATH")) Module["PATH"] = function() { abort("'PATH' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "PATH_FS")) Module["PATH_FS"] = function() { abort("'PATH_FS' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "SYSCALLS")) Module["SYSCALLS"] = function() { abort("'SYSCALLS' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "syscallMmap2")) Module["syscallMmap2"] = function() { abort("'syscallMmap2' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "syscallMunmap")) Module["syscallMunmap"] = function() { abort("'syscallMunmap' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "getSocketFromFD")) Module["getSocketFromFD"] = function() { abort("'getSocketFromFD' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "getSocketAddress")) Module["getSocketAddress"] = function() { abort("'getSocketAddress' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "JSEvents")) Module["JSEvents"] = function() { abort("'JSEvents' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "registerKeyEventCallback")) Module["registerKeyEventCallback"] = function() { abort("'registerKeyEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "specialHTMLTargets")) Module["specialHTMLTargets"] = function() { abort("'specialHTMLTargets' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "maybeCStringToJsString")) Module["maybeCStringToJsString"] = function() { abort("'maybeCStringToJsString' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "findEventTarget")) Module["findEventTarget"] = function() { abort("'findEventTarget' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "findCanvasEventTarget")) Module["findCanvasEventTarget"] = function() { abort("'findCanvasEventTarget' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "getBoundingClientRect")) Module["getBoundingClientRect"] = function() { abort("'getBoundingClientRect' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "fillMouseEventData")) Module["fillMouseEventData"] = function() { abort("'fillMouseEventData' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "registerMouseEventCallback")) Module["registerMouseEventCallback"] = function() { abort("'registerMouseEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "registerWheelEventCallback")) Module["registerWheelEventCallback"] = function() { abort("'registerWheelEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "registerUiEventCallback")) Module["registerUiEventCallback"] = function() { abort("'registerUiEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "registerFocusEventCallback")) Module["registerFocusEventCallback"] = function() { abort("'registerFocusEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "fillDeviceOrientationEventData")) Module["fillDeviceOrientationEventData"] = function() { abort("'fillDeviceOrientationEventData' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "registerDeviceOrientationEventCallback")) Module["registerDeviceOrientationEventCallback"] = function() { abort("'registerDeviceOrientationEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "fillDeviceMotionEventData")) Module["fillDeviceMotionEventData"] = function() { abort("'fillDeviceMotionEventData' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "registerDeviceMotionEventCallback")) Module["registerDeviceMotionEventCallback"] = function() { abort("'registerDeviceMotionEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "screenOrientation")) Module["screenOrientation"] = function() { abort("'screenOrientation' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "fillOrientationChangeEventData")) Module["fillOrientationChangeEventData"] = function() { abort("'fillOrientationChangeEventData' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "registerOrientationChangeEventCallback")) Module["registerOrientationChangeEventCallback"] = function() { abort("'registerOrientationChangeEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "fillFullscreenChangeEventData")) Module["fillFullscreenChangeEventData"] = function() { abort("'fillFullscreenChangeEventData' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "registerFullscreenChangeEventCallback")) Module["registerFullscreenChangeEventCallback"] = function() { abort("'registerFullscreenChangeEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "registerRestoreOldStyle")) Module["registerRestoreOldStyle"] = function() { abort("'registerRestoreOldStyle' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "hideEverythingExceptGivenElement")) Module["hideEverythingExceptGivenElement"] = function() { abort("'hideEverythingExceptGivenElement' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "restoreHiddenElements")) Module["restoreHiddenElements"] = function() { abort("'restoreHiddenElements' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "setLetterbox")) Module["setLetterbox"] = function() { abort("'setLetterbox' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "currentFullscreenStrategy")) Module["currentFullscreenStrategy"] = function() { abort("'currentFullscreenStrategy' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "restoreOldWindowedStyle")) Module["restoreOldWindowedStyle"] = function() { abort("'restoreOldWindowedStyle' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "softFullscreenResizeWebGLRenderTarget")) Module["softFullscreenResizeWebGLRenderTarget"] = function() { abort("'softFullscreenResizeWebGLRenderTarget' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "doRequestFullscreen")) Module["doRequestFullscreen"] = function() { abort("'doRequestFullscreen' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "fillPointerlockChangeEventData")) Module["fillPointerlockChangeEventData"] = function() { abort("'fillPointerlockChangeEventData' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "registerPointerlockChangeEventCallback")) Module["registerPointerlockChangeEventCallback"] = function() { abort("'registerPointerlockChangeEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "registerPointerlockErrorEventCallback")) Module["registerPointerlockErrorEventCallback"] = function() { abort("'registerPointerlockErrorEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "requestPointerLock")) Module["requestPointerLock"] = function() { abort("'requestPointerLock' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "fillVisibilityChangeEventData")) Module["fillVisibilityChangeEventData"] = function() { abort("'fillVisibilityChangeEventData' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "registerVisibilityChangeEventCallback")) Module["registerVisibilityChangeEventCallback"] = function() { abort("'registerVisibilityChangeEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "registerTouchEventCallback")) Module["registerTouchEventCallback"] = function() { abort("'registerTouchEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "fillGamepadEventData")) Module["fillGamepadEventData"] = function() { abort("'fillGamepadEventData' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "registerGamepadEventCallback")) Module["registerGamepadEventCallback"] = function() { abort("'registerGamepadEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "registerBeforeUnloadEventCallback")) Module["registerBeforeUnloadEventCallback"] = function() { abort("'registerBeforeUnloadEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "fillBatteryEventData")) Module["fillBatteryEventData"] = function() { abort("'fillBatteryEventData' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "battery")) Module["battery"] = function() { abort("'battery' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "registerBatteryEventCallback")) Module["registerBatteryEventCallback"] = function() { abort("'registerBatteryEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "setCanvasElementSize")) Module["setCanvasElementSize"] = function() { abort("'setCanvasElementSize' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "getCanvasElementSize")) Module["getCanvasElementSize"] = function() { abort("'getCanvasElementSize' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "polyfillSetImmediate")) Module["polyfillSetImmediate"] = function() { abort("'polyfillSetImmediate' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "demangle")) Module["demangle"] = function() { abort("'demangle' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "demangleAll")) Module["demangleAll"] = function() { abort("'demangleAll' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "jsStackTrace")) Module["jsStackTrace"] = function() { abort("'jsStackTrace' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "stackTrace")) Module["stackTrace"] = function() { abort("'stackTrace' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "getEnvStrings")) Module["getEnvStrings"] = function() { abort("'getEnvStrings' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "checkWasiClock")) Module["checkWasiClock"] = function() { abort("'checkWasiClock' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "flush_NO_FILESYSTEM")) Module["flush_NO_FILESYSTEM"] = function() { abort("'flush_NO_FILESYSTEM' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "writeI53ToI64")) Module["writeI53ToI64"] = function() { abort("'writeI53ToI64' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "writeI53ToI64Clamped")) Module["writeI53ToI64Clamped"] = function() { abort("'writeI53ToI64Clamped' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "writeI53ToI64Signaling")) Module["writeI53ToI64Signaling"] = function() { abort("'writeI53ToI64Signaling' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "writeI53ToU64Clamped")) Module["writeI53ToU64Clamped"] = function() { abort("'writeI53ToU64Clamped' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "writeI53ToU64Signaling")) Module["writeI53ToU64Signaling"] = function() { abort("'writeI53ToU64Signaling' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "readI53FromI64")) Module["readI53FromI64"] = function() { abort("'readI53FromI64' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "readI53FromU64")) Module["readI53FromU64"] = function() { abort("'readI53FromU64' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "convertI32PairToI53")) Module["convertI32PairToI53"] = function() { abort("'convertI32PairToI53' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "convertU32PairToI53")) Module["convertU32PairToI53"] = function() { abort("'convertU32PairToI53' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "uncaughtExceptionCount")) Module["uncaughtExceptionCount"] = function() { abort("'uncaughtExceptionCount' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "exceptionLast")) Module["exceptionLast"] = function() { abort("'exceptionLast' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "exceptionCaught")) Module["exceptionCaught"] = function() { abort("'exceptionCaught' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "ExceptionInfoAttrs")) Module["ExceptionInfoAttrs"] = function() { abort("'ExceptionInfoAttrs' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "ExceptionInfo")) Module["ExceptionInfo"] = function() { abort("'ExceptionInfo' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "CatchInfo")) Module["CatchInfo"] = function() { abort("'CatchInfo' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "exception_addRef")) Module["exception_addRef"] = function() { abort("'exception_addRef' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "exception_decRef")) Module["exception_decRef"] = function() { abort("'exception_decRef' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "Browser")) Module["Browser"] = function() { abort("'Browser' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "funcWrappers")) Module["funcWrappers"] = function() { abort("'funcWrappers' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "getFuncWrapper")) Module["getFuncWrapper"] = function() { abort("'getFuncWrapper' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "setMainLoop")) Module["setMainLoop"] = function() { abort("'setMainLoop' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "FS")) Module["FS"] = function() { abort("'FS' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "mmapAlloc")) Module["mmapAlloc"] = function() { abort("'mmapAlloc' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "MEMFS")) Module["MEMFS"] = function() { abort("'MEMFS' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "TTY")) Module["TTY"] = function() { abort("'TTY' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "PIPEFS")) Module["PIPEFS"] = function() { abort("'PIPEFS' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "SOCKFS")) Module["SOCKFS"] = function() { abort("'SOCKFS' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "_setNetworkCallback")) Module["_setNetworkCallback"] = function() { abort("'_setNetworkCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "tempFixedLengthArray")) Module["tempFixedLengthArray"] = function() { abort("'tempFixedLengthArray' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "miniTempWebGLFloatBuffers")) Module["miniTempWebGLFloatBuffers"] = function() { abort("'miniTempWebGLFloatBuffers' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "heapObjectForWebGLType")) Module["heapObjectForWebGLType"] = function() { abort("'heapObjectForWebGLType' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "heapAccessShiftForWebGLHeap")) Module["heapAccessShiftForWebGLHeap"] = function() { abort("'heapAccessShiftForWebGLHeap' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "GL")) Module["GL"] = function() { abort("'GL' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "emscriptenWebGLGet")) Module["emscriptenWebGLGet"] = function() { abort("'emscriptenWebGLGet' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "computeUnpackAlignedImageSize")) Module["computeUnpackAlignedImageSize"] = function() { abort("'computeUnpackAlignedImageSize' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "emscriptenWebGLGetTexPixelData")) Module["emscriptenWebGLGetTexPixelData"] = function() { abort("'emscriptenWebGLGetTexPixelData' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "emscriptenWebGLGetUniform")) Module["emscriptenWebGLGetUniform"] = function() { abort("'emscriptenWebGLGetUniform' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "webglGetUniformLocation")) Module["webglGetUniformLocation"] = function() { abort("'webglGetUniformLocation' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "webglPrepareUniformLocationsBeforeFirstUse")) Module["webglPrepareUniformLocationsBeforeFirstUse"] = function() { abort("'webglPrepareUniformLocationsBeforeFirstUse' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "webglGetLeftBracePos")) Module["webglGetLeftBracePos"] = function() { abort("'webglGetLeftBracePos' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "emscriptenWebGLGetVertexAttrib")) Module["emscriptenWebGLGetVertexAttrib"] = function() { abort("'emscriptenWebGLGetVertexAttrib' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "writeGLArray")) Module["writeGLArray"] = function() { abort("'writeGLArray' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "AL")) Module["AL"] = function() { abort("'AL' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "SDL_unicode")) Module["SDL_unicode"] = function() { abort("'SDL_unicode' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "SDL_ttfContext")) Module["SDL_ttfContext"] = function() { abort("'SDL_ttfContext' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "SDL_audio")) Module["SDL_audio"] = function() { abort("'SDL_audio' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "SDL")) Module["SDL"] = function() { abort("'SDL' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "SDL_gfx")) Module["SDL_gfx"] = function() { abort("'SDL_gfx' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "GLUT")) Module["GLUT"] = function() { abort("'GLUT' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "EGL")) Module["EGL"] = function() { abort("'EGL' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "GLFW_Window")) Module["GLFW_Window"] = function() { abort("'GLFW_Window' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "GLFW")) Module["GLFW"] = function() { abort("'GLFW' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "GLEW")) Module["GLEW"] = function() { abort("'GLEW' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "IDBStore")) Module["IDBStore"] = function() { abort("'IDBStore' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "runAndAbortIfError")) Module["runAndAbortIfError"] = function() { abort("'runAndAbortIfError' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "warnOnce")) Module["warnOnce"] = function() { abort("'warnOnce' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "stackSave")) Module["stackSave"] = function() { abort("'stackSave' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "stackRestore")) Module["stackRestore"] = function() { abort("'stackRestore' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "stackAlloc")) Module["stackAlloc"] = function() { abort("'stackAlloc' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "AsciiToString")) Module["AsciiToString"] = function() { abort("'AsciiToString' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "stringToAscii")) Module["stringToAscii"] = function() { abort("'stringToAscii' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "UTF16ToString")) Module["UTF16ToString"] = function() { abort("'UTF16ToString' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "stringToUTF16")) Module["stringToUTF16"] = function() { abort("'stringToUTF16' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "lengthBytesUTF16")) Module["lengthBytesUTF16"] = function() { abort("'lengthBytesUTF16' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "UTF32ToString")) Module["UTF32ToString"] = function() { abort("'UTF32ToString' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "stringToUTF32")) Module["stringToUTF32"] = function() { abort("'stringToUTF32' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "lengthBytesUTF32")) Module["lengthBytesUTF32"] = function() { abort("'lengthBytesUTF32' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "allocateUTF8")) Module["allocateUTF8"] = function() { abort("'allocateUTF8' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "allocateUTF8OnStack")) Module["allocateUTF8OnStack"] = function() { abort("'allocateUTF8OnStack' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
Module["writeStackCookie"] = writeStackCookie;
Module["checkStackCookie"] = checkStackCookie;
if (!Object.getOwnPropertyDescriptor(Module, "intArrayFromBase64")) Module["intArrayFromBase64"] = function() { abort("'intArrayFromBase64' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "tryParseAsDataURI")) Module["tryParseAsDataURI"] = function() { abort("'tryParseAsDataURI' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "ALLOC_NORMAL")) Object.defineProperty(Module, "ALLOC_NORMAL", { configurable: true, get: function() { abort("'ALLOC_NORMAL' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Object.getOwnPropertyDescriptor(Module, "ALLOC_STACK")) Object.defineProperty(Module, "ALLOC_STACK", { configurable: true, get: function() { abort("'ALLOC_STACK' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") } });

var calledRun;

/**
 * @constructor
 * @this {ExitStatus}
 */
function ExitStatus(status) {
  this.name = "ExitStatus";
  this.message = "Program terminated with exit(" + status + ")";
  this.status = status;
}

var calledMain = false;

dependenciesFulfilled = function runCaller() {
  // If run has never been called, and we should call run (INVOKE_RUN is true, and Module.noInitialRun is not false)
  if (!calledRun) run();
  if (!calledRun) dependenciesFulfilled = runCaller; // try this again later, after new deps are fulfilled
};

function stackCheckInit() {
  // This is normally called automatically during __wasm_call_ctors but need to
  // get these values before even running any of the ctors so we call it redundantly
  // here.
  // TODO(sbc): Move writeStackCookie to native to to avoid this.
  _emscripten_stack_init();
  writeStackCookie();
}

/** @type {function(Array=)} */
function run(args) {
  args = args || arguments_;

  if (runDependencies > 0) {
    return;
  }

  stackCheckInit();

  preRun();

  // a preRun added a dependency, run will be called later
  if (runDependencies > 0) {
    return;
  }

  function doRun() {
    // run may have just been called through dependencies being fulfilled just in this very frame,
    // or while the async setStatus time below was happening
    if (calledRun) return;
    calledRun = true;
    Module['calledRun'] = true;

    if (ABORT) return;

    initRuntime();

    if (Module['onRuntimeInitialized']) Module['onRuntimeInitialized']();

    assert(!Module['_main'], 'compiled without a main, but one is present. if you added it from JS, use Module["onRuntimeInitialized"]');

    postRun();
  }

  if (Module['setStatus']) {
    Module['setStatus']('Running...');
    setTimeout(function() {
      setTimeout(function() {
        Module['setStatus']('');
      }, 1);
      doRun();
    }, 1);
  } else
  {
    doRun();
  }
  checkStackCookie();
}
Module['run'] = run;

function checkUnflushedContent() {
  // Compiler settings do not allow exiting the runtime, so flushing
  // the streams is not possible. but in ASSERTIONS mode we check
  // if there was something to flush, and if so tell the user they
  // should request that the runtime be exitable.
  // Normally we would not even include flush() at all, but in ASSERTIONS
  // builds we do so just for this check, and here we see if there is any
  // content to flush, that is, we check if there would have been
  // something a non-ASSERTIONS build would have not seen.
  // How we flush the streams depends on whether we are in SYSCALLS_REQUIRE_FILESYSTEM=0
  // mode (which has its own special function for this; otherwise, all
  // the code is inside libc)
  var oldOut = out;
  var oldErr = err;
  var has = false;
  out = err = function(x) {
    has = true;
  }
  try { // it doesn't matter if it fails
    var flush = flush_NO_FILESYSTEM;
    if (flush) flush();
  } catch(e) {}
  out = oldOut;
  err = oldErr;
  if (has) {
    warnOnce('stdio streams had content in them that was not flushed. you should set EXIT_RUNTIME to 1 (see the FAQ), or make sure to emit a newline when you printf etc.');
    warnOnce('(this may also be due to not including full filesystem support - try building with -s FORCE_FILESYSTEM=1)');
  }
}

/** @param {boolean|number=} implicit */
function exit(status, implicit) {
  EXITSTATUS = status;

  checkUnflushedContent();

  // if this is just main exit-ing implicitly, and the status is 0, then we
  // don't need to do anything here and can just leave. if the status is
  // non-zero, though, then we need to report it.
  // (we may have warned about this earlier, if a situation justifies doing so)
  if (implicit && keepRuntimeAlive() && status === 0) {
    return;
  }

  if (keepRuntimeAlive()) {
    // if exit() was called, we may warn the user if the runtime isn't actually being shut down
    if (!implicit) {
      var msg = 'program exited (with status: ' + status + '), but EXIT_RUNTIME is not set, so halting execution but not exiting the runtime or preventing further async execution (build with EXIT_RUNTIME=1, if you want a true shutdown)';
      err(msg);
    }
  } else {

    exitRuntime();

    if (Module['onExit']) Module['onExit'](status);

    ABORT = true;
  }

  quit_(status, new ExitStatus(status));
}

if (Module['preInit']) {
  if (typeof Module['preInit'] == 'function') Module['preInit'] = [Module['preInit']];
  while (Module['preInit'].length > 0) {
    Module['preInit'].pop()();
  }
}

run();





/**
 * This file will be inserted to generated output when building the library.
 */

/**
 * @param colorFilter return true if given pixel will be traced.
 * @param transform whether add the <transform /> tag to reduce generated svg length.
 * @param pathonly only returns concated path data.
 * @param turdsize suppress speckles of up to this many pixels.
 * @param alphamax corner threshold parameter.
 */
 const defaultConfig = {
  colorFilter: (r, g, b, a) => a && 0.2126 * r + 0.7152 * g + 0.0722 * b < 128,
  transform: true,
  pathonly: false,
  turdsize: 2,
  alphamax: 1
};

/**
 * @param config for customizing.
 * @returns merged config with default value.
 */
function buildConfig(config) {
  if (!config) {
    return Object.assign({}, defaultConfig);
  }
  let merged = Object.assign({}, config);
  for (let prop in defaultConfig) {
    if (!config.hasOwnProperty(prop)) {
      merged[prop] = defaultConfig[prop];
    }
  }
  return merged;
}

/**
 * @returns promise to wait for wasm loaded.
 */
function ready() {
  return new Promise((resolve) => {
    if (runtimeInitialized) {
      resolve();
      return;
    }
    Module.onRuntimeInitialized = () => {
      resolve();
    };
  });
}

/**
 * @param canvas to be converted for svg.
 * @param config for customizing.
 * @returns promise that emits a svg string or path data array.
 */
async function loadFromCanvas(canvas, config) {
  let ctx = canvas.getContext("2d");
  let imagedata = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  return loadFromImageData(imagedata, canvas.width, canvas.height, config);
}

/**
 * @param imagedata to be converted for svg.
 * @param width for the imageData.
 * @param height for the imageData.
 * @param config for customizing.
 * @returns promise that emits a svg string or path data array.
 */
async function loadFromImageData(imagedata, width, height, config) {
  let start = wrapStart();
  let data = new Array(Math.ceil(imagedata.length / 32)).fill(0);
  let c = buildConfig(config);

  for (let i = 0; i < imagedata.length; i += 4) {
    let r = imagedata[i],
      g = imagedata[i + 1],
      b = imagedata[i + 2],
      a = imagedata[i + 3];

    if (c.colorFilter(r, g, b, a)) {
      // each number contains 8 pixels from rightmost bit.
      let index = Math.floor(i / 4);
      data[Math.floor(index / 8)] += 1 << index % 8;
    }
  }

  await ready();
  console.log(c)
  let result = start(data, width, height, c.transform, c.pathonly, c.turdsize, c.alphamax);

  if (c.pathonly) {
    return result
      .split("M")
      .filter((path) => path)
      .map((path) => "M" + path);
  }
  return result;
}

/**
 * @returns wrapped function for start.
 */
function wrapStart() {
  return cwrap("start", "string", [
    "array", // pixels
    "number", // width
    "number", // height
    "number", // transform
    "number", // pathonly
    "number", // turdsize
    "number" // alphamax
  ]);
}

// export the functions in server env.
if (typeof module !== "undefined") {
  module.exports = { loadFromCanvas, loadFromImageData };
}

