// Copyright 2010 The Emscripten Authors.  All rights reserved.
// Emscripten is available under two separate licenses, the MIT license and the
// University of Illinois/NCSA Open Source License.  Both these licenses can be
// found in the LICENSE file.

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
var ENVIRONMENT_HAS_NODE = false;
var ENVIRONMENT_IS_SHELL = false;
ENVIRONMENT_IS_WEB = typeof window === 'object';
ENVIRONMENT_IS_WORKER = typeof importScripts === 'function';
// A web environment like Electron.js can have Node enabled, so we must
// distinguish between Node-enabled environments and Node environments per se.
// This will allow the former to do things like mount NODEFS.
// Extended check using process.versions fixes issue #8816.
// (Also makes redundant the original check that 'require' is a function.)
ENVIRONMENT_HAS_NODE = typeof process === 'object' && typeof process.versions === 'object' && typeof process.versions.node === 'string';
ENVIRONMENT_IS_NODE = ENVIRONMENT_HAS_NODE && !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_WORKER;
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
  scriptDirectory = __dirname + '/';


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
    if (typeof console === 'undefined') console = {};
    console.log = print;
    console.warn = console.error = typeof printErr !== 'undefined' ? printErr : print;
  }
} else

// Note that this includes Node.js workers when relevant (pthreads is enabled).
// Node.js workers are detected as a combination of ENVIRONMENT_IS_WORKER and
// ENVIRONMENT_HAS_NODE.
if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
  if (ENVIRONMENT_IS_WORKER) { // Check worker, not web, since window could be polyfilled
    scriptDirectory = self.location.href;
  } else if (document.currentScript) { // web
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


  read_ = function shell_read(url) {
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
    readBinary = function readBinary(url) {
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, false);
        xhr.responseType = 'arraybuffer';
        xhr.send(null);
        return new Uint8Array(xhr.response);
      } catch (err) {
        var data = tryParseAsDataURI(url);
        if (data) {
          return data;
        }
        throw err;
      }
    };
  }

  readAsync = function readAsync(url, onload, onerror) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function xhr_onload() {
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
if (Module['arguments']) arguments_ = Module['arguments'];if (!Object.getOwnPropertyDescriptor(Module, 'arguments')) Object.defineProperty(Module, 'arguments', { configurable: true, get: function() { abort('Module.arguments has been replaced with plain arguments_') } });
if (Module['thisProgram']) thisProgram = Module['thisProgram'];if (!Object.getOwnPropertyDescriptor(Module, 'thisProgram')) Object.defineProperty(Module, 'thisProgram', { configurable: true, get: function() { abort('Module.thisProgram has been replaced with plain thisProgram') } });
if (Module['quit']) quit_ = Module['quit'];if (!Object.getOwnPropertyDescriptor(Module, 'quit')) Object.defineProperty(Module, 'quit', { configurable: true, get: function() { abort('Module.quit has been replaced with plain quit_') } });

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
if (!Object.getOwnPropertyDescriptor(Module, 'read')) Object.defineProperty(Module, 'read', { configurable: true, get: function() { abort('Module.read has been replaced with plain read_') } });
if (!Object.getOwnPropertyDescriptor(Module, 'readAsync')) Object.defineProperty(Module, 'readAsync', { configurable: true, get: function() { abort('Module.readAsync has been replaced with plain readAsync') } });
if (!Object.getOwnPropertyDescriptor(Module, 'readBinary')) Object.defineProperty(Module, 'readBinary', { configurable: true, get: function() { abort('Module.readBinary has been replaced with plain readBinary') } });
// TODO: add when SDL2 is fixed if (!Object.getOwnPropertyDescriptor(Module, 'setWindowTitle')) Object.defineProperty(Module, 'setWindowTitle', { configurable: true, get: function() { abort('Module.setWindowTitle has been replaced with plain setWindowTitle') } });
var IDBFS = 'IDBFS is no longer included by default; build with -lidbfs.js';
var PROXYFS = 'PROXYFS is no longer included by default; build with -lproxyfs.js';
var WORKERFS = 'WORKERFS is no longer included by default; build with -lworkerfs.js';
var NODEFS = 'NODEFS is no longer included by default; build with -lnodefs.js';


// TODO remove when SDL2 is fixed (also see above)



// Copyright 2017 The Emscripten Authors.  All rights reserved.
// Emscripten is available under two separate licenses, the MIT license and the
// University of Illinois/NCSA Open Source License.  Both these licenses can be
// found in the LICENSE file.

// {{PREAMBLE_ADDITIONS}}

var STACK_ALIGN = 16;

// stack management, and other functionality that is provided by the compiled code,
// should not be used before it is ready
stackSave = stackRestore = stackAlloc = function() {
  abort('cannot use the stack before compiled code is ready to run, and has provided stack access');
};

function staticAlloc(size) {
  abort('staticAlloc is no longer available at runtime; instead, perform static allocations at compile time (using makeStaticAlloc)');
}

function dynamicAlloc(size) {
  assert(DYNAMICTOP_PTR);
  var ret = HEAP32[DYNAMICTOP_PTR>>2];
  var end = (ret + size + 15) & -16;
  if (end > _emscripten_get_heap_size()) {
    abort('failure to dynamicAlloc - memory growth etc. is not supported there, call malloc/sbrk directly');
  }
  HEAP32[DYNAMICTOP_PTR>>2] = end;
  return ret;
}

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
        var bits = parseInt(type.substr(1));
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

var asm2wasmImports = { // special asm2wasm imports
    "f64-rem": function(x, y) {
        return x % y;
    },
    "debugger": function() {
        debugger;
    }
};




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

// Add a wasm function to the table.
function addFunctionWasm(func, sig) {
  var table = wasmTable;
  var ret = table.length;

  // Grow the table
  try {
    table.grow(1);
  } catch (err) {
    if (!err instanceof RangeError) {
      throw err;
    }
    throw 'Unable to grow wasm table. Use a higher value for RESERVED_FUNCTION_POINTERS or set ALLOW_TABLE_GROWTH.';
  }

  // Insert new element
  try {
    // Attempting to call this with JS function will cause of table.set() to fail
    table.set(ret, func);
  } catch (err) {
    if (!err instanceof TypeError) {
      throw err;
    }
    assert(typeof sig !== 'undefined', 'Missing signature argument to addFunction');
    var wrapped = convertJsFunctionToWasm(func, sig);
    table.set(ret, wrapped);
  }

  return ret;
}

function removeFunctionWasm(index) {
  // TODO(sbc): Look into implementing this to allow re-using of table slots
}

// 'sig' parameter is required for the llvm backend but only when func is not
// already a WebAssembly function.
function addFunction(func, sig) {
  assert(typeof func !== 'undefined');

  return addFunctionWasm(func, sig);
}

function removeFunction(index) {
  removeFunctionWasm(index);
}

var funcWrappers = {};

function getFuncWrapper(func, sig) {
  if (!func) return; // on null pointer, return undefined
  assert(sig);
  if (!funcWrappers[sig]) {
    funcWrappers[sig] = {};
  }
  var sigCache = funcWrappers[sig];
  if (!sigCache[func]) {
    // optimize away arguments usage in common cases
    if (sig.length === 1) {
      sigCache[func] = function dynCall_wrapper() {
        return dynCall(sig, func);
      };
    } else if (sig.length === 2) {
      sigCache[func] = function dynCall_wrapper(arg) {
        return dynCall(sig, func, [arg]);
      };
    } else {
      // general case
      sigCache[func] = function dynCall_wrapper() {
        return dynCall(sig, func, Array.prototype.slice.call(arguments));
      };
    }
  }
  return sigCache[func];
}


function makeBigInt(low, high, unsigned) {
  return unsigned ? ((+((low>>>0)))+((+((high>>>0)))*4294967296.0)) : ((+((low>>>0)))+((+((high|0)))*4294967296.0));
}

function dynCall(sig, ptr, args) {
  if (args && args.length) {
    assert(args.length == sig.length-1);
    assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
    return Module['dynCall_' + sig].apply(null, [ptr].concat(args));
  } else {
    assert(sig.length == 1);
    assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
    return Module['dynCall_' + sig].call(null, ptr);
  }
}

var tempRet0 = 0;

var setTempRet0 = function(value) {
  tempRet0 = value;
};

var getTempRet0 = function() {
  return tempRet0;
};

function getCompilerSetting(name) {
  throw 'You must build with -s RETAIN_COMPILER_SETTINGS=1 for getCompilerSetting or emscripten_get_compiler_setting to work';
}

var Runtime = {
  // helpful errors
  getTempRet0: function() { abort('getTempRet0() is now a top-level function, after removing the Runtime object. Remove "Runtime."') },
  staticAlloc: function() { abort('staticAlloc() is now a top-level function, after removing the Runtime object. Remove "Runtime."') },
  stackAlloc: function() { abort('stackAlloc() is now a top-level function, after removing the Runtime object. Remove "Runtime."') },
};

// The address globals begin at. Very low in memory, for code size and optimization opportunities.
// Above 0 is static memory, starting with globals.
// Then the stack.
// Then 'dynamic' memory for sbrk.
var GLOBAL_BASE = 1024;




// === Preamble library stuff ===

// Documentation for the public APIs defined in this file must be updated in:
//    site/source/docs/api_reference/preamble.js.rst
// A prebuilt local version of the documentation is available at:
//    site/build/text/docs/api_reference/preamble.js.txt
// You can also build docs locally as HTML or other formats in site/
// An online HTML version (which may be of a different version of Emscripten)
//    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html


var wasmBinary;if (Module['wasmBinary']) wasmBinary = Module['wasmBinary'];if (!Object.getOwnPropertyDescriptor(Module, 'wasmBinary')) Object.defineProperty(Module, 'wasmBinary', { configurable: true, get: function() { abort('Module.wasmBinary has been replaced with plain wasmBinary') } });
var noExitRuntime;if (Module['noExitRuntime']) noExitRuntime = Module['noExitRuntime'];if (!Object.getOwnPropertyDescriptor(Module, 'noExitRuntime')) Object.defineProperty(Module, 'noExitRuntime', { configurable: true, get: function() { abort('Module.noExitRuntime has been replaced with plain noExitRuntime') } });


if (typeof WebAssembly !== 'object') {
  abort('No WebAssembly support found. Build with -s WASM=0 to target JavaScript instead.');
}


// In MINIMAL_RUNTIME, setValue() and getValue() are only available when building with safe heap enabled, for heap safety checking.
// In traditional runtime, setValue() and getValue() are always available (although their use is highly discouraged due to perf penalties)

/** @type {function(number, number, string, boolean=)} */
function setValue(ptr, value, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': HEAP8[((ptr)>>0)]=value; break;
      case 'i8': HEAP8[((ptr)>>0)]=value; break;
      case 'i16': HEAP16[((ptr)>>1)]=value; break;
      case 'i32': HEAP32[((ptr)>>2)]=value; break;
      case 'i64': (tempI64 = [value>>>0,(tempDouble=value,(+(Math_abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? ((Math_min((+(Math_floor((tempDouble)/4294967296.0))), 4294967295.0))|0)>>>0 : (~~((+(Math_ceil((tempDouble - +(((~~(tempDouble)))>>>0))/4294967296.0)))))>>>0) : 0)],HEAP32[((ptr)>>2)]=tempI64[0],HEAP32[(((ptr)+(4))>>2)]=tempI64[1]); break;
      case 'float': HEAPF32[((ptr)>>2)]=value; break;
      case 'double': HEAPF64[((ptr)>>3)]=value; break;
      default: abort('invalid type for setValue: ' + type);
    }
}

/** @type {function(number, string, boolean=)} */
function getValue(ptr, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
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





// Wasm globals

var wasmMemory;

// In fastcomp asm.js, we don't need a wasm Table at all.
// In the wasm backend, we polyfill the WebAssembly object,
// so this creates a (non-native-wasm) table for us.
var wasmTable = new WebAssembly.Table({
  'initial': 10,
  'maximum': 10 + 0,
  'element': 'anyfunc'
});


//========================================
// Runtime essentials
//========================================

// whether we are quitting the application. no code should run after this.
// set in exit() and abort()
var ABORT = false;

// set by exit() and abort().  Passed to 'onExit' handler.
// NOTE: This is also used as the process return code code in shell environments
// but only when noExitRuntime is false.
var EXITSTATUS = 0;

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

function cwrap(ident, returnType, argTypes, opts) {
  return function() {
    return ccall(ident, returnType, argTypes, arguments, opts);
  }
}

var ALLOC_NORMAL = 0; // Tries to use _malloc()
var ALLOC_STACK = 1; // Lives for the duration of the current function call
var ALLOC_DYNAMIC = 2; // Cannot be freed except through sbrk
var ALLOC_NONE = 3; // Do not allocate

// allocate(): This is for internal use. You can use it yourself as well, but the interface
//             is a little tricky (see docs right below). The reason is that it is optimized
//             for multiple syntaxes to save space in generated code. So you should
//             normally not use allocate(), and instead allocate memory using _malloc(),
//             initialize it with setValue(), and so forth.
// @slab: An array of data, or a number. If a number, then the size of the block to allocate,
//        in *bytes* (note that this is sometimes confusing: the next parameter does not
//        affect this!)
// @types: Either an array of types, one for each byte (or 0 if no type at that position),
//         or a single type which is used for the entire block. This only matters if there
//         is initial data - if @slab is a number, then this does not matter at all and is
//         ignored.
// @allocator: How to allocate memory, see ALLOC_*
/** @type {function((TypedArray|Array<number>|number), string, number, number=)} */
function allocate(slab, types, allocator, ptr) {
  var zeroinit, size;
  if (typeof slab === 'number') {
    zeroinit = true;
    size = slab;
  } else {
    zeroinit = false;
    size = slab.length;
  }

  var singleType = typeof types === 'string' ? types : null;

  var ret;
  if (allocator == ALLOC_NONE) {
    ret = ptr;
  } else {
    ret = [_malloc,
    stackAlloc,
    dynamicAlloc][allocator](Math.max(size, singleType ? 1 : types.length));
  }

  if (zeroinit) {
    var stop;
    ptr = ret;
    assert((ret & 3) == 0);
    stop = ret + (size & ~3);
    for (; ptr < stop; ptr += 4) {
      HEAP32[((ptr)>>2)]=0;
    }
    stop = ret + size;
    while (ptr < stop) {
      HEAP8[((ptr++)>>0)]=0;
    }
    return ret;
  }

  if (singleType === 'i8') {
    if (slab.subarray || slab.slice) {
      HEAPU8.set(/** @type {!Uint8Array} */ (slab), ret);
    } else {
      HEAPU8.set(new Uint8Array(slab), ret);
    }
    return ret;
  }

  var i = 0, type, typeSize, previousType;
  while (i < size) {
    var curr = slab[i];

    type = singleType || types[i];
    if (type === 0) {
      i++;
      continue;
    }
    assert(type, 'Must know what type to store in allocate!');

    if (type == 'i64') type = 'i32'; // special case: we have one i32 here, and one i32 later

    setValue(ret+i, curr, type);

    // no need to look up size unless type changes, so cache it
    if (previousType !== type) {
      typeSize = getNativeTypeSize(type);
      previousType = type;
    }
    i += typeSize;
  }

  return ret;
}

// Allocate memory during any stage of startup - static memory early on, dynamic memory later, malloc when ready
function getMemory(size) {
  if (!runtimeInitialized) return dynamicAlloc(size);
  return _malloc(size);
}




/** @type {function(number, number=)} */
function Pointer_stringify(ptr, length) {
  abort("this function has been removed - you should use UTF8ToString(ptr, maxBytesToRead) instead!");
}

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


// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the given array that contains uint8 values, returns
// a copy of that string as a Javascript String object.

var UTF8Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf8') : undefined;

/**
 * @param {number} idx
 * @param {number=} maxBytesToRead
 * @return {string}
 */
function UTF8ArrayToString(u8Array, idx, maxBytesToRead) {
  var endIdx = idx + maxBytesToRead;
  var endPtr = idx;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  // (As a tiny code save trick, compare endPtr against endIdx using a negation, so that undefined means Infinity)
  while (u8Array[endPtr] && !(endPtr >= endIdx)) ++endPtr;

  if (endPtr - idx > 16 && u8Array.subarray && UTF8Decoder) {
    return UTF8Decoder.decode(u8Array.subarray(idx, endPtr));
  } else {
    var str = '';
    // If building with TextDecoder, we have already computed the string length above, so test loop end condition against that
    while (idx < endPtr) {
      // For UTF8 byte structure, see:
      // http://en.wikipedia.org/wiki/UTF-8#Description
      // https://www.ietf.org/rfc/rfc2279.txt
      // https://tools.ietf.org/html/rfc3629
      var u0 = u8Array[idx++];
      if (!(u0 & 0x80)) { str += String.fromCharCode(u0); continue; }
      var u1 = u8Array[idx++] & 63;
      if ((u0 & 0xE0) == 0xC0) { str += String.fromCharCode(((u0 & 31) << 6) | u1); continue; }
      var u2 = u8Array[idx++] & 63;
      if ((u0 & 0xF0) == 0xE0) {
        u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
      } else {
        if ((u0 & 0xF8) != 0xF0) warnOnce('Invalid UTF-8 leading byte 0x' + u0.toString(16) + ' encountered when deserializing a UTF-8 string on the asm.js/wasm heap to a JS string!');
        u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | (u8Array[idx++] & 63);
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
//   outU8Array: the array to copy to. Each index in this array is assumed to be one 8-byte element.
//   outIdx: The starting offset in the array to begin the copying.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array.
//                    This count should include the null terminator,
//                    i.e. if maxBytesToWrite=1, only the null terminator will be written and nothing else.
//                    maxBytesToWrite=0 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8Array(str, outU8Array, outIdx, maxBytesToWrite) {
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
      outU8Array[outIdx++] = u;
    } else if (u <= 0x7FF) {
      if (outIdx + 1 >= endIdx) break;
      outU8Array[outIdx++] = 0xC0 | (u >> 6);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0xFFFF) {
      if (outIdx + 2 >= endIdx) break;
      outU8Array[outIdx++] = 0xE0 | (u >> 12);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else {
      if (outIdx + 3 >= endIdx) break;
      if (u >= 0x200000) warnOnce('Invalid Unicode code point 0x' + u.toString(16) + ' encountered when serializing a JS string to an UTF-8 string on the asm.js/wasm heap! (Valid unicode code points should be in range 0-0x1FFFFF).');
      outU8Array[outIdx++] = 0xF0 | (u >> 18);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    }
  }
  // Null-terminate the pointer to the buffer.
  outU8Array[outIdx] = 0;
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


// Given a pointer 'ptr' to a null-terminated UTF16LE-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

var UTF16Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-16le') : undefined;
function UTF16ToString(ptr) {
  assert(ptr % 2 == 0, 'Pointer passed to UTF16ToString must be aligned to two bytes!');
  var endPtr = ptr;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  var idx = endPtr >> 1;
  while (HEAP16[idx]) ++idx;
  endPtr = idx << 1;

  if (endPtr - ptr > 32 && UTF16Decoder) {
    return UTF16Decoder.decode(HEAPU8.subarray(ptr, endPtr));
  } else {
    var i = 0;

    var str = '';
    while (1) {
      var codeUnit = HEAP16[(((ptr)+(i*2))>>1)];
      if (codeUnit == 0) return str;
      ++i;
      // fromCharCode constructs a character from a UTF-16 code unit, so we can pass the UTF16 string right through.
      str += String.fromCharCode(codeUnit);
    }
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
    HEAP16[((outPtr)>>1)]=codeUnit;
    outPtr += 2;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP16[((outPtr)>>1)]=0;
  return outPtr - startPtr;
}

// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF16(str) {
  return str.length*2;
}

function UTF32ToString(ptr) {
  assert(ptr % 4 == 0, 'Pointer passed to UTF32ToString must be aligned to four bytes!');
  var i = 0;

  var str = '';
  while (1) {
    var utf32 = HEAP32[(((ptr)+(i*4))>>2)];
    if (utf32 == 0)
      return str;
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
    HEAP32[((outPtr)>>2)]=codeUnit;
    outPtr += 4;
    if (outPtr + 4 > endPtr) break;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP32[((outPtr)>>2)]=0;
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
  var ret = _malloc(size);
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
/** @deprecated */
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

function writeAsciiToMemory(str, buffer, dontAddNull) {
  for (var i = 0; i < str.length; ++i) {
    assert(str.charCodeAt(i) === str.charCodeAt(i)&0xff);
    HEAP8[((buffer++)>>0)]=str.charCodeAt(i);
  }
  // Null-terminate the pointer to the HEAP.
  if (!dontAddNull) HEAP8[((buffer)>>0)]=0;
}




// Memory management

var PAGE_SIZE = 16384;
var WASM_PAGE_SIZE = 65536;
var ASMJS_PAGE_SIZE = 16777216;

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

var STATIC_BASE = 1024,
    STACK_BASE = 5252640,
    STACKTOP = STACK_BASE,
    STACK_MAX = 9760,
    DYNAMIC_BASE = 5252640,
    DYNAMICTOP_PTR = 9600;

assert(STACK_BASE % 16 === 0, 'stack must start aligned');
assert(DYNAMIC_BASE % 16 === 0, 'heap must start aligned');



var TOTAL_STACK = 5242880;
if (Module['TOTAL_STACK']) assert(TOTAL_STACK === Module['TOTAL_STACK'], 'the stack size can no longer be determined at runtime')

var INITIAL_TOTAL_MEMORY = Module['TOTAL_MEMORY'] || 16777216;if (!Object.getOwnPropertyDescriptor(Module, 'TOTAL_MEMORY')) Object.defineProperty(Module, 'TOTAL_MEMORY', { configurable: true, get: function() { abort('Module.TOTAL_MEMORY has been replaced with plain INITIAL_TOTAL_MEMORY') } });

assert(INITIAL_TOTAL_MEMORY >= TOTAL_STACK, 'TOTAL_MEMORY should be larger than TOTAL_STACK, was ' + INITIAL_TOTAL_MEMORY + '! (TOTAL_STACK=' + TOTAL_STACK + ')');

// check for full engine support (use string 'subarray' to avoid closure compiler confusion)
assert(typeof Int32Array !== 'undefined' && typeof Float64Array !== 'undefined' && Int32Array.prototype.subarray !== undefined && Int32Array.prototype.set !== undefined,
       'JS engine does not provide full typed array support');






// In standalone mode, the wasm creates the memory, and the user can't provide it.
// In non-standalone/normal mode, we create the memory here.

// Create the main memory. (Note: this isn't used in STANDALONE_WASM mode since the wasm
// memory is created in the wasm, not in JS.)

  if (Module['wasmMemory']) {
    wasmMemory = Module['wasmMemory'];
  } else
  {
    wasmMemory = new WebAssembly.Memory({
      'initial': INITIAL_TOTAL_MEMORY / WASM_PAGE_SIZE
    });
  }


if (wasmMemory) {
  buffer = wasmMemory.buffer;
}

// If the user provides an incorrect length, just use that length instead rather than providing the user to
// specifically provide the memory length with Module['TOTAL_MEMORY'].
INITIAL_TOTAL_MEMORY = buffer.byteLength;
assert(INITIAL_TOTAL_MEMORY % WASM_PAGE_SIZE === 0);
updateGlobalBufferAndViews(buffer);

HEAP32[DYNAMICTOP_PTR>>2] = DYNAMIC_BASE;




// Initializes the stack cookie. Called at the startup of main and at the startup of each thread in pthreads mode.
function writeStackCookie() {
  assert((STACK_MAX & 3) == 0);
  // The stack grows downwards
  HEAPU32[(STACK_MAX >> 2)+1] = 0x02135467;
  HEAPU32[(STACK_MAX >> 2)+2] = 0x89BACDFE;
  // Also test the global address 0 for integrity.
  // We don't do this with ASan because ASan does its own checks for this.
  HEAP32[0] = 0x63736d65; /* 'emsc' */
}

function checkStackCookie() {
  var cookie1 = HEAPU32[(STACK_MAX >> 2)+1];
  var cookie2 = HEAPU32[(STACK_MAX >> 2)+2];
  if (cookie1 != 0x02135467 || cookie2 != 0x89BACDFE) {
    abort('Stack overflow! Stack cookie has been overwritten, expected hex dwords 0x89BACDFE and 0x02135467, but received 0x' + cookie2.toString(16) + ' ' + cookie1.toString(16));
  }
  // Also test the global address 0 for integrity.
  // We don't do this with ASan because ASan does its own checks for this.
  if (HEAP32[0] !== 0x63736d65 /* 'emsc' */) abort('Runtime error: The application has corrupted its heap memory area (address zero)!');
}

function abortStackOverflow(allocSize) {
  abort('Stack overflow! Attempted to allocate ' + allocSize + ' bytes on the stack, but stack has only ' + (STACK_MAX - stackSave() + allocSize) + ' bytes available!');
}




// Endianness check (note: assumes compiler arch was little-endian)
(function() {
  var h16 = new Int16Array(1);
  var h8 = new Int8Array(h16.buffer);
  h16[0] = 0x6373;
  if (h8[0] !== 0x73 || h8[1] !== 0x63) throw 'Runtime error: expected the system to be little-endian!';
})();

function abortFnPtrError(ptr, sig) {
	abort("Invalid function pointer " + ptr + " called with signature '" + sig + "'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this). Build with ASSERTIONS=2 for more info.");
}



function callRuntimeCallbacks(callbacks) {
  while(callbacks.length > 0) {
    var callback = callbacks.shift();
    if (typeof callback == 'function') {
      callback();
      continue;
    }
    var func = callback.func;
    if (typeof func === 'number') {
      if (callback.arg === undefined) {
        Module['dynCall_v'](func);
      } else {
        Module['dynCall_vi'](func, callback.arg);
      }
    } else {
      func(callback.arg === undefined ? null : callback.arg);
    }
  }
}

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

function preMain() {
  checkStackCookie();
  
  callRuntimeCallbacks(__ATMAIN__);
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

function unSign(value, bits, ignore) {
  if (value >= 0) {
    return value;
  }
  return bits <= 32 ? 2*Math.abs(1 << (bits-1)) + value // Need some trickery, since if bits == 32, we are right at the limit of the bits JS uses in bitshifts
                    : Math.pow(2, bits)         + value;
}
function reSign(value, bits, ignore) {
  if (value <= 0) {
    return value;
  }
  var half = bits <= 32 ? Math.abs(1 << (bits-1)) // abs is needed if bits == 32
                        : Math.pow(2, bits-1);
  if (value >= half && (bits <= 32 || value > half)) { // for huge values, we can hit the precision limit and always get true here. so don't do that
                                                       // but, in general there is no perfect solution here. With 64-bit ints, we get rounding and errors
                                                       // TODO: In i64 mode 1, resign the two parts separately and safely
    value = -2*half + value; // Cannot bitshift half, as it may be at the limit of the bits JS uses in bitshifts
  }
  return value;
}


assert(Math.imul, 'This browser does not support Math.imul(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill');
assert(Math.fround, 'This browser does not support Math.fround(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill');
assert(Math.clz32, 'This browser does not support Math.clz32(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill');
assert(Math.trunc, 'This browser does not support Math.trunc(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill');

var Math_abs = Math.abs;
var Math_cos = Math.cos;
var Math_sin = Math.sin;
var Math_tan = Math.tan;
var Math_acos = Math.acos;
var Math_asin = Math.asin;
var Math_atan = Math.atan;
var Math_atan2 = Math.atan2;
var Math_exp = Math.exp;
var Math_log = Math.log;
var Math_sqrt = Math.sqrt;
var Math_ceil = Math.ceil;
var Math_floor = Math.floor;
var Math_pow = Math.pow;
var Math_imul = Math.imul;
var Math_fround = Math.fround;
var Math_round = Math.round;
var Math_min = Math.min;
var Math_max = Math.max;
var Math_clz32 = Math.clz32;
var Math_trunc = Math.trunc;



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
  return id;
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


function abort(what) {
  if (Module['onAbort']) {
    Module['onAbort'](what);
  }

  what += '';
  out(what);
  err(what);

  ABORT = true;
  EXITSTATUS = 1;

  var output = 'abort(' + what + ') at ' + stackTrace();
  what = output;

  // Throw a wasm runtime error, because a JS error might be seen as a foreign
  // exception, which means we'd run destructors on it. We need the error to
  // simply make the program stop.
  throw new WebAssembly.RuntimeError(what);
}


var memoryInitializer = null;




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



// Copyright 2017 The Emscripten Authors.  All rights reserved.
// Emscripten is available under two separate licenses, the MIT license and the
// University of Illinois/NCSA Open Source License.  Both these licenses can be
// found in the LICENSE file.

// Prefix of data URIs emitted by SINGLE_FILE and related options.
var dataURIPrefix = 'data:application/octet-stream;base64,';

// Indicates whether filename is a base64 data URI.
function isDataURI(filename) {
  return String.prototype.startsWith ?
      filename.startsWith(dataURIPrefix) :
      filename.indexOf(dataURIPrefix) === 0;
}




var wasmBinaryFile = 'data:application/octet-stream;base64,AGFzbQEAAAAB8AEiYAF/AX9gAn9/AX9gA39/fwF/YAF/AGACf38AYAABf2ADf39/AGAEf39/fwF/YAV/f39/fwF/YAN/fn8BfmAEf39/fwBgBX9/f39/AGAGf3x/f39/AX9gAn9/AXxgA39/fwF8YAAAYAR/fn5/AGADf3x8AGACfn8Bf2AEf39/fwF8YAJ/fABgBH98f38AYAZ/fH9/f38AYAd/f39/f39/AX9gB39/f398f38Bf2AHf398f39/fwF/YAR/fn9/AX9gAn98AX9gA35/fwF/YAR/f35/AX5gAXwBfmAGf39/f39/AXxgAn5+AXxgAnx/AXwC2gELA2VudgRleGl0AAMDZW52Bl9fbG9jawADA2VudghfX3VubG9jawADDXdhc2lfdW5zdGFibGUIZmRfY2xvc2UAAA13YXNpX3Vuc3RhYmxlCGZkX3dyaXRlAAcDZW52FmVtc2NyaXB0ZW5fcmVzaXplX2hlYXAAAANlbnYVZW1zY3JpcHRlbl9tZW1jcHlfYmlnAAIDZW52C3NldFRlbXBSZXQwAAMNd2FzaV91bnN0YWJsZQdmZF9zZWVrAAgDZW52Bm1lbW9yeQIAgAIDZW52BXRhYmxlAXAACgOXAZUBBQ8HCgcGBgYLBAQGBQMDAwEEAgADAggEBAMBAQIKBAQEAAEACAEDBAEAAQMBAAAAAAMUGwEBAgEOCw0VDQ4YBg0TEx8WDhERBQEABQEBBQADAwAAAAIFDwABCQIAAAACCQACBQEhAAIIFwYACgsSHBICDAQeBwICAgEBAAAQECAAAwEBAQQAAgIEBQADAB0HARkGCBoGEAJ/AUGAy8ACC38AQfTKAAsH8wEREV9fd2FzbV9jYWxsX2N0b3JzAAoGZmZsdXNoAFwEZnJlZQCKARBfX2Vycm5vX2xvY2F0aW9uAFEGbWFsbG9jAIkBBXN0YXJ0AC0Ic2V0VGhyZXcAkgEKX19kYXRhX2VuZAMBCXN0YWNrU2F2ZQCTAQpzdGFja0FsbG9jAJQBDHN0YWNrUmVzdG9yZQCVARBfX2dyb3dXYXNtTWVtb3J5AJYBDGR5bkNhbGxfamlqaQCcAQxkeW5DYWxsX2lpaWkAmAEKZHluQ2FsbF9paQCZAQ9keW5DYWxsX2lpZGlpaWkAmgELZHluQ2FsbF92aWkAmwEJDwEAQQELCWNk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ACGmASA1IKYBNwIAIAcoAuABITZBACE3IDcoApgmITggNiA4ayE5IAcgOTYCtAEgBygC5AEhOkEAITsgOygCnCYhPCA6IDxrIT0gByA9NgKwASAHKALYASE+QQAhPyA/KAKYJiFAID4gQGshQSAHIEE2AqwBIAcoAtwBIUJBACFDIEMoApwmIUQgQiBEayFFIAcgRTYCqAEgBygC0AEhRkEAIUcgRygCmCYhSCBGIEhrIUkgByBJNgKkASAHKALUASFKQQAhSyBLKAKcJiFMIEogTGshTSAHIE02AqABIAcoAugBIU4gTiFPIC8hUCBPIFBHIVFBASFSIFEgUnEhUwJAAkAgU0UNAEHjACFUQccLIVUgBygCtAEhViBWtyG0ASAHKALoASFXIFcrAxAhtQEgtAEgtQGiIbYBILYBtiGoASAHIKgBOAKcASAHKAKwASFYIFi3IbcBIAcoAugBIVkgWSsDGCG4ASC3ASC4AaIhuQEguQG2IakBIAcgqQE4ApgBIAcoAqwBIVogWrchugEgBygC6AEhWyBbKwMQIbsBILoBILsBoiG8ASC8AbYhqgEgByCqATgClAEgBygCqAEhXCBctyG9ASAHKALoASFdIF0rAxghvgEgvQEgvgGiIb8BIL8BtiGrASAHIKsBOAKQASAHKAKkASFeIF63IcABIAcoAugBIV8gXysDECHBASDAASDBAaIhwgEgwgG2IawBIAcgrAE4AowBIAcoAqABIWAgYLchwwEgBygC6AEhYSBhKwMYIcQBIMMBIMQBoiHFASDFAbYhrQEgByCtATgCiAEgByBVNgKEAUEAIWIgYi0AlCYhY0EYIWQgYyBkdCFlIGUgZHUhZiBmIWcgVCFoIGcgaEYhaUEBIWogaSBqcSFrAkAga0UNACAHKAKEASFsQQEhbSBsIG1qIW4gByBuNgKEAQsgBygC7AEhbyAHKAKEASFwIAcqApwBIa4BIK4BuyHGASAHKgKYASGvASCvAbshxwEgByoClAEhsAEgsAG7IcgBIAcqApABIbEBILEBuyHJASAHKgKMASGyASCyAbshygEgByoCiAEhswEgswG7IcsBQSghcSAHIHFqIXIgciDLATkDAEEgIXMgByBzaiF0IHQgygE5AwBBGCF1IAcgdWohdiB2IMkBOQMAQRAhdyAHIHdqIXggeCDIATkDACAH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YyBgIGNqIWQgZCsDECGeASADKAIQIWUgZbchnwEgAygCECFmIGa3IaABIJ8BIKABoiGhASCeASChAaAhogEgAygCGCFnIGcoAhQhaCADKAIUIWlBASFqIGkgamoha0EoIWwgayBsbCFtIGggbWohbiBuIKIBOQMQIAMoAhghbyBvKAIUIXAgAygCFCFxQSghciBxIHJsIXMgcCBzaiF0IHQrAxghowEgAygCECF1IHW3IaQBIAMoAgwhdiB2tyGlASCkASClAaIhpgEgowEgpgGgIacBIAMoAhghdyB3KAIUIXggAygCFCF5QQEheiB5IHpqIXtBKCF8IHsgfGwhfSB4IH1qIX4gfiCnATkDGCADKAIYIX8gfygCFCGAASADKAIUIYEBQSghggEggQEgggFsIYMBIIABIIMBaiGEASCEASsDICGoASADKAIMIYUBIIUBtyGpASADKAIMIYYBIIYBtyGqASCpASCqAaIhqwEgqAEgqwGgIawBIAMoAhghhwEghwEoAhQhiAEgAygCFCGJAUEBIYoBIIkBIIoBaiGLAUEoIYwBIIsBIIwBbCGNASCIASCNAWohjgEgjgEgrAE5AyAgAygCFCGPAUEBIZABII8BIJABaiGRASADIJEBNgIUDAAACwALQQAhkgEgAyCSATYCHAwBC0EBIZMBIAMgkwE2AhwLIAMoAhwhlAFBICGVASADIJUBaiGWASCWASQAIJQBDwv2PALHBn8SfiMAIQFBgAIhAiABIAJrIQMgAyQAQQAhBEEEIQUgAyAANgL4ASADKAL4ASEGIAYoAgQhByADIAc2AvQBIAMoAvgBIQggCCgCACEJIAMgCTYC8AEgAyAENgKcASADIAQ2ApgBIAMoAvABIQogCiAFEIsBIQsgAyALNgKcASALIQwgBCENIAwgDUYhDkEBIQ8gDiAPcSEQAkACQAJAIBBFDQAMAQtBACERQQQhEiADKALwASETIBMgEhCLASEUIAMgFDYCmAEgFCEVIBEhFiAVIBZGIRdBASEYIBcgGHEhGQJAIBlFDQAMAQtBACEaIAMgGjYC5AEgAygC8AEhG0EBIRwgGyAcayEdIAMgHTYC7AECQANAQQAhHiADKALsASEfIB8hICAeISEgICAhTiEiQQEhIyAiICNxISQgJEUNASADKAL0ASElIAMoAuwBISZBAyEnICYg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ASADQSBxGyEBIAJFDQAgABBZCyAFQdABaiQAIAELmxICD38BfiMAQdAAayIHJAAgByABNgJMIAdBN2ohCCAHQThqIQlBACEKQQAhC0EAIQECQANAAkAgC0EASA0AAkAgAUH/////ByALa0wNABBRQT02AgBBfyELDAELIAEgC2ohCwsgBygCTCIMIQECQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkAgDC0AACINRQ0AAkADQAJAAkACQCANQf8BcSINDQAgASENDAELIA1BJUcNASABIQ0DQCABLQABQSVHDQEgByABQQJqIg42AkwgDUEBaiENIAEtAAIhDyAOIQEgD0ElRg0ACwsgDSAMayEBAkAgAEUNACAAIAwgARBzCyABDRIgBygCTCwAARBqIQ5BfyEQQQEhDSAHKAJMIQECQCAORQ0AIAEtAAJBJEcNACABLAABQVBqIRBBASEKQQMhDQsgByABIA1qIgE2AkxBACENAkACQCABLAAAIhFBYGoiD0EfTQ0AIAEhDgwBCyABIQ5BASAPdCIPQYnRBHFFDQADQCAHIAFBAWoiDjYCTCAPIA1yIQ0gASwAASIRQWBqIg9BH0sNASAOIQFBASAPdCIPQYnRBHENAAsLAkACQCARQSpHDQACQAJAIA4sAAEQakUNACAHKAJMIg4tAAJBJEcNACAOLAABQQJ0IARqQcB+akEKNgIAIA5BA2ohASAOLAABQQN0IANqQYB9aigCACESQQEhCgwBCyAKDQdBACEKQQAhEgJAIABFDQAgAiACKAIAIgFBBGo2AgAgASgCACESCyAHKAJMQQFqIQELIAcgATYCTCASQX9KDQFBACASayESIA1BgMAAciENDAELIAdBzABqEHQiEkEASA0FIAcoAkwhAQtBfyETAkAgAS0AAEEuRw0AAkAgAS0AAUEqRw0AAkAgASwAAhBqRQ0AIAcoAkwiAS0AA0EkRw0AIAEsAAJBAnQgBGpBwH5qQQo2AgAgASwAAkEDdCADakGAfWooAgAhEyAHIAFBBGoiATYCTAwCCyAKDQYCQAJAIAANAEEAIRMMAQsgAiACKAIAIgFBBGo2AgAgASgCACETCyAHIAcoAkxBAmoiATYCTAwBCyAHIAFBAWo2AkwgB0HMAGoQdCETIAcoAkwhAQtBACEOA0AgDiEPQX8hFCABLAAA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Aw0ACwsgASAAawsVAAJAIAANAEEADwsQUSAANgIAQX8LZQEBfgJAAkACQCADQcAAcUUNACACIANBQGqtiCEBQgAhBEIAIQIMAQsgA0UNASACQcAAIANrrYYgASADrSIEiIQhASACIASIIQJCACEECyAEIAGEIQELIAAgATcDACAAIAI3AwgLXQEBfgJAAkACQCADQcAAcUUNACABIANBQGqthiECQgAhAQwBCyADRQ0BIAFBwAAgA2utiCACIAOtIgSGhCECIAEgBIYhAQsgAkIAhCECCyAAIAE3AwAgACACNwMIC+oDAgJ/An4jAEEgayICJAACQAJAIAFC////////////AIMiBEKAgICAgIDA/0N8IARCgICAgICAwIC8f3xaDQAgAEI8iCABQgSGhCEEAkAgAEL//////////w+DIgBCgYCAgICAgIAIVA0AIARCgYCAgICAgIDAAHwhBQwCCyAEQoCAgICAgICAwAB8IQUgAEKAgICAgICAgAiFQgBSDQEgBUIBgyAFfCEFDAELAkAgAFAgBEKAgICAgIDA//8AVCAEQoCAgICAgMD//wBRGw0AIABCPIggAUIEhoRC/////////wODQoCAgICAgID8/wCEIQUMAQtCgICAgICAgPj/ACEFIARC////////v//DAFYNAEIAIQUgBEIwiKciA0GR9wBJDQAgAiAAIAFC////////P4NCgICAgICAwACEIgRBgfgAIANrEIYBIAJBEGogACAEIANB/4h/ahCHASACKQMAIgRCPIggAkEIaikDAEIEhoQhBQJAIARC//////////8PgyACKQMQIAJBEGpBCGopAwCEQgBSrYQiBEKBgICAgICAgAhUDQAgBUIBfCEFDAELIARCgICAgICAgIAIhUIAUg0AIAVCAYMgBXwhBQsgAkEgaiQAIAUgAUKAgICAgICAgIB/g4S/C4swAQt/IwBBEGsiASQAAkACQAJAAkACQAJAAkACQAJAAkACQAJAIABB9AFLDQACQEEAKAL8RiICQRAgAEELakF4cSAAQQtJGyIDQQN2IgR2IgBBA3FFDQAgAEF/c0EBcSAEaiIDQQN0IgVBrMcAaigCACIEQQhqIQACQAJAIAQoAggiBiAFQaTHAGoiBUcNAEEAIAJBfiADd3E2AvxGDAELQQAoAoxHIAZLGiAGIAU2Agwg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SQ0AIAAgASACEAYaIAAPCyAAIAJqIQMCQAJAIAEgAHNBA3ENAAJAAkAgAkEBTg0AIAAhAgwBCwJAIABBA3ENACAAIQIMAQsgACECA0AgAiABLQAAOgAAIAFBAWohASACQQFqIgIgA08NASACQQNxDQALCwJAIANBfHEiBEHAAEkNACACIARBQGoiBUsNAANAIAIgASgCADYCACACIAEoAgQ2AgQgAiABKAIINgIIIAIgASgCDDYCDCACIAEoAhA2AhAgAiABKAIUNgIUIAIgASgCGDYCGCACIAEoAhw2AhwgAiABKAIgNgIgIAIgASgCJDYCJCACIAEoAig2AiggAiABKAIsNgIsIAIgASgCMDYCMCACIAEoAjQ2AjQgAiABKAI4NgI4IAIgASgCPDYCPCABQcAAaiEBIAJBwABqIgIgBU0NAAsLIAIgBE8NAQNAIAIgASgCADYCACABQQRqIQEgAkEEaiICIARJDQAMAgALAAsCQCADQQRPDQAgACECDAELAkAgA0F8aiIEIABPDQAgACECDAELIAAhAgNAIAIgAS0AADoAACACIAEtAAE6AAEgAiABLQACOgACIAIgAS0AAzoAAyABQQRqIQEgAkEEaiICIARNDQALCwJAIAIgA08NAANAIAIgAS0AADoAACABQQFqIQEgAkEBaiICIANHDQALCyAAC/MCAgN/AX4CQCACRQ0AIAIgAGoiA0F/aiABOgAAIAAgAToAACACQQNJDQAgA0F+aiABOgAAIAAgAToAASADQX1qIAE6AAAgACABOgACIAJBB0kNACADQXxqIAE6AAAgACABOgADIAJBCUkNACAAQQAgAGtBA3EiBGoiAyABQf8BcUGBgoQIbCIBNgIAIAMgAiAEa0F8cSIEaiICQXxqIAE2AgAgBEEJSQ0AIAMgATYCCCADIAE2AgQgAkF4aiABNgIAIAJBdGogATYCACAEQRlJDQAgAyABNgIYIAMgATYCFCADIAE2AhAgAyABNgIMIAJBcGogATYCACACQWxqIAE2AgAgAkFoaiABNgIAIAJBZGogATYCACAEIANBBHFBGHIiBWsiAkEgSQ0AIAGtIgZCIIYgBoQhBiADIAVqIQEDQCABIAY3AxggASAGNwMQIAEgBjcDCCABIAY3AwAgAUEgaiEBIAJBYGoiAkEfSw0ACwsgAAsdAAJAQQAoAuxKDQBBACABNgLwSkEAIAA2AuxKCwsEACMACxIBAX8jACAAa0FwcSIBJAAgAQsGACAAJAALBgAgAEAACw0AIAEgAiADIAARCQALDQAgASACIAMgABECAAsJACABIAARAAALEwAgASACIAMgBCAFIAYgABEMAAsLACABIAIgABEEAAskAQF+IAAgASACrSADrUIghoQgBBCXASEFIAVCIIinEAcgBacLEwAgACABpyABQiCIpyACIAMQCAsLikMDAEGACAuIGzw/eG1sIHZlcnNpb249IjEuMCIgc3RhbmRhbG9uZT0ibm8iPz4APCFET0NUWVBFIHN2ZyBQVUJMSUMgIi0vL1czQy8vRFREIFNWRyAyMDAxMDkwNC8vRU4iACAiaHR0cDovL3d3dy53My5vcmcvVFIvMjAwMS9SRUMtU1ZHLTIwMDEwOTA0L0RURC9zdmcxMC5kdGQiPgA8c3ZnIHZlcnNpb249IjEuMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgAgd2lkdGg9IiVmIiBoZWlnaHQ9IiVmIiB2aWV3Qm94PSIwIDAgJWYgJWYiACBwcmVzZXJ2ZUFzcGVjdFJhdGlvPSJ4TWlkWU1pZCBtZWV0Ij4APGcgdHJhbnNmb3JtPSIAdHJhbnNsYXRlKCVmLCVmKSAAc2NhbGUoJWYsJWYpIiAAZmlsbD0iIzAwMDAwMCIgc3Ryb2tlPSJub25lIj4APC9nPgA8L3N2Zz4APHBhdGggZD0iACIvPgAgAHoATSUuMWYgJS4xZgBNJWxkICVsZABtJS4xZiAlLjFmAG0lbGQgJWxkAGwlLjFmICUuMWYAbCVsZCAlbGQAYyUuMWYgJS4xZiAlLjFmICUuMWYgJS4xZiAlLjFmAGMlbGQgJWxkICVsZCAlbGQgJWxkICVsZAAlcwAAAAAAAAAAAAAAAAAAAAABAQABAAEBAAEBAAABAQEAAAABAQEAAQABAQABAAAAAAAAAQEBAAEBAAABAAAAAAABAAABAQAAAAEAAQEBAQEBAAEBAQEBAQEAAQEAAQEBAQABAAAAAQEAAAAAAQABAQAAAQEBAAABAAEBAQEBAQEBAQEBAAEAAAAAAAABAAEAAQABAAABAAABAAEBAQABAAAAAAEAAAAAAAABAAEAAQABAAABAQABAAAAAAAAAQAAAAABAQEBAAEBAAABAQAAAQEAAQEAAAABAQEBAAEAAAAAAQABAQEAAAABAAEBAAABAQEAAQAAAQEAAAEBAQAAAQEBAAAAAAEAAQABAAEAAQACAAAABAAAAAAAAAAAAPA/AQAAAAAAAACamZmZmZnJP3RyYWNlIGVycm9yOiAlcwoAcGFnZV9zdmcgZXJyb3I6ICVzCgAAAAAAAAAAAAAAABkSRDsCPyxHFD0zMAobBkZLRTcPSQ6OFwNAHTxpKzYfSi0cASAlKSEIDBUWIi4QOD4LNDEYZHR1di9BCX85ESNDMkKJiosFBCYoJw0qHjWMBxpIkxOUlQAAAAAAAAAAAElsbGVnYWwgYnl0ZSBzZXF1ZW5jZQBEb21haW4gZXJyb3IAUmVzdWx0IG5vdCByZXByZXNlbnRhYmxlAE5vdCBhIHR0eQBQZXJtaXNzaW9uIGRlbmllZABPcGVyYXRpb24gbm90IHBlcm1pdHRlZABObyBzdWNoIGZpbGUgb3IgZGlyZWN0b3J5AE5vIHN1Y2ggcHJvY2VzcwBGaWxlIGV4aXN0cwBWYWx1ZSB0b28gbGFyZ2UgZm9yIGRhdGEgdHlwZQBObyBzcGFjZSBsZWZ0IG9uIGRldmljZQBPdXQgb2YgbWVtb3J5AFJlc291cmNlIGJ1c3kASW50ZXJydXB0ZWQgc3lzdGVtIGNhbGwAUmVzb3VyY2UgdGVtcG9yYXJpbHkgdW5hdmFpbGFibGUASW52YWxpZCBzZWVrAENyb3NzLWRldmljZSBsaW5rAFJlYWQtb25seSBmaWxlIHN5c3RlbQBEaXJlY3Rvcnkgbm90IGVtcHR5AENvbm5lY3Rpb24gcmVzZXQgYnkgcGVlcgBPcGVyYXRpb24gdGltZWQgb3V0AENvbm5lY3Rpb24gcmVmdXNlZABIb3N0IGlzIGRvd24ASG9zdCBpcyB1bnJlYWNoYWJsZQBBZGRyZXNzIGluIHVzZQBCcm9rZW4gcGlwZQBJL08gZXJyb3IATm8gc3VjaCBkZXZpY2Ugb3IgYWRkcmVzcwBCbG9jayBkZXZpY2UgcmVxdWlyZWQATm8gc3VjaCBkZXZpY2UATm90IGEgZGlyZWN0b3J5AElzIGEgZGlyZWN0b3J5AFRleHQgZmlsZSBidXN5AEV4ZWMgZm9ybWF0IGVycm9yAEludmFsaWQgYXJndW1lbnQAQXJndW1lbnQgbGlzdCB0b28gbG9uZwBTeW1ib2xpYyBsaW5rIGxvb3AARmlsZW5hbWUgdG9vIGxvbmcAVG9vIG1hbnkgb3BlbiBmaWxlcyBpbiBzeXN0ZW0ATm8gZmlsZSBkZXNjcmlwdG9ycyBhdmFpbGFibGUAQmFkIGZpbGUgZGVzY3JpcHRvcgBObyBjaGlsZCBwcm9jZXNzAEJhZCBhZGRyZXNzAEZpbGUgdG9vIGxhcmdlAFRvbyBtYW55IGxpbmtzAE5vIGxvY2tzIGF2YWlsYWJsZQBSZXNvdXJjZSBkZWFkbG9jayB3b3VsZCBvY2N1cgBTdGF0ZSBub3QgcmVjb3ZlcmFibGUAUHJldmlvdXMgb3duZXIgZGllZABPcGVyYXRpb24gY2FuY2VsZWQARnVuY3Rpb24gbm90IGltcGxlbWVudGVkAE5vIG1lc3NhZ2Ugb2YgZGVzaXJlZCB0eXBlAElkZW50aWZpZXIgcmVtb3ZlZABEZXZpY2Ugbm90IGEgc3RyZWFtAE5vIGRhdGEgYXZhaWxhYmxlAERldmljZSB0aW1lb3V0AE91dCBvZiBzdHJlYW1zIHJlc291cmNlcwBMaW5rIGhhcyBiZWVuIHNldmVyZWQAUHJvdG9jb2wgZXJyb3IAQmFkIG1lc3NhZ2UARmlsZSBkZXNjcmlwdG9yIGluIGJhZCBzdGF0ZQBOb3QgYSBzb2NrZXQARGVzdGluYXRpb24gYWRkcmVzcyByZXF1aXJlZABNZXNzYWdlIHRvbyBsYXJnZQBQcm90b2NvbCB3cm9uZyB0eXBlIGZvciBzb2NrZXQAUHJvdG9jb2wgbm90IGF2YWlsYWJsZQBQcm90b2NvbCBub3Qgc3VwcG9ydGVkAFNvY2tldCB0eXBlIG5vdCBzdXBwb3J0ZWQATm90IHN1cHBvcnRlZABQcm90b2NvbCBmYW1pbHkgbm90IHN1cHBvcnRlZABBZGRyZXNzIGZhbWlseSBub3Qgc3VwcG9ydGVkIGJ5IHByb3RvY29sAEFkZHJlc3Mgbm90IGF2YWlsYWJsZQBOZXR3b3JrIGlzIGRvd24ATmV0d29yayB1bnJlYWNoYWJsZQBDb25uZWN0aW9uIHJlc2V0IGJ5IG5ldHdvcmsAQ29ubmVjdGlvbiBhYm9ydGVkAE5vIGJ1ZmZlciBzcGFjZSBhdmFpbGFibGUAU29ja2V0IGlzIGNvbm5lY3RlZABTb2NrZXQgbm90IGNvbm5lY3RlZABDYW5ub3Qgc2VuZCBhZnRlciBzb2NrZXQgc2h1dGRvd24AT3BlcmF0aW9uIGFscmVhZHkgaW4gcHJvZ3Jlc3MAT3BlcmF0aW9uIGluIHByb2dyZXNzAFN0YWxlIGZpbGUgaGFuZGxlAFJlbW90ZSBJL08gZXJyb3IAUXVvdGEgZXhjZWVkZWQATm8gbWVkaXVtIGZvdW5kAFdyb25nIG1lZGl1bSB0eXBlAE5vIGVycm9yIGluZm9ybWF0aW9uAACAEgAALSsgICAwWDB4AChudWxsKQAAAAAAAAAAAAAAAAAAAAARAAoAERERAAAAAAUAAAAAAAAJAAAAAAsAAAAAAAAAABEADwoREREDCgcAARMJCwsAAAkGCwAACwAGEQAAABEREQAAAAAAAAAAAAAAAAAAAAALAAAAAAAAAAARAAoKERERAAoAAAIACQsAAAAJAAsAAAsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAADAAAAAAMAAAAAAkMAAAAAAAMAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4AAAAAAAAAAAAAAA0AAAAEDQAAAAAJDgAAAAAADgAADgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAPAAAAAA8AAAAACRAAAAAAABAAABAAABIAAAASEhIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEgAAABISEgAAAAAAAAkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsAAAAAAAAAAAAAAAoAAAAACgAAAAAJCwAAAAAACwAACwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAMAAAAAAwAAAAACQwAAAAAAAwAAAwAADAxMjM0NTY3ODlBQkNERUYtMFgrMFggMFgtMHgrMHggMHgAaW5mAElORgBuYW4ATkFOAC4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEGIIwuIAwEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEwjAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAAAAYAAAB8IwAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAA//////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEGQJgvkJAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
if (!isDataURI(wasmBinaryFile)) {
  wasmBinaryFile = locateFile(wasmBinaryFile);
}

function getBinary() {
  try {
    if (wasmBinary) {
      return new Uint8Array(wasmBinary);
    }

    var binary = tryParseAsDataURI(wasmBinaryFile);
    if (binary) {
      return binary;
    }
    if (readBinary) {
      return readBinary(wasmBinaryFile);
    } else {
      throw "both async and sync fetching of the wasm failed";
    }
  }
  catch (err) {
    abort(err);
  }
}

function getBinaryPromise() {
  // if we don't have the binary yet, and have the Fetch api, use that
  // in some environments, like Electron's render process, Fetch api may be present, but have a different context than expected, let's only use it on the Web
  if (!wasmBinary && (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) && typeof fetch === 'function') {
    return fetch(wasmBinaryFile, { credentials: 'same-origin' }).then(function(response) {
      if (!response['ok']) {
        throw "failed to load wasm binary file at '" + wasmBinaryFile + "'";
      }
      return response['arrayBuffer']();
    }).catch(function () {
      return getBinary();
    });
  }
  // Otherwise, getBinary should be able to get it synchronously
  return new Promise(function(resolve, reject) {
    resolve(getBinary());
  });
}



// Create the wasm instance.
// Receives the wasm imports, returns the exports.
function createWasm() {
  // prepare imports
  var info = {
    'env': asmLibraryArg,
    'wasi_unstable': asmLibraryArg
  };
  // Load the wasm module and create an instance of using native support in the JS engine.
  // handle a generated wasm instance, receiving its exports and
  // performing other necessary setup
  function receiveInstance(instance, module) {
    var exports = instance.exports;
    Module['asm'] = exports;
    removeRunDependency('wasm-instantiate');
  }
   // we can't run yet (except in a pthread, where we have a custom sync instantiator)
  addRunDependency('wasm-instantiate');


  // Async compilation can be confusing when an error on the page overwrites Module
  // (for example, if the order of elements is wrong, and the one defining Module is
  // later), so we save Module and check it later.
  var trueModule = Module;
  function receiveInstantiatedSource(output) {
    // 'output' is a WebAssemblyInstantiatedSource object which has both the module and instance.
    // receiveInstance() will swap in the exports (to Module.asm) so they can be called
    assert(Module === trueModule, 'the Module object should not be replaced during async compilation - perhaps the order of HTML elements is wrong?');
    trueModule = null;
      // TODO: Due to Closure regression https://github.com/google/closure-compiler/issues/3193, the above line no longer optimizes out down to the following line.
      // When the regression is fixed, can restore the above USE_PTHREADS-enabled path.
    receiveInstance(output['instance']);
  }


  function instantiateArrayBuffer(receiver) {
    return getBinaryPromise().then(function(binary) {
      return WebAssembly.instantiate(binary, info);
    }).then(receiver, function(reason) {
      err('failed to asynchronously prepare wasm: ' + reason);
      abort(reason);
    });
  }

  // Prefer streaming instantiation if available.
  function instantiateAsync() {
    if (!wasmBinary &&
        typeof WebAssembly.instantiateStreaming === 'function' &&
        !isDataURI(wasmBinaryFile) &&
        typeof fetch === 'function') {
      fetch(wasmBinaryFile, { credentials: 'same-origin' }).then(function (response) {
        var result = WebAssembly.instantiateStreaming(response, info);
        return result.then(receiveInstantiatedSource, function(reason) {
            // We expect the most common failure cause to be a bad MIME type for the binary,
            // in which case falling back to ArrayBuffer instantiation should work.
            err('wasm streaming compile failed: ' + reason);
            err('falling back to ArrayBuffer instantiation');
            instantiateArrayBuffer(receiveInstantiatedSource);
          });
      });
    } else {
      return instantiateArrayBuffer(receiveInstantiatedSource);
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


// Globals used by JS i64 conversions
var tempDouble;
var tempI64;

// === Body ===

var ASM_CONSTS = {
  
};




// STATICTOP = STATIC_BASE + 8736;
/* global initializers */  __ATINIT__.push({ func: function() { ___wasm_call_ctors() } });



/* no memory initializer */
// {{PRE_LIBRARY}}


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
      var err = new Error();
      if (!err.stack) {
        // IE10+ special cases: It does have callstack info, but it is only populated if an Error object is thrown,
        // so try that as a special-case.
        try {
          throw new Error(0);
        } catch(e) {
          err = e;
        }
        if (!err.stack) {
          return '(no stack trace available)';
        }
      }
      return err.stack.toString();
    }

  function stackTrace() {
      var js = jsStackTrace();
      if (Module['extraStackTrace']) js += '\n' + Module['extraStackTrace']();
      return demangleAll(js);
    }

  function ___lock() {}

  function ___unlock() {}

  function _emscripten_get_heap_size() {
      return HEAP8.length;
    }

  function _emscripten_get_sbrk_ptr() {
      return 9600;
    }

  function _emscripten_memcpy_big(dest, src, num) {
      HEAPU8.set(HEAPU8.subarray(src, src+num), dest);
    }

  
  function abortOnCannotGrowMemory(requestedSize) {
      abort('Cannot enlarge memory arrays to size ' + requestedSize + ' bytes (OOM). Either (1) compile with  -s TOTAL_MEMORY=X  with X higher than the current value ' + HEAP8.length + ', (2) compile with  -s ALLOW_MEMORY_GROWTH=1  which allows increasing the size at runtime, or (3) if you want malloc to return NULL (0) instead of this abort, compile with  -s ABORTING_MALLOC=0 ');
    }
  
  function emscripten_realloc_buffer(size) {
      try {
        // round size grow request up to wasm page size (fixed 64KB per spec)
        wasmMemory.grow((size - buffer.byteLength + 65535) >> 16); // .grow() takes a delta compared to the previous size
        updateGlobalBufferAndViews(wasmMemory.buffer);
        return 1 /*success*/;
      } catch(e) {
        console.error('emscripten_realloc_buffer: Attempted to grow heap from ' + buffer.byteLength  + ' bytes to ' + size + ' bytes, but got error: ' + e);
      }
    }function _emscripten_resize_heap(requestedSize) {
      var oldSize = _emscripten_get_heap_size();
      // With pthreads, races can happen (another thread might increase the size in between), so return a failure, and let the caller retry.
      assert(requestedSize > oldSize);
  
  
      var PAGE_MULTIPLE = 65536;
      var LIMIT = 2147483648 - PAGE_MULTIPLE; // We can do one page short of 2GB as theoretical maximum.
  
      if (requestedSize > LIMIT) {
        err('Cannot enlarge memory, asked to go up to ' + requestedSize + ' bytes, but the limit is ' + LIMIT + ' bytes!');
        return false;
      }
  
      var MIN_TOTAL_MEMORY = 16777216;
      var newSize = Math.max(oldSize, MIN_TOTAL_MEMORY); // So the loop below will not be infinite, and minimum asm.js memory size is 16MB.
  
      // TODO: see realloc_buffer - for PTHREADS we may want to decrease these jumps
      while (newSize < requestedSize) { // Keep incrementing the heap size as long as it's less than what is requested.
        if (newSize <= 536870912) {
          newSize = alignUp(2 * newSize, PAGE_MULTIPLE); // Simple heuristic: double until 1GB...
        } else {
          // ..., but after that, add smaller increments towards 2GB, which we cannot reach
          newSize = Math.min(alignUp((3 * newSize + 2147483648) / 4, PAGE_MULTIPLE), LIMIT);
        }
  
        if (newSize === oldSize) {
          warnOnce('Cannot ask for more memory since we reached the practical limit in browsers (which is just below 2GB), so the request would have failed. Requesting only ' + HEAP8.length);
        }
      }
  
  
  
      var replacement = emscripten_realloc_buffer(newSize);
      if (!replacement) {
        err('Failed to grow the heap from ' + oldSize + ' bytes to ' + newSize + ' bytes, not enough memory!');
        return false;
      }
  
  
  
      return true;
    }

  function _exit(status) {
      // void _exit(int status);
      // http://pubs.opengroup.org/onlinepubs/000095399/functions/exit.html
      exit(status);
    }

  
  
  var PATH={splitPath:function(filename) {
        var splitPathRe = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
        return splitPathRe.exec(filename).slice(1);
      },normalizeArray:function(parts, allowAboveRoot) {
        // if the path tries to go above the root, `up` ends up > 0
        var up = 0;
        for (var i = parts.length - 1; i >= 0; i--) {
          var last = parts[i];
          if (last === '.') {
            parts.splice(i, 1);
          } else if (last === '..') {
            parts.splice(i, 1);
            up++;
          } else if (up) {
            parts.splice(i, 1);
            up--;
          }
        }
        // if the path is allowed to go above the root, restore leading ..s
        if (allowAboveRoot) {
          for (; up; up--) {
            parts.unshift('..');
          }
        }
        return parts;
      },normalize:function(path) {
        var isAbsolute = path.charAt(0) === '/',
            trailingSlash = path.substr(-1) === '/';
        // Normalize the path
        path = PATH.normalizeArray(path.split('/').filter(function(p) {
          return !!p;
        }), !isAbsolute).join('/');
        if (!path && !isAbsolute) {
          path = '.';
        }
        if (path && trailingSlash) {
          path += '/';
        }
        return (isAbsolute ? '/' : '') + path;
      },dirname:function(path) {
        var result = PATH.splitPath(path),
            root = result[0],
            dir = result[1];
        if (!root && !dir) {
          // No dirname whatsoever
          return '.';
        }
        if (dir) {
          // It has a dirname, strip trailing slash
          dir = dir.substr(0, dir.length - 1);
        }
        return root + dir;
      },basename:function(path) {
        // EMSCRIPTEN return '/'' for '/', not an empty string
        if (path === '/') return '/';
        var lastSlash = path.lastIndexOf('/');
        if (lastSlash === -1) return path;
        return path.substr(lastSlash+1);
      },extname:function(path) {
        return PATH.splitPath(path)[3];
      },join:function() {
        var paths = Array.prototype.slice.call(arguments, 0);
        return PATH.normalize(paths.join('/'));
      },join2:function(l, r) {
        return PATH.normalize(l + '/' + r);
      }};var SYSCALLS={buffers:[null,[],[]],printChar:function(stream, curr) {
        var buffer = SYSCALLS.buffers[stream];
        assert(buffer);
        if (curr === 0 || curr === 10) {
          (stream === 1 ? out : err)(UTF8ArrayToString(buffer, 0));
          buffer.length = 0;
        } else {
          buffer.push(curr);
        }
      },varargs:0,get:function(varargs) {
        SYSCALLS.varargs += 4;
        var ret = HEAP32[(((SYSCALLS.varargs)-(4))>>2)];
        return ret;
      },getStr:function() {
        var ret = UTF8ToString(SYSCALLS.get());
        return ret;
      },get64:function() {
        var low = SYSCALLS.get(), high = SYSCALLS.get();
        if (low >= 0) assert(high === 0);
        else assert(high === -1);
        return low;
      },getZero:function() {
        assert(SYSCALLS.get() === 0);
      }};function _fd_close(fd) {try {
  
      abort('it should not be possible to operate on streams when !SYSCALLS_REQUIRE_FILESYSTEM');
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return e.errno;
  }
  }

  function _fd_seek(fd, offset_low, offset_high, whence, newOffset) {try {
  
      abort('it should not be possible to operate on streams when !SYSCALLS_REQUIRE_FILESYSTEM');
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return e.errno;
  }
  }

  
  function flush_NO_FILESYSTEM() {
      // flush anything remaining in the buffers during shutdown
      var fflush = Module["_fflush"];
      if (fflush) fflush(0);
      var buffers = SYSCALLS.buffers;
      if (buffers[1].length) SYSCALLS.printChar(1, 10);
      if (buffers[2].length) SYSCALLS.printChar(2, 10);
    }function _fd_write(fd, iov, iovcnt, pnum) {try {
  
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
      HEAP32[((pnum)>>2)]=num
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return e.errno;
  }
  }

  
  function _memcpy(dest, src, num) {
      dest = dest|0; src = src|0; num = num|0;
      var ret = 0;
      var aligned_dest_end = 0;
      var block_aligned_dest_end = 0;
      var dest_end = 0;
      // Test against a benchmarked cutoff limit for when HEAPU8.set() becomes faster to use.
      if ((num|0) >= 8192) {
        _emscripten_memcpy_big(dest|0, src|0, num|0)|0;
        return dest|0;
      }
  
      ret = dest|0;
      dest_end = (dest + num)|0;
      if ((dest&3) == (src&3)) {
        // The initial unaligned < 4-byte front.
        while (dest & 3) {
          if ((num|0) == 0) return ret|0;
          HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
          dest = (dest+1)|0;
          src = (src+1)|0;
          num = (num-1)|0;
        }
        aligned_dest_end = (dest_end & -4)|0;
        block_aligned_dest_end = (aligned_dest_end - 64)|0;
        while ((dest|0) <= (block_aligned_dest_end|0) ) {
          HEAP32[((dest)>>2)]=((HEAP32[((src)>>2)])|0);
          HEAP32[(((dest)+(4))>>2)]=((HEAP32[(((src)+(4))>>2)])|0);
          HEAP32[(((dest)+(8))>>2)]=((HEAP32[(((src)+(8))>>2)])|0);
          HEAP32[(((dest)+(12))>>2)]=((HEAP32[(((src)+(12))>>2)])|0);
          HEAP32[(((dest)+(16))>>2)]=((HEAP32[(((src)+(16))>>2)])|0);
          HEAP32[(((dest)+(20))>>2)]=((HEAP32[(((src)+(20))>>2)])|0);
          HEAP32[(((dest)+(24))>>2)]=((HEAP32[(((src)+(24))>>2)])|0);
          HEAP32[(((dest)+(28))>>2)]=((HEAP32[(((src)+(28))>>2)])|0);
          HEAP32[(((dest)+(32))>>2)]=((HEAP32[(((src)+(32))>>2)])|0);
          HEAP32[(((dest)+(36))>>2)]=((HEAP32[(((src)+(36))>>2)])|0);
          HEAP32[(((dest)+(40))>>2)]=((HEAP32[(((src)+(40))>>2)])|0);
          HEAP32[(((dest)+(44))>>2)]=((HEAP32[(((src)+(44))>>2)])|0);
          HEAP32[(((dest)+(48))>>2)]=((HEAP32[(((src)+(48))>>2)])|0);
          HEAP32[(((dest)+(52))>>2)]=((HEAP32[(((src)+(52))>>2)])|0);
          HEAP32[(((dest)+(56))>>2)]=((HEAP32[(((src)+(56))>>2)])|0);
          HEAP32[(((dest)+(60))>>2)]=((HEAP32[(((src)+(60))>>2)])|0);
          dest = (dest+64)|0;
          src = (src+64)|0;
        }
        while ((dest|0) < (aligned_dest_end|0) ) {
          HEAP32[((dest)>>2)]=((HEAP32[((src)>>2)])|0);
          dest = (dest+4)|0;
          src = (src+4)|0;
        }
      } else {
        // In the unaligned copy case, unroll a bit as well.
        aligned_dest_end = (dest_end - 4)|0;
        while ((dest|0) < (aligned_dest_end|0) ) {
          HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
          HEAP8[(((dest)+(1))>>0)]=((HEAP8[(((src)+(1))>>0)])|0);
          HEAP8[(((dest)+(2))>>0)]=((HEAP8[(((src)+(2))>>0)])|0);
          HEAP8[(((dest)+(3))>>0)]=((HEAP8[(((src)+(3))>>0)])|0);
          dest = (dest+4)|0;
          src = (src+4)|0;
        }
      }
      // The remaining unaligned < 4 byte tail.
      while ((dest|0) < (dest_end|0)) {
        HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
        dest = (dest+1)|0;
        src = (src+1)|0;
      }
      return ret|0;
    }

  function _memset(ptr, value, num) {
      ptr = ptr|0; value = value|0; num = num|0;
      var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
      end = (ptr + num)|0;
  
      value = value & 0xff;
      if ((num|0) >= 67 /* 64 bytes for an unrolled loop + 3 bytes for unaligned head*/) {
        while ((ptr&3) != 0) {
          HEAP8[((ptr)>>0)]=value;
          ptr = (ptr+1)|0;
        }
  
        aligned_end = (end & -4)|0;
        value4 = value | (value << 8) | (value << 16) | (value << 24);
  
        block_aligned_end = (aligned_end - 64)|0;
  
        while((ptr|0) <= (block_aligned_end|0)) {
          HEAP32[((ptr)>>2)]=value4;
          HEAP32[(((ptr)+(4))>>2)]=value4;
          HEAP32[(((ptr)+(8))>>2)]=value4;
          HEAP32[(((ptr)+(12))>>2)]=value4;
          HEAP32[(((ptr)+(16))>>2)]=value4;
          HEAP32[(((ptr)+(20))>>2)]=value4;
          HEAP32[(((ptr)+(24))>>2)]=value4;
          HEAP32[(((ptr)+(28))>>2)]=value4;
          HEAP32[(((ptr)+(32))>>2)]=value4;
          HEAP32[(((ptr)+(36))>>2)]=value4;
          HEAP32[(((ptr)+(40))>>2)]=value4;
          HEAP32[(((ptr)+(44))>>2)]=value4;
          HEAP32[(((ptr)+(48))>>2)]=value4;
          HEAP32[(((ptr)+(52))>>2)]=value4;
          HEAP32[(((ptr)+(56))>>2)]=value4;
          HEAP32[(((ptr)+(60))>>2)]=value4;
          ptr = (ptr + 64)|0;
        }
  
        while ((ptr|0) < (aligned_end|0) ) {
          HEAP32[((ptr)>>2)]=value4;
          ptr = (ptr+4)|0;
        }
      }
      // The remaining bytes.
      while ((ptr|0) < (end|0)) {
        HEAP8[((ptr)>>0)]=value;
        ptr = (ptr+1)|0;
      }
      return (end-num)|0;
    }

  function _setTempRet0($i) {
      setTempRet0(($i) | 0);
    }
var ASSERTIONS = true;

// Copyright 2017 The Emscripten Authors.  All rights reserved.
// Emscripten is available under two separate licenses, the MIT license and the
// University of Illinois/NCSA Open Source License.  Both these licenses can be
// found in the LICENSE file.

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
 * @param {String} input The string to decode.
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
      buf = Buffer.from(s, 'base64');
    } catch (_) {
      buf = new Buffer(s, 'base64');
    }
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
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


// ASM_LIBRARY EXTERN PRIMITIVES: Int8Array,Int32Array

var asmGlobalArg = {};
var asmLibraryArg = { "__lock": ___lock, "__unlock": ___unlock, "emscripten_get_sbrk_ptr": _emscripten_get_sbrk_ptr, "emscripten_memcpy_big": _emscripten_memcpy_big, "emscripten_resize_heap": _emscripten_resize_heap, "exit": _exit, "fd_close": _fd_close, "fd_seek": _fd_seek, "fd_write": _fd_write, "memory": wasmMemory, "setTempRet0": _setTempRet0, "table": wasmTable };
var asm = createWasm();
var real____wasm_call_ctors = asm["__wasm_call_ctors"];
asm["__wasm_call_ctors"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____wasm_call_ctors.apply(null, arguments);
};

var real__fflush = asm["fflush"];
asm["fflush"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__fflush.apply(null, arguments);
};

var real__free = asm["free"];
asm["free"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__free.apply(null, arguments);
};

var real____errno_location = asm["__errno_location"];
asm["__errno_location"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____errno_location.apply(null, arguments);
};

var real__malloc = asm["malloc"];
asm["malloc"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__malloc.apply(null, arguments);
};

var real__start = asm["start"];
asm["start"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__start.apply(null, arguments);
};

var real__setThrew = asm["setThrew"];
asm["setThrew"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__setThrew.apply(null, arguments);
};

var real_stackSave = asm["stackSave"];
asm["stackSave"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_stackSave.apply(null, arguments);
};

var real_stackAlloc = asm["stackAlloc"];
asm["stackAlloc"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_stackAlloc.apply(null, arguments);
};

var real_stackRestore = asm["stackRestore"];
asm["stackRestore"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_stackRestore.apply(null, arguments);
};

var real___growWasmMemory = asm["__growWasmMemory"];
asm["__growWasmMemory"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real___growWasmMemory.apply(null, arguments);
};

var real_dynCall_jiji = asm["dynCall_jiji"];
asm["dynCall_jiji"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_dynCall_jiji.apply(null, arguments);
};

var real_dynCall_iiii = asm["dynCall_iiii"];
asm["dynCall_iiii"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_dynCall_iiii.apply(null, arguments);
};

var real_dynCall_ii = asm["dynCall_ii"];
asm["dynCall_ii"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_dynCall_ii.apply(null, arguments);
};

var real_dynCall_iidiiii = asm["dynCall_iidiiii"];
asm["dynCall_iidiiii"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_dynCall_iidiiii.apply(null, arguments);
};

var real_dynCall_vii = asm["dynCall_vii"];
asm["dynCall_vii"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_dynCall_vii.apply(null, arguments);
};

Module["asm"] = asm;
var ___wasm_call_ctors = Module["___wasm_call_ctors"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return Module["asm"]["__wasm_call_ctors"].apply(null, arguments)
};

var _fflush = Module["_fflush"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return Module["asm"]["fflush"].apply(null, arguments)
};

var _free = Module["_free"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return Module["asm"]["free"].apply(null, arguments)
};

var ___errno_location = Module["___errno_location"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return Module["asm"]["__errno_location"].apply(null, arguments)
};

var _malloc = Module["_malloc"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return Module["asm"]["malloc"].apply(null, arguments)
};

var _start = Module["_start"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return Module["asm"]["start"].apply(null, arguments)
};

var _setThrew = Module["_setThrew"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return Module["asm"]["setThrew"].apply(null, arguments)
};

var stackSave = Module["stackSave"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return Module["asm"]["stackSave"].apply(null, arguments)
};

var stackAlloc = Module["stackAlloc"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return Module["asm"]["stackAlloc"].apply(null, arguments)
};

var stackRestore = Module["stackRestore"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return Module["asm"]["stackRestore"].apply(null, arguments)
};

var __growWasmMemory = Module["__growWasmMemory"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return Module["asm"]["__growWasmMemory"].apply(null, arguments)
};

var dynCall_jiji = Module["dynCall_jiji"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return Module["asm"]["dynCall_jiji"].apply(null, arguments)
};

var dynCall_iiii = Module["dynCall_iiii"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return Module["asm"]["dynCall_iiii"].apply(null, arguments)
};

var dynCall_ii = Module["dynCall_ii"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return Module["asm"]["dynCall_ii"].apply(null, arguments)
};

var dynCall_iidiiii = Module["dynCall_iidiiii"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return Module["asm"]["dynCall_iidiiii"].apply(null, arguments)
};

var dynCall_vii = Module["dynCall_vii"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return Module["asm"]["dynCall_vii"].apply(null, arguments)
};




// === Auto-generated postamble setup entry stuff ===

Module['asm'] = asm;

if (!Object.getOwnPropertyDescriptor(Module, "intArrayFromString")) Module["intArrayFromString"] = function() { abort("'intArrayFromString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "intArrayToString")) Module["intArrayToString"] = function() { abort("'intArrayToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "ccall")) Module["ccall"] = function() { abort("'ccall' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "cwrap")) Module["cwrap"] = function() { abort("'cwrap' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "setValue")) Module["setValue"] = function() { abort("'setValue' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "getValue")) Module["getValue"] = function() { abort("'getValue' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "allocate")) Module["allocate"] = function() { abort("'allocate' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "getMemory")) Module["getMemory"] = function() { abort("'getMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Object.getOwnPropertyDescriptor(Module, "AsciiToString")) Module["AsciiToString"] = function() { abort("'AsciiToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "stringToAscii")) Module["stringToAscii"] = function() { abort("'stringToAscii' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "UTF8ArrayToString")) Module["UTF8ArrayToString"] = function() { abort("'UTF8ArrayToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "UTF8ToString")) Module["UTF8ToString"] = function() { abort("'UTF8ToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "stringToUTF8Array")) Module["stringToUTF8Array"] = function() { abort("'stringToUTF8Array' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "stringToUTF8")) Module["stringToUTF8"] = function() { abort("'stringToUTF8' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "lengthBytesUTF8")) Module["lengthBytesUTF8"] = function() { abort("'lengthBytesUTF8' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "UTF16ToString")) Module["UTF16ToString"] = function() { abort("'UTF16ToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "stringToUTF16")) Module["stringToUTF16"] = function() { abort("'stringToUTF16' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "lengthBytesUTF16")) Module["lengthBytesUTF16"] = function() { abort("'lengthBytesUTF16' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "UTF32ToString")) Module["UTF32ToString"] = function() { abort("'UTF32ToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "stringToUTF32")) Module["stringToUTF32"] = function() { abort("'stringToUTF32' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "lengthBytesUTF32")) Module["lengthBytesUTF32"] = function() { abort("'lengthBytesUTF32' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "allocateUTF8")) Module["allocateUTF8"] = function() { abort("'allocateUTF8' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "stackTrace")) Module["stackTrace"] = function() { abort("'stackTrace' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "addOnPreRun")) Module["addOnPreRun"] = function() { abort("'addOnPreRun' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "addOnInit")) Module["addOnInit"] = function() { abort("'addOnInit' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "addOnPreMain")) Module["addOnPreMain"] = function() { abort("'addOnPreMain' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "addOnExit")) Module["addOnExit"] = function() { abort("'addOnExit' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "addOnPostRun")) Module["addOnPostRun"] = function() { abort("'addOnPostRun' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "writeStringToMemory")) Module["writeStringToMemory"] = function() { abort("'writeStringToMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "writeArrayToMemory")) Module["writeArrayToMemory"] = function() { abort("'writeArrayToMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "writeAsciiToMemory")) Module["writeAsciiToMemory"] = function() { abort("'writeAsciiToMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "addRunDependency")) Module["addRunDependency"] = function() { abort("'addRunDependency' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Object.getOwnPropertyDescriptor(Module, "removeRunDependency")) Module["removeRunDependency"] = function() { abort("'removeRunDependency' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Object.getOwnPropertyDescriptor(Module, "ENV")) Module["ENV"] = function() { abort("'ENV' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "FS")) Module["FS"] = function() { abort("'FS' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "FS_createFolder")) Module["FS_createFolder"] = function() { abort("'FS_createFolder' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Object.getOwnPropertyDescriptor(Module, "FS_createPath")) Module["FS_createPath"] = function() { abort("'FS_createPath' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Object.getOwnPropertyDescriptor(Module, "FS_createDataFile")) Module["FS_createDataFile"] = function() { abort("'FS_createDataFile' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Object.getOwnPropertyDescriptor(Module, "FS_createPreloadedFile")) Module["FS_createPreloadedFile"] = function() { abort("'FS_createPreloadedFile' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Object.getOwnPropertyDescriptor(Module, "FS_createLazyFile")) Module["FS_createLazyFile"] = function() { abort("'FS_createLazyFile' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Object.getOwnPropertyDescriptor(Module, "FS_createLink")) Module["FS_createLink"] = function() { abort("'FS_createLink' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Object.getOwnPropertyDescriptor(Module, "FS_createDevice")) Module["FS_createDevice"] = function() { abort("'FS_createDevice' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Object.getOwnPropertyDescriptor(Module, "FS_unlink")) Module["FS_unlink"] = function() { abort("'FS_unlink' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Object.getOwnPropertyDescriptor(Module, "GL")) Module["GL"] = function() { abort("'GL' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "dynamicAlloc")) Module["dynamicAlloc"] = function() { abort("'dynamicAlloc' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "loadDynamicLibrary")) Module["loadDynamicLibrary"] = function() { abort("'loadDynamicLibrary' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "loadWebAssemblyModule")) Module["loadWebAssemblyModule"] = function() { abort("'loadWebAssemblyModule' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "getLEB")) Module["getLEB"] = function() { abort("'getLEB' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "getFunctionTables")) Module["getFunctionTables"] = function() { abort("'getFunctionTables' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "alignFunctionTables")) Module["alignFunctionTables"] = function() { abort("'alignFunctionTables' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "registerFunctions")) Module["registerFunctions"] = function() { abort("'registerFunctions' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "addFunction")) Module["addFunction"] = function() { abort("'addFunction' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "removeFunction")) Module["removeFunction"] = function() { abort("'removeFunction' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "getFuncWrapper")) Module["getFuncWrapper"] = function() { abort("'getFuncWrapper' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "prettyPrint")) Module["prettyPrint"] = function() { abort("'prettyPrint' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "makeBigInt")) Module["makeBigInt"] = function() { abort("'makeBigInt' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "dynCall")) Module["dynCall"] = function() { abort("'dynCall' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "getCompilerSetting")) Module["getCompilerSetting"] = function() { abort("'getCompilerSetting' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "stackSave")) Module["stackSave"] = function() { abort("'stackSave' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "stackRestore")) Module["stackRestore"] = function() { abort("'stackRestore' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "stackAlloc")) Module["stackAlloc"] = function() { abort("'stackAlloc' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "establishStackSpace")) Module["establishStackSpace"] = function() { abort("'establishStackSpace' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "print")) Module["print"] = function() { abort("'print' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "printErr")) Module["printErr"] = function() { abort("'printErr' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "getTempRet0")) Module["getTempRet0"] = function() { abort("'getTempRet0' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "setTempRet0")) Module["setTempRet0"] = function() { abort("'setTempRet0' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "callMain")) Module["callMain"] = function() { abort("'callMain' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "abort")) Module["abort"] = function() { abort("'abort' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "Pointer_stringify")) Module["Pointer_stringify"] = function() { abort("'Pointer_stringify' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "warnOnce")) Module["warnOnce"] = function() { abort("'warnOnce' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
Module["writeStackCookie"] = writeStackCookie;
Module["checkStackCookie"] = checkStackCookie;
Module["abortStackOverflow"] = abortStackOverflow;
if (!Object.getOwnPropertyDescriptor(Module, "intArrayFromBase64")) Module["intArrayFromBase64"] = function() { abort("'intArrayFromBase64' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Object.getOwnPropertyDescriptor(Module, "tryParseAsDataURI")) Module["tryParseAsDataURI"] = function() { abort("'tryParseAsDataURI' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };if (!Object.getOwnPropertyDescriptor(Module, "ALLOC_NORMAL")) Object.defineProperty(Module, "ALLOC_NORMAL", { configurable: true, get: function() { abort("'ALLOC_NORMAL' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Object.getOwnPropertyDescriptor(Module, "ALLOC_STACK")) Object.defineProperty(Module, "ALLOC_STACK", { configurable: true, get: function() { abort("'ALLOC_STACK' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Object.getOwnPropertyDescriptor(Module, "ALLOC_DYNAMIC")) Object.defineProperty(Module, "ALLOC_DYNAMIC", { configurable: true, get: function() { abort("'ALLOC_DYNAMIC' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Object.getOwnPropertyDescriptor(Module, "ALLOC_NONE")) Object.defineProperty(Module, "ALLOC_NONE", { configurable: true, get: function() { abort("'ALLOC_NONE' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Object.getOwnPropertyDescriptor(Module, "calledRun")) Object.defineProperty(Module, "calledRun", { configurable: true, get: function() { abort("'calledRun' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") } });



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





/** @type {function(Array=)} */
function run(args) {
  args = args || arguments_;

  if (runDependencies > 0) {
    return;
  }

  writeStackCookie();

  preRun();

  if (runDependencies > 0) return; // a preRun added a dependency, run will be called later

  function doRun() {
    // run may have just been called through dependencies being fulfilled just in this very frame,
    // or while the async setStatus time below was happening
    if (calledRun) return;
    calledRun = true;

    if (ABORT) return;

    initRuntime();

    preMain();

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
  var print = out;
  var printErr = err;
  var has = false;
  out = err = function(x) {
    has = true;
  }
  try { // it doesn't matter if it fails
    var flush = flush_NO_FILESYSTEM;
    if (flush) flush(0);
  } catch(e) {}
  out = print;
  err = printErr;
  if (has) {
    warnOnce('stdio streams had content in them that was not flushed. you should set EXIT_RUNTIME to 1 (see the FAQ), or make sure to emit a newline when you printf etc.');
    warnOnce('(this may also be due to not including full filesystem support - try building with -s FORCE_FILESYSTEM=1)');
  }
}

function exit(status, implicit) {
  checkUnflushedContent();

  // if this is just main exit-ing implicitly, and the status is 0, then we
  // don't need to do anything here and can just leave. if the status is
  // non-zero, though, then we need to report it.
  // (we may have warned about this earlier, if a situation justifies doing so)
  if (implicit && noExitRuntime && status === 0) {
    return;
  }

  if (noExitRuntime) {
    // if exit() was called, we may warn the user if the runtime isn't actually being shut down
    if (!implicit) {
      err('program exited (with status: ' + status + '), but EXIT_RUNTIME is not set, so halting execution but not exiting the runtime or preventing further async execution (build with EXIT_RUNTIME=1, if you want a true shutdown)');
    }
  } else {

    ABORT = true;
    EXITSTATUS = status;

    exitRuntime();

    if (Module['onExit']) Module['onExit'](status);
  }

  quit_(status, new ExitStatus(status));
}

if (Module['preInit']) {
  if (typeof Module['preInit'] == 'function') Module['preInit'] = [Module['preInit']];
  while (Module['preInit'].length > 0) {
    Module['preInit'].pop()();
  }
}


  noExitRuntime = true;

run();





// {{MODULE_ADDITIONS}}



/**
 * This file will be inserted to generated output when building the library.
 */

/**
 * @param colorFilter return true if given pixel will be traced.
 * @param transform whether add the <transform /> tag to reduce generated svg length.
 * @param pathonly only returns concated path data.
 */
const defaultConfig = {
  colorFilter: (r, g, b, a) => a && 0.2126 * r + 0.7152 * g + 0.0722 * b < 128,
  transform: true,
  pathonly: false
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
  return new Promise(resolve => {
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
 */
async function loadFromImageData(imagedata, width, height, config) {
  let start = wrapStart();
  let data = new Array(Math.ceil(imagedata.length / 32)).fill(0);
  let c = buildConfig(config);

  for (i = 0; i < imagedata.length; i += 4) {
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
  return start(data, width, height, c.transform, c.pathonly);
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
    "number" // pathonly
  ]);
}

// export the functions in server env.
if (typeof module !== "undefined") {
  module.exports = { loadFromCanvas, loadFromImageData };
}

