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
    STACK_BASE = 5252608,
    STACKTOP = STACK_BASE,
    STACK_MAX = 9728,
    DYNAMIC_BASE = 5252608,
    DYNAMICTOP_PTR = 9568;

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




var wasmBinaryFile = 'data:application/octet-stream;base64,AGFzbQEAAAAB+gEjYAF/AX9gAn9/AX9gA39/fwF/YAF/AGACf38AYAABf2ADf39/AGAEf39/fwF/YAV/f39/fwF/YAN/fn8BfmAEf39/fwBgBX9/f39/AGAGf3x/f39/AX9gAn9/AXxgA39/fwF8YAAAYAR/fn5/AGADf3x8AGACfn8Bf2AEf39/fwF8YAJ/fABgBH98f38AYAZ/fH9/f38AYAZ/f39/f38Bf2AHf39/f39/fwF/YAd/f39/fH9/AX9gB39/fH9/f38Bf2AEf35/fwF/YAJ/fAF/YAN+f38Bf2AEf39+fwF+YAF8AX5gBn9/f39/fwF8YAJ+fgF8YAJ8fwF8AtoBCwNlbnYEZXhpdAADA2VudgZfX2xvY2sAAwNlbnYIX191bmxvY2sAAw13YXNpX3Vuc3RhYmxlCGZkX2Nsb3NlAAANd2FzaV91bnN0YWJsZQhmZF93cml0ZQAHA2VudhZlbXNjcmlwdGVuX3Jlc2l6ZV9oZWFwAAADZW52FWVtc2NyaXB0ZW5fbWVtY3B5X2JpZwACA2VudgtzZXRUZW1wUmV0MAADDXdhc2lfdW5zdGFibGUHZmRfc2VlawAIA2VudgZtZW1vcnkCAIACA2VudgV0YWJsZQFwAAoDlwGVAQUPBwoHBgYGCwQEBgUDAwMBBAIAAwIIBAQDAQECCgQEBAABABcBAwQBAAEDAQAAAAADFBwBAQIBDgsNFQ0OGQYNExMgFg4REQUBAAUBAQUAAwMAAAACBQ8AAQkCAAAAAgkAAgUBIgACCBgGAAoLEh0SAgwEHwcCAgIBAQAAEBAhAAMBAQEEAAICBAUAAwAeBwEaBggbBhACfwFB4MrAAgt/AEHUygALB/MBERFfX3dhc21fY2FsbF9jdG9ycwAKBmZmbHVzaABcBGZyZWUAigEQX19lcnJub19sb2NhdGlvbgBRBm1hbGxvYwCJAQVzdGFydAAtCHNldFRocmV3AJIBCl9fZGF0YV9lbmQDAQlzdGFja1NhdmUAkwEKc3RhY2tBbGxvYwCUAQxzdGFja1Jlc3RvcmUAlQEQX19ncm93V2FzbU1lbW9yeQCWAQxkeW5DYWxsX2ppamkAnAEMZHluQ2FsbF9paWlpAJgBCmR5bkNhbGxfaWkAmQEPZHluQ2FsbF9paWRpaWlpAJoBC2R5bkNhbGxfdmlpAJsB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/AFqIf0BIP0BIf4BINEBIPsBaiH/AUECIYACIP8BIIACbSGBAiADIIECNgLMASADKALMASGCAkECIYMCIIICIIMCdCGEAiD+ASCEAmohhQIghQIoAgAhhgJBASGHAiCGAiCHAmohiAIghQIgiAI2AgAgAygC0AEhiQICQCCJAkUNACADKALUASGKAiCKAkUNACADKALYASGLAiCLAkUNACADKALcASGMAiCMAkUNACADKALgASGNAiADKAKcASGOAiADKALsASGPAkECIZACII8CIJACdCGRAiCOAiCRAmohkgIgkgIgjQI2AgAMAwtBsAEhkwIgAyCTAmohlAIglAIhlQIgAygC9AEhlgIgAygC5AEhlwJBAyGYAiCXAiCYAnQhmQIglgIgmQJqIZoCIJoCKAIAIZsCIAMoAvQBIZwCIAMoAuwBIZ0CQQMhngIgnQIgngJ0IZ8CIJwCIJ8CaiGgAiCgAigCACGhAiCbAiChAmshogIgAyCiAjYCqAEgAygC9AEhowIgAygC5AEhpAJBAyGlAiCkAiClAnQhpgIgowIgpgJqIacCIKcCKAIEIagCIAMoAvQBIakCIAMoAuwBIaoCQQMhqwIgqgIgqwJ0IawCIKkCIKwCaiGtAiCtAigCBCGuAiCoAiCuAmshrwIgAyCvAjYCrAEglQIpAgAhyAYgAyDIBjcDeCADKQOoASHJBiADIMkGNwNwQfgAIbACIAMgsAJqIbECQfAAIbICIAMgsgJqIbMCILECILMCED4htAJBACG1AiC0AiG2AiC1AiG3AiC2AiC3AkghuAJBASG5AiC4AiC5AnEhugICQAJAILoCDQBBsAEhuwIgAyC7AmohvAIgvAIhvQJBCCG+AiC9AiC+AmohvwIgvwIpAgAhygYgAyDKBjcDaCADKQOoASHLBiADIMsGNwNgQegAIcACIAMgwAJqIcECQeAAIcICIAMgwgJqIcMCIMECIMMCED4hxAJBACHFAiDEAiHGAiDFAiHHAiDGAiDHAkohyAJBASHJAiDIAiDJAnEhygIgygJFDQELDAILQQAhywIgAygCqAEhzAIgzAIhzQIgywIhzgIgzQIgzgJKIc8CQQEh0AIgzwIg0AJxIdECAkACQCDRAkUNACADKAKoASHSAiDSAiHTAgwBC0EAIdQCIAMoAqgBIdUCINQCINUCayHWAiDW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IOsKIOwKoSHtCiAJKwPQCiHuCiAJKwPICiHvCiDuCiDvCqEh8Aog7Qog8AqiIfEKIAkoApwLIckIIMkIKwMAIfIKIPIKIPEKoCHzCiDJCCDzCjkDAAsgCSgC/AohygggCSDKCDYCgAsMAAALAAtBACHLCCAJIMsINgKsCwsgCSgCrAshzAhBsAshzQggCSDNCGohzgggzggkACDMCA8LtAICHH8QfEEAIQMgA7chHyACKwMAISAgASsDACEhICAgIaEhIiAiIB9kIQRBASEFIAQgBXEhBgJAAkAgBkUNAEEBIQcgByEIDAELQX8hCUEAIQogCrchIyACKwMAISQgASsDACElICQgJaEhJiAmICNjIQtBASEMIAsgDHEhDSAJIAogDRshDiAOIQgLIAghD0EAIRAgELchJyAAIA82AgQgAisDCCEoIAErAwghKSAoICmhISogKiAnZCERQQEhEiARIBJxIRMCQAJAIBNFDQBBASEUIBQhFQwBC0F/IRZBACEXIBe3ISsgAisDCCEsIAErAwghLSAsIC2hIS4gLiArYyEYQQEhGSAYIBlxIRogFiAXIBobIRsgGyEVCyAVIRxBACEdIB0gHGshHiAAIB42AgAPC3UBEHwgACsDACECIAErAwAhAyACIAOhIQQgACsDACEFIAErAwAhBiAFIAahIQcgBCAHoiEIIAArAwghCSABKwMIIQogCSAKoSELIAArAwghDCABKwMIIQ0gDCANoSEOIAsgDqIhDyAIIA+gIRAgEJ8hESARDwu5AQIDfxN8IwAhBEEgIQUgBCAFayEGIAErAwAhByAAKwMAIQggByAIoSEJIAYgCTkDGCABKwMIIQogACsDCCELIAogC6EhDCAGIAw5AxAgAysDACENIAIrAwAhDiANIA6hIQ8gBiAPOQMIIAMrAwghECACKwMIIREgECARoSESIAYgEjkDACAGKwMYIRMgBisDACEUIBMgFKIhFSAGKwMIIRYgBisDECEXIBYgF6IhGCAVIBihIRkgGQ8LuQECA38TfCMAIQRBICEFIAQgBWshBiABKwMAIQcgACsDACEIIAcgCKEhCSAGIAk5AxggASsDCCEKIAArAwghCyAKIAuhIQwgBiAMOQMQIAMrAwAhDSACKwMAIQ4gDSAOoSEPIAYgDzkDCCADKwMIIRAgAisDCCERIBAgEaEhEiAGIBI5AwAgBisDGCETIAYrAwghFCATIBSiIRUgBisDECEWIAYrAwAhFyAWIBeiIRggFSAYoCEZIBkPC84NA2Z/GH48fCMAIQZBoAIhByAGIAdrIQggCCQAQQghCSAAIAlqIQogCikDACFsQTghCyAIIAtqIQwgDCAJaiENIA0gbDcDACAAKQMAIW0gCCBtNwM4IAEgCWohDiAOKQMAIW5BKCEPIAggD2ohECAQIAlqIREgESBuNwMAIAEpAwAhbyAIIG83AyggBCAJaiESIBIpAwAhcEEYIRMgCCATaiEUIBQgCWohFSAVIHA3AwAgBCkDACFxIAggcTcDGCAFIAlqIRYgFikDACFyQQghFyAIIBdqIRggGCAJaiEZIBkgcjcDACAFKQMAIXMgCCBzNwMIQTghGiAIIBpqIRtBKCEcIAggHGohHUEYIR4gCCAeaiEfQQghICAIICBqISEgGyAdIB8gIRBKIYQBIAgghAE5A5ACQQghIiABICJqISMgIykDACF0QfgAISQgCCAkaiElICUgImohJiAmIHQ3AwAgASkDACF1IAggdTcDeCACICJqIScgJykDACF2QegAISggCCAoaiEpICkgImohKiAqIHY3AwAgAikDACF3IAggdzcDaCAEICJqISsgKykDACF4QdgAISwgCCAsaiEtIC0gImohLiAuIHg3AwAgBCkDACF5IAggeTcDWCAFICJqIS8gLykDACF6QcgAITAgCCAwaiExIDEgImohMiAyIHo3AwAgBSkDACF7IAggezcDSEH4ACEzIAggM2ohNEHoACE1IAggNWohNkHYACE3IAggN2ohOEHIACE5IAggOWohOiA0IDYgOCA6EEohhQEgCCCFATkDiAJBCCE7IAIgO2ohPCA8KQMAIXxBuAEhPSAIID1qIT4gPiA7aiE/ID8gfDcDACACKQMAIX0gCCB9NwO4ASADIDtqIUAgQCkDACF+QagBIUEgCCBBaiFCIEIgO2ohQyBDIH43AwAgAykDACF/IAggfzcDqAEgBCA7aiFEIEQpAwAhgAFBmAEhRSAIIEVqIUYgRiA7aiFHIEcggAE3AwAgBCkDACGBASAIIIEBNwOYASAFIDtqIUggSCkDACGCAUGIASFJIAggSWohSiBKIDtqIUsgSyCCATcDACAFKQMAIYMBIAgggwE3A4gBQbgBIUwg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SA0AIAAQWCEBCyAAEFoCQCAAKAIAQQFxIgINABBfIQMCQCAAKAI0IgRFDQAgBCAAKAI4NgI4CwJAIAAoAjgiBUUNACAFIAQ2AjQLAkAgAygCACAARw0AIAMgBTYCAAsQYAsgABBcIQMgACAAKAIMEQAAIQQCQCAAKAJgIgVFDQAgBRCKAQsgBCADciEDAkAgAg0AIAAQigEgAw8LAkAgAUUNACAAEFkLIAMLrAEBAn8CQAJAIABFDQACQCAAKAJMQX9KDQAgABBdDwsgABBYIQEgABBdIQIgAUUNASAAEFkgAg8LQQAhAgJAQQAoAsRGRQ0AQQAoAsRGEFwhAgsCQBBfKAIAIgBFDQADQEEAIQECQCAAKAJMQQBIDQAgABBYIQELAkAgACgCFCAAKAIcTQ0AIAAQXSACciECCwJAIAFFDQAgABBZCyAAKAI4IgANAAsLEGALIAILawECfwJAIAAoAhQgACgCHE0NACAAQQBBACAAKAIkEQIAGiAAKAIUDQBBfw8LAkAgACgCBCIBIAAoAggiAk8NACAAIAEgAmusQQEgACgCKBEJABoLIABBADYCHCAAQgA3AxAgAEIANwIEQQALJwEBfyMAQRBrIgMkACADIAI2AgwgACABIAIQeiECIANBEGokACACCwwAQcjGABABQdDGAAsIAEHIxgAQAgsvAQJ/IAAQXyIBKAIANgI4AkAgASgCACICRQ0AIAIgADYCNAsgASAANgIAEGAgAAvVAQECf0EAIQICQEGoCRCJASIDRQ0AAkBBARCJASICDQAgAxCKAUEADwsgA0EAQagBEJEBGiADIAE2ApQBIAMgADYCkAEgAyADQZABajYCVCABQQA2AgAgA0IANwKgASADQQA2ApgBIAAgAjYCACADIAI2ApwBIAJBADoAACADQX82AjwgA0EENgIAIANB/wE6AEsgA0GACDYCMCADIANBqAFqNgIsIANBATYCKCADQQI2AiQgA0EDNgIMAkBBACgCiEYNACADQX82AkwLIAMQYSECCyACC4wBAQF/IwBBEGsiAyQAAkACQCACQQNPDQAgACgCVCEAIANBADYCBCADIAAoAgg2AgggAyAAKAIQNgIMQQAgA0EEaiACQQJ0aigCACICa6wgAVUNAEH/////ByACa6wgAVMNACAAIAIgAadqIgI2AgggAq0hAQwBCxBRQRw2AgBCfyEBCyADQRBqJAAgAQvwAQEEfyAAKAJUIQMCQAJAIAAoAhQgACgCHCIEayIFRQ0AIAAgBDYCFEEAIQYgACAEIAUQZCAFSQ0BCwJAIAMoAggiACACaiIEIAMoAhQiBUkNAAJAIAMoAgwgBEEBaiAFQQF0ckEBciIAEIwBIgQNAEEADwsgAyAENgIMIAMoAgAgBDYCACADKAIMIAMoAhQiBGpBACAAIARrEJEBGiADIAA2AhQgAygCCCEACyADKAIMIABqIAEgAhCQARogAyADKAIIIAJqIgA2AggCQCAAIAMoAhBJDQAgAyAANgIQCyADKAIEIAA2AgAgAiEGCyAGCwQAQQALBAAgAAsLACAAKAI8EGYQAwu+AgEGfyMAQSBrIgMkACADIAAoAhwiBDYCECAAKAIUIQUgAyACNgIcIAMgATYCGCADIAUgBGsiATYCFCABIAJqIQZBAiEFIANBEGohAQN/AkACQCAAKAI8IAEgBSADQQxqEAQQhQFFDQBBfyEEIANBfzYCDAwBCyADKAIMIQQLAkACQAJAIAYgBEcNACAAIAAoAiwiATYCHCAAIAE2AhQgACABIAAoAjBqNgIQIAIhBAwBCyAEQX9KDQFBACEEIABBADYCHCAAQgA3AxAgACAAKAIAQSByNgIAIAVBAkYNACACIAEoAgRrIQQLIANBIGokACAEDwsgAUEIaiABIAQgASgCBCIHSyIIGyIBIAEoAgAgBCAHQQAgCBtrIgdqNgIAIAEgASgCBCAHazYCBCAGIARrIQYgBSAIayEFDAALC0oBAX8jAEEQayIDJAACQAJAIAAoAjwgASACQf8BcSADQQhqEJ0BEIUBDQAgAykDCCEBDAELQn8hASADQn83AwgLIANBEGokACABCwoAIABBUGpBCkkLoQIBAX9BASEDAkACQCAARQ0AIAFB/wBNDQECQAJAEGwoArwBKAIADQAgAUGAf3FBgL8DRg0DEFFBGTYCAAwBCwJAIAFB/w9LDQAgACABQT9xQYABcjoAASAAIAFBBnZBwAFyOgAAQQIPCwJAAkAgAUGAsANJDQAgAUGAQHFBgMADRw0BCyAAIAFBP3FBgAFyOgACIAAgAUEMdkHgAXI6AAAgACABQQZ2QT9xQYABcjoAAUEDDwsCQCABQYCAfGpB//8/Sw0AIAAgAUE/cUGAAXI6AAMgACABQRJ2QfABcjoAACAAIAFBBnZBP3FBgAFyOgACIAAgAUEMdkE/cUGAAXI6AAFBBA8LEFFBGTYCAAtBfyEDCyADDwsgACABOgAAQQELBAAQVwsUAAJAIAANAEEADwsgACABQQAQawuOAQIBfwF+AkAgAL0iA0I0iKdB/w9xIgJB/w9GDQACQCACDQACQAJAIABEAAAAAAAAAABiDQBBACECDAELIABEAAAAAAAA8EOiIAEQbiEAIAEoAgBBQGohAgsgASACNgIAIAAPCyABIAJBgnhqNgIAIANC/////////4eAf4NCgICAgICAgPA/hL8hAAsgAAtcAQF/IAAgAC0ASiIBQX9qIAFyOgBKAkAgACgCACIBQQhxRQ0AIAAgAUEgcjYCAEF/DwsgAEIANwIEIAAgACgCLCIBNgIcIAAgATYCFCAAIAEgACgCMGo2AhBBAAvEAQEEfwJAAkAgAigCECIDDQBBACEEIAIQbw0BIAIoAhAhAwsCQCADIAIoAhQiBWsgAU8NACACIAAgASACKAIkEQIADwtBACEGAkAgAiwAS0EASA0AIAEhBANAIAQiA0UNASAAIANBf2oiBGotAABBCkcNAAsgAiAAIAMgAigCJBECACIEIANJDQEgASADayEBIAAgA2ohACACKAIUIQUgAyEGCyAFIAAgARCQARogAiACKAIUIAFqNgIUIAYgAWohBAsgBAuJAwEDfyMAQdABayIFJAAgBSACNgLMAUEAIQIgBUGgAWpBAEEoEJEBGiAFIAUoAswBNgLIAQJAAkBBACABIAVByAFqIAVB0ABqIAVBoAFqIAMgBBByQQBODQBBfyEBDAELAkAgACgCTEEASA0AIAAQWCECCyAAKAIAIQYCQCAALABKQQBKDQAgACAGQV9xNgIACyAGQSBxIQYCQAJAIAAoAjBFDQAgACABIAVByAFqIAVB0ABqIAVBoAFqIAMgBBByIQEMAQsgAEHQADYCMCAAIAVB0ABqNgIQIAAgBTYCHCAAIAU2AhQgACgCLCEHIAAgBTYCLCAAIAEgBUHIAWogBUHQAGogBUGgAWogAyAEEHIhASAHRQ0AIABBAEEAIAAoAiQRAgAaIABBADYCMCAAIAc2AiwgAEEANgIcIABBADYCECAAKAIUIQMgAEEANgIUIAFBfyADGyEBCyAAIAAoAgAiAyAGcjYCAEF/IAEgA0EgcRshASACRQ0AIAAQWQsgBUHQAWokACABC5sSAg9/AX4jAEHQAGsiByQAIAcgATYCTCAHQTdqIQggB0E4aiEJQQAhCkEAIQtBACEBAkADQAJAIAtBAEgNAAJAIAFB/////wcgC2tMDQAQUUE9NgIAQX8hCwwBCyABIAtqIQsLIAcoAkwiDCEBAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAIAwtAAAiDUUNAAJAA0ACQAJAAkAgDUH/AXEiDQ0AIAEhDQwBCyANQSVHDQEgASENA0AgAS0AAUElRw0BIAcgAUECaiIONgJMIA1BAWohDSABLQACIQ8gDiEBIA9BJUYNAAsLIA0gDGshAQJAIABFDQAgACAMIAEQcwsgAQ0SIAcoAkwsAAEQaiEOQX8hEEEBIQ0gBygCTCEBAkAgDkUNACABLQACQSRHDQAgASwAAUFQaiEQQQEhCkEDIQ0LIAcgASANaiIBNgJMQQAhDQJAAkAgASwAACIRQWBqIg9BH00NACABIQ4MAQsgASEOQQEgD3QiD0GJ0QRxRQ0AA0AgByABQQFqIg42AkwgDyANciENIAEsAAEiEUFgaiIPQR9LDQEgDiEBQQEgD3QiD0GJ0QRxDQALCwJAAkAgEUEqRw0AAkACQCAOLAABEGpFDQAgBygCTCIOLQACQSRHDQAgDiwAAUECdCAEakHAfmpBCjYCACAOQQNqIQEgDiwAAUEDdCADakGAfWooAgAhEkEBIQoMAQsgCg0HQQAhCkEAIRICQCAARQ0AIAIgAigCACIBQQRqNgIAIAEoAgAhEgsgBygCTEEBaiEBCyAHIAE2AkwgEkF/Sg0BQQAgEmshEiANQYDAAHIhDQwBCyAHQcwAahB0IhJBAEgNBSAHKAJMIQELQX8hEwJAIAEtAABBLkcNAAJAIAEtAAFBKkcNAAJAIAEsAAIQakUNACAHKAJMIgEtAANBJEcNACABLAACQQJ0IARqQcB+akEKNgIAIAEsAAJBA3QgA2pBgH1qKAIAIRMgByABQQRqIgE2AkwMAgsgCg0GAkACQCAADQBBACETDAELIAIgAigCACIBQQRqNgIAIAEoAgAhEwsgByAHKAJMQQJqIgE2AkwMAQsgByABQQFqNgJMIAdBzABqEHQhEyAHKAJMIQELQQAhDgNAIA4hD0F/IRQgASwAAEG/f2pBOUsNFCAHIAFBAWoiETYCTCABLAAAIQ4gESEBIA4gD0E6bGpBjx1qLQAAIg5Bf2pBCEkNAAsgDkUNEwJAAkACQAJAIA5BE0cNAEF/IRQgEEF/TA0BDBcLIBBBAEgNASAEIBBBAnRqIA42AgAgByADIBBBA3RqKQMANwNAC0EAIQEgAEUNFAwBCyAARQ0SIAdBwABqIA4gAiAGEHUgBygCTCERCyANQf//e3EiFSANIA1BgMAAcRshDUEAIRRBsB0hECAJIQ4gEUF/aiwAACIBQV9xIAEgAUEPcUEDRhsgASAPGyIBQah/aiIRQSBNDQICQAJAAkACQAJAIAFBv39qIg9BBk0NACABQdMARw0VIBNFDQEgBygCQCEODAMLIA8OBwkUARQJCQkJC0EAIQEgAEEgIBJBACANEHYMAgsgB0EANgIMIAcgBykDQD4CCCAHIAdBCGo2AkBBfyETIAdBCGohDgtBACEBAkADQCAOKAIAIg9FDQECQCAHQQRqIA8QbSIPQQBIIgwNACAPIBMgAWtLDQAgDkEEaiEOIBMgDyABaiIBSw0BDAILC0F/IRQgDA0VCyAAQSAgEiABIA0QdgJAIAENAEEAIQEMAQtBACEPIAcoAkAhDgNAIA4oAgAiDEUNASAHQQRqIAwQbSIMIA9qIg8gAUoNASAAIAdBBGogDBBzIA5BBGohDiAPIAFJDQALCyAAQSAgEiABIA1BgMAAcxB2IBIgASASIAFKGyEBDBILIAcgAUEBaiIONgJMIAEtAAEhDSAOIQEMAAALAAsgEQ4hCA0NDQ0NDQ0NAg0EBQICAg0FDQ0NDQkGBw0NAw0KDQ0ICAsgCyEUIAANDyAKRQ0NQQEhAQJAA0AgBCABQQJ0aigCACINRQ0BIAMgAUEDdGogDSACIAYQdUEBIRQgAUEBaiIBQQpHDQAMEQALAAtBASEUIAFBCk8NDwNAIAQgAUECdGooAgANAUEBIRQgAUEISyENIAFBAWohASANDRAMAAALAAtBfyEUDA4LIAAgBysDQCASIBMgDSABIAURDAAhAQwMC0EAIRQgBygCQCIBQbodIAEbIgxBACATEIEBIgEgDCATaiABGyEOIBUhDSABIAxrIBMgARshEwwJCyAHIAcpA0A8ADdBASETIAghDCAJIQ4gFSENDAgLAkAgBykDQCIWQn9VDQAgB0IAIBZ9IhY3A0BBASEUQbAdIRAMBgsCQCANQYAQcUUNAEEBIRRBsR0hEAwGC0GyHUGwHSANQQFxIhQbIRAMBQsgBykDQCAJEHchDEEAIRRBsB0hECANQQhxRQ0FIBMgCSAMayIBQQFqIBMgAUobIRMMBQsgE0EIIBNBCEsbIRMgDUEIciENQfgAIQELIAcpA0AgCSABQSBxEHghDEEAIRRBsB0hECANQQhxRQ0DIAcpA0BQDQMgAUEEdkGwHWohEEECIRQMAwtBACEBIA9B/wFxIg1BB0sNBQJAAkACQAJAAkACQAJAIA0OCAABAgMEDAUGAAsgBygCQCALNgIADAsLIAcoAkAgCzYCAAwKCyAHKAJAIAusNwMADAkLIAcoAkAgCzsBAAwICyAHKAJAIAs6AAAMBwsgBygCQCALNgIADAYLIAcoAkAgC6w3AwAMBQtBACEUQbAdIRAgBykDQCEWCyAWIAkQeSEMCyANQf//e3EgDSATQX9KGyENIAcpA0AhFgJAAkAgEw0AIBZQRQ0AQQAhEyAJIQwMAQsgEyAJIAxrIBZQaiIBIBMgAUobIRMLIAkhDgsgAEEgIBQgDiAMayIPIBMgEyAPSBsiEWoiDiASIBIgDkgbIgEgDiANEHYgACAQIBQQcyAAQTAgASAOIA1BgIAEcxB2IABBMCARIA9BABB2IAAgDCAPEHMgAEEgIAEgDiANQYDAAHMQdgwBCwtBACEUCyAHQdAAaiQAIBQLGAACQCAALQAAQSBxDQAgASACIAAQcBoLC0kBA39BACEBAkAgACgCACwAABBqRQ0AA0AgACgCACICLAAAIQMgACACQQFqNgIAIAMgAUEKbGpBUGohASACLAABEGoNAAsLIAELxAIAAkAgAUEUSw0AIAFBd2oiAUEJSw0AAkACQAJAAkACQAJAAkACQAJAAkAgAQ4KAAECAwQFBgcICQALIAIgAigCACIBQQRqNgIAIAAgASgCADYCAA8LIAIgAigCACIBQQRqNgIAIAAgATQCADcDAA8LIAIgAigCACIBQQRqNgIAIAAgATUCADcDAA8LIAIgAigCAEEHakF4cSIBQQhqNgIAIAAgASkDADcDAA8LIAIgAigCACIBQQRqNgIAIAAgATIBADcDAA8LIAIgAigCACIBQQRqNgIAIAAgATMBADcDAA8LIAIgAigCACIBQQRqNgIAIAAgATAAADcDAA8LIAIgAigCACIBQQRqNgIAIAAgATEAADcDAA8LIAIgAigCAEEHakF4cSIBQQhqNgIAIAAgASkDADcDAA8LIAAgAiADEQQACwt8AQJ/IwBBgAJrIgUkAAJAIAIgA0wNACAEQYDABHENACAFIAEgAiADayIEQYACIARBgAJJIgYbEJEBGgJAIAYNACACIANrIQIDQCAAIAVBgAIQcyAEQYB+aiIEQf8BSw0ACyACQf8BcSEECyAAIAUgBBBzCyAFQYACaiQACy4AAkAgAFANAANAIAFBf2oiASAAp0EHcUEwcjoAACAAQgOIIgBCAFINAAsLIAELNQACQCAAUA0AA0AgAUF/aiIBIACnQQ9xQaAhai0AACACcjoAACAAQgSIIgBCAFINAAsLIAELiAECA38BfgJAAkAgAEKAgICAEFoNACAAIQUMAQsDQCABQX9qIgEgACAAQgqAIgVCCn59p0EwcjoAACAAQv////+fAVYhAiAFIQAgAg0ACwsCQCAFpyICRQ0AA0AgAUF/aiIBIAIgAkEKbiIDQQpsa0EwcjoAACACQQlLIQQgAyECIAQNAAsLIAELDgAgACABIAJBB0EIEHEL6RcDEH8CfgF8IwBBsARrIgYkACAGQQA2AiwCQAJAIAEQfSIWQn9VDQAgAZoiARB9IRZBASEHQbAhIQgMAQsCQCAEQYAQcUUNAEEBIQdBsyEhCAwBC0G2IUGxISAEQQFxIgcbIQgLAkACQCAWQoCAgICAgID4/wCDQoCAgICAgID4/wBSDQAgAEEgIAIgB0EDaiIJIARB//97cRB2IAAgCCAHEHMgAEHLIUHPISAFQQV2QQFxIgobQcMhQcchIAobIAEgAWIbQQMQcyAAQSAgAiAJIARBgMAAcxB2DAELAkAgASAGQSxqEG4iASABoCIBRAAAAAAAAAAAYQ0AIAYgBigCLEF/ajYCLAsgBkEQaiELAkAgBUEgciIMQeEARw0AIAhBCWogCCAFQSBxIg0bIQ4CQCADQQtLDQBBDCADayIKRQ0ARAAAAAAAACBAIRgDQCAYRAAAAAAAADBAoiEYIApBf2oiCg0ACwJAIA4tAABBLUcNACAYIAGaIBihoJohAQwBCyABIBigIBihIQELAkAgBigCLCIKIApBH3UiCmogCnOtIAsQeSIKIAtHDQAgBkEwOgAPIAZBD2ohCgsgB0ECciEPIAYoAiwhECAKQX5qIhEgBUEPajoAACAKQX9qQS1BKyAQQQBIGzoAACAEQQhxIRIgBkEQaiEQA0AgECEKAkACQCABmUQAAAAAAADgQWNFDQAgAaohEAwBC0GAgICAeCEQCyAKIBBBoCFqLQAAIA1yOgAAIAEgELehRAAAAAAAADBAoiEBAkAgCkEBaiIQIAZBEGprQQFHDQACQCASDQAgA0EASg0AIAFEAAAAAAAAAABhDQELIApBLjoAASAKQQJqIRALIAFEAAAAAAAAAABiDQALAkACQCADRQ0AIBAgBkEQamtBfmogA04NACADIAtqIBFrQQJqIQoMAQsgCyAGQRBqayARayAQaiEKCyAAQSAgAiAKIA9qIgkgBBB2IAAgDiAPEHMgAEEwIAIgCSAEQYCABHMQdiAAIAZBEGogECAGQRBqayIQEHMgAEEwIAogECALIBFrIg1qa0EAQQAQdiAAIBEgDRBzIABBICACIAkgBEGAwABzEHYMAQsgA0EASCEKAkACQCABRAAAAAAAAAAAYg0AIAYoAiwhEgwBCyAGIAYoAixBZGoiEjYCLCABRAAAAAAAALBBoiEBC0EGIAMgChshDiAGQTBqIAZB0AJqIBJBAEgbIhMhDQNAAkACQCABRAAAAAAAAPBBYyABRAAAAAAAAAAAZnFFDQAgAashCgwBC0EAIQoLIA0gCjYCACANQQRqIQ0gASAKuKFEAAAAAGXNzUGiIgFEAAAAAAAAAABiDQALAkACQCASQQFODQAgDSEKIBMhEAwBCyATIRADQCASQR0gEkEdSBshEgJAIA1BfGoiCiAQSQ0AIBKtIRdCACEWA0AgCiAKNQIAIBeGIBZC/////w+DfCIWIBZCgJTr3AOAIhZCgJTr3AN+fT4CACAKQXxqIgogEE8NAAsgFqciCkUNACAQQXxqIhAgCjYCAAsCQANAIA0iCiAQTQ0BIApBfGoiDSgCAEUNAAsLIAYgBigCLCASayISNgIsIAohDSASQQBKDQALCwJAIBJBf0oNACAOQRlqQQltQQFqIRQgDEHmAEYhFQNAQQlBACASayASQXdIGyEJAkACQCAQIApJDQAgECAQQQRqIBAoAgAbIRAMAQtBgJTr3AMgCXYhEUF/IAl0QX9zIQ9BACESIBAhDQNAIA0gDSgCACIDIAl2IBJqNgIAIAMgD3EgEWwhEiANQQRqIg0gCkkNAAsgECAQQQRqIBAoAgAbIRAgEkUNACAKIBI2AgAgCkEEaiEKCyAGIAYoAiwgCWoiEjYCLCATIBAgFRsiDSAUQQJ0aiAKIAogDWtBAnUgFEobIQogEkEASA0ACwtBACENAkAgECAKTw0AIBMgEGtBAnVBCWwhDUEKIRIgECgCACIDQQpJDQADQCANQQFqIQ0gAyASQQpsIhJPDQALCwJAIA5BACANIAxB5gBGG2sgDkEARyAMQecARnFrIhIgCiATa0ECdUEJbEF3ak4NACASQYDIAGoiEkEJbSIJQQJ0IBNqQYRgaiERQQohAwJAIBIgCUEJbGsiEkEHSg0AA0AgA0EKbCEDIBJBB0ghCSASQQFqIRIgCQ0ACwsgESgCACIJIAkgA24iDyADbGshEgJAAkAgEUEEaiIUIApHDQAgEkUNAQtEAAAAAAAA4D9EAAAAAAAA8D9EAAAAAAAA+D8gEiADQQF2IhVGG0QAAAAAAAD4PyAUIApGGyASIBVJGyEYRAEAAAAAAEBDRAAAAAAAAEBDIA9BAXEbIQECQCAHRQ0AIAgtAABBLUcNACAYmiEYIAGaIQELIBEgCSASayISNgIAIAEgGKAgAWENACARIBIgA2oiDTYCAAJAIA1BgJTr3ANJDQADQCARQQA2AgACQCARQXxqIhEgEE8NACAQQXxqIhBBADYCAAsgESARKAIAQQFqIg02AgAgDUH/k+vcA0sNAAsLIBMgEGtBAnVBCWwhDUEKIRIgECgCACIDQQpJDQADQCANQQFqIQ0gAyASQQpsIhJPDQALCyARQQRqIhIgCiAKIBJLGyEKCwJAA0ACQCAKIhIgEEsNAEEAIRUMAgsgEkF8aiIKKAIARQ0AC0EBIRULAkACQCAMQecARg0AIARBCHEhDwwBCyANQX9zQX8gDkEBIA4bIgogDUogDUF7SnEiAxsgCmohDkF/QX4gAxsgBWohBSAEQQhxIg8NAEEJIQoCQCAVRQ0AQQkhCiASQXxqKAIAIglFDQBBCiEDQQAhCiAJQQpwDQADQCAKQQFqIQogCSADQQpsIgNwRQ0ACwsgEiATa0ECdUEJbEF3aiEDAkAgBUEgckHmAEcNAEEAIQ8gDiADIAprIgpBACAKQQBKGyIKIA4gCkgbIQ4MAQtBACEPIA4gAyANaiAKayIKQQAgCkEAShsiCiAOIApIGyEOCyAOIA9yIgxBAEchAwJAAkAgBUEgciIRQeYARw0AIA1BACANQQBKGyEKDAELAkAgCyANIA1BH3UiCmogCnOtIAsQeSIKa0EBSg0AA0AgCkF/aiIKQTA6AAAgCyAKa0ECSA0ACwsgCkF+aiIUIAU6AAAgCkF/akEtQSsgDUEASBs6AAAgCyAUayEKCyAAQSAgAiAHIA5qIANqIApqQQFqIgkgBBB2IAAgCCAHEHMgAEEwIAIgCSAEQYCABHMQdgJAAkACQAJAIBFB5gBHDQAgBkEQakEIciERIAZBEGpBCXIhDSATIBAgECATSxsiAyEQA0AgEDUCACANEHkhCgJAAkAgECADRg0AIAogBkEQak0NAQNAIApBf2oiCkEwOgAAIAogBkEQaksNAAwCAAsACyAKIA1HDQAgBkEwOgAYIBEhCgsgACAKIA0gCmsQcyAQQQRqIhAgE00NAAsCQCAMRQ0AIABB0yFBARBzCyAQIBJPDQEgDkEBSA0BA0ACQCAQNQIAIA0QeSIKIAZBEGpNDQADQCAKQX9qIgpBMDoAACAKIAZBEGpLDQALCyAAIAogDkEJIA5BCUgbEHMgDkF3aiEKIBBBBGoiECASTw0DIA5BCUohAyAKIQ4gAw0ADAMACwALAkAgDkEASA0AIBIgEEEEaiAVGyERIAZBEGpBCHIhEyAGQRBqQQlyIRIgECENA0ACQCANNQIAIBIQeSIKIBJHDQAgBkEwOgAYIBMhCgsCQAJAIA0gEEYNACAKIAZBEGpNDQEDQCAKQX9qIgpBMDoAACAKIAZBEGpLDQAMAgALAAsgACAKQQEQcyAKQQFqIQoCQCAPDQAgDkEBSA0BCyAAQdMhQQEQcwsgACAKIBIgCmsiAyAOIA4gA0obEHMgDiADayEOIA1BBGoiDSARTw0BIA5Bf0oNAAsLIABBMCAOQRJqQRJBABB2IAAgFCALIBRrEHMMAgsgDiEKCyAAQTAgCkEJakEJQQAQdgsgAEEgIAIgCSAEQYDAAHMQdgsgBkGwBGokACACIAkgCSACSBsLKwEBfyABIAEoAgBBD2pBcHEiAkEQajYCACAAIAIpAwAgAikDCBCIATkDAAsFACAAvQu5AQECfyMAQaABayIEJAAgBEEIakHYIUGQARCQARoCQAJAAkAgAUF/akH/////B0kNACABDQEgBEGfAWohAEEBIQELIAQgADYCNCAEIAA2AhwgBEF+IABrIgUgASABIAVLGyIBNgI4IAQgACABaiIANgIkIAQgADYCGCAEQQhqIAIgAxB6IQAgAUUNASAEKAIcIgEgASAEKAIYRmtBADoAAAwBCxBRQT02AgBBfyEACyAEQaABaiQAIAALNAEBfyAAKAIUIgMgASACIAAoAhAgA2siAyADIAJLGyIDEJABGiAAIAAoAhQgA2o2AhQgAgsQACAAQf////8HIAEgAhB+C40CAQR/IAJBAEchAwJAAkACQAJAIAJFDQAgAEEDcUUNACABQf8BcSEEA0AgAC0AACAERg0CIABBAWohACACQX9qIgJBAEchAyACRQ0BIABBA3ENAAsLIANFDQELIAAtAAAgAUH/AXFGDQECQAJAIAJBBEkNACABQf8BcUGBgoQIbCEEIAJBfGoiAyADQXxxIgNrIQUgAyAAakEEaiEGA0AgACgCACAEcyIDQX9zIANB//37d2pxQYCBgoR4cQ0CIABBBGohACACQXxqIgJBA0sNAAsgBSECIAYhAAsgAkUNAQsgAUH/AXEhAwNAIAAtAAAgA0YNAiAAQQFqIQAgAkF/aiICDQALC0EADwsgAAsaACAAIAEQgwEiAEEAIAAtAAAgAUH/AXFGGwvkAQECfwJAAkAgAUH/AXEiAkUNAAJAIABBA3FFDQADQCAALQAAIgNFDQMgAyABQf8BcUYNAyAAQQFqIgBBA3ENAAsLAkAgACgCACIDQX9zIANB//37d2pxQYCBgoR4cQ0AIAJBgYKECGwhAgNAIAMgAnMiA0F/cyADQf/9+3dqcUGAgYKEeHENASAAKAIEIQMgAEEEaiEAIANBf3MgA0H//ft3anFBgIGChHhxRQ0ACwsCQANAIAAiAy0AACICRQ0BIANBAWohACACIAFB/wFxRw0ACwsgAw8LIAAgABCEAWoPCyAAC5wBAQN/IAAhAQJAAkAgAEEDcUUNAAJAIAAtAAANACAAIQEMAgsgACEBA0AgAUEBaiIBQQNxRQ0BIAEtAABFDQIMAAALAAsDQCABIgJBBGohASACKAIAIgNBf3MgA0H//ft3anFBgIGChHhxRQ0ACwJAIANB/wFxDQAgAiEBDAELA0AgAi0AASEDIAJBAWoiASECIAMNAAsLIAEgAGsLFQACQCAADQBBAA8LEFEgADYCAEF/C2UBAX4CQAJAAkAgA0HAAHFFDQAgAiADQUBqrYghAUIAIQRCACECDAELIANFDQEgAkHAACADa62GIAEgA60iBIiEIQEgAiAEiCECQgAhBAsgBCABhCEBCyAAIAE3AwAgACACNwMIC10BAX4CQAJAAkAgA0HAAHFFDQAgASADQUBqrYYhAkIAIQEMAQsgA0UNASABQcAAIANrrYggAiADrSIEhoQhAiABIASGIQELIAJCAIQhAgsgACABNwMAIAAgAjcDCAvqAwICfwJ+IwBBIGsiAiQAAkACQCABQv///////////wCDIgRCgICAgICAwP9DfCAEQoCAgICAgMCAvH98Wg0AIABCPIggAUIEhoQhBAJAIABC//////////8PgyIAQoGAgICAgICACFQNACAEQoGAgICAgICAwAB8IQUMAgsgBEKAgICAgICAgMAAfCEFIABCgICAgICAgIAIhUIAUg0BIAVCAYMgBXwhBQwBCwJAIABQIARCgICAgICAwP//AFQgBEKAgICAgIDA//8AURsNACAAQjyIIAFCBIaEQv////////8Dg0KAgICAgICA/P8AhCEFDAELQoCAgICAgID4/wAhBSAEQv///////7//wwBWDQBCACEFIARCMIinIgNBkfcASQ0AIAIgACABQv///////z+DQoCAgICAgMAAhCIEQYH4ACADaxCGASACQRBqIAAgBCADQf+If2oQhwEgAikDACIEQjyIIAJBCGopAwBCBIaEIQUCQCAEQv//////////D4MgAikDECACQRBqQQhqKQMAhEIAUq2EIgRCgYCAgICAgIAIVA0AIAVCAXwhBQwBCyAEQoCAgICAgICACIVCAFINACAFQgGDIAV8IQULIAJBIGokACAFIAFCgICAgICAgICAf4OEvwuLMAELfyMAQRBrIgEkAAJAAkACQAJAAkACQAJAAkACQAJAAkACQCAAQfQBSw0AAkBBACgC3EYiAkEQIABBC2pBeHEgAEELSRsiA0EDdiIEdiIAQQNxRQ0AIABBf3NBAXEgBGoiA0EDdCIFQYzHAGooAgAiBEEIaiEAAkACQCAEKAIIIgYgBUGExwBqIgVHDQBBACACQX4gA3dxNgLcRgwBC0EAKALsRiAGSxogBiAFNgIMIAUgBjYCCAsgBCADQQN0IgZBA3I2AgQgBCAGaiIEIAQoAgRBAXI2AgQMDAsgA0EAKALkRiIHTQ0BAkAgAEUNAAJAAkAgACAEdEECIAR0IgBBACAAa3JxIgBBACAAa3FBf2oiACAAQQx2QRBxIgB2IgRBBXZBCHEiBiAAciAEIAZ2IgBBAnZBBHEiBHIgACAEdiIAQQF2QQJxIgRyIAAgBHYiAEEBdkEBcSIEciAAIAR2aiIGQQN0IgVBjMcAaigCACIEKAIIIgAgBUGExwBqIgVHDQBBACACQX4gBndxIgI2AtxGDAELQQAoAuxGIABLGiAAIAU2AgwgBSAANgIICyAEQQhqIQAgBCADQQNyNgIEIAQgA2oiBSAGQQN0IgggA2siBkEBcjYCBCAEIAhqIAY2AgACQCAHRQ0AIAdBA3YiCEEDdEGExwBqIQNBACgC8EYhBAJAAkAgAkEBIAh0IghxDQBBACACIAhyNgLcRiADIQgMAQsgAygCCCEICyADIAQ2AgggCCAENgIMIAQgAzYCDCAEIAg2AggLQQAgBTYC8EZBACAGNgLkRgwMC0EAKALgRiIJRQ0BIAlBACAJa3FBf2oiACAAQQx2QRBxIgB2IgRBBXZBCHEiBiAAciAEIAZ2IgBBAnZBBHEiBHIgACAEdiIAQQF2QQJxIgRyIAAgBHYiAEEBdkEBcSIEciAAIAR2akECdEGMyQBqKAIAIgUoAgRBeHEgA2shBCAFIQYCQANAAkAgBigCECIADQAgBkEUaigCACIARQ0CCyAAKAIEQXhxIANrIgYgBCAGIARJIgYbIQQgACAFIAYbIQUgACEGDAAACwALIAUoAhghCgJAIAUoAgwiCCAFRg0AAkBBACgC7EYgBSgCCCIASw0AIAAoAgwgBUcaCyAAIAg2AgwgCCAANgIIDAsLAkAgBUEUaiIGKAIAIgANACAFKAIQIgBFDQMgBUEQaiEGCwNAIAYhCyAAIghBFGoiBigCACIADQAgCEEQaiEGIAgoAhAiAA0ACyALQQA2AgAMCgtBfyEDIABBv39LDQAgAEELaiIAQXhxIQNBACgC4EYiB0UNAEEAIQsCQCAAQQh2IgBFDQBBHyELIANB////B0sNACAAIABBgP4/akEQdkEIcSIEdCIAIABBgOAfakEQdkEEcSIAdCIGIAZBgIAPakEQdkECcSIGdEEPdiAAIARyIAZyayIAQQF0IAMgAEEVanZBAXFyQRxqIQsLQQAgA2shBgJAAkACQAJAIAtBAnRBjMkAaigCACIEDQBBACEAQQAhCAwBCyADQQBBGSALQQF2ayALQR9GG3QhBUEAIQBBACEIA0ACQCAEKAIEQXhxIANrIgIgBk8NACACIQYgBCEIIAINAEEAIQYgBCEIIAQhAAwDCyAAIARBFGooAgAiAiACIAQgBUEddkEEcWpBEGooAgAiBEYbIAAgAhshACAFIARBAEd0IQUgBA0ACwsCQCAAIAhyDQBBAiALdCIAQQAgAGtyIAdxIgBFDQMgAEEAIABrcUF/aiIAIABBDHZBEHEiAHYiBEEFdkEIcSIFIAByIAQgBXYiAEECdkEEcSIEciAAIAR2IgBBAXZBAnEiBHIgACAEdiIAQQF2QQFxIgRyIAAgBHZqQQJ0QYzJAGooAgAhAAsgAEUNAQsDQCAAKAIEQXhxIANrIgIgBkkhBQJAIAAoAhAiBA0AIABBFGooAgAhBAsgAiAGIAUbIQYgACAIIAUbIQggBCEAIAQNAAsLIAhFDQAgBkEAKALkRiADa08NACAIKAIYIQsCQCAIKAIMIgUgCEYNAAJAQQAoAuxGIAgoAggiAEsNACAAKAIMIAhHGgsgACAFNgIMIAUgADYCCAwJCwJAIAhBFGoiBCgCACIADQAgCCgCECIARQ0DIAhBEGohBAsDQCAEIQIgACIFQRRqIgQoAgAiAA0AIAVBEGohBCAFKAIQIgANAAsgAkEANgIADAgLAkBBACgC5EYiACADSQ0AQQAoAvBGIQQCQAJAIAAgA2siBkEQSQ0AQQAgBjYC5EZBACAEIANqIgU2AvBGIAUgBkEBcjYCBCAEIABqIAY2AgAgBCADQQNyNgIEDAELQQBBADYC8EZBAEEANgLkRiAEIABBA3I2AgQgBCAAaiIAIAAoAgRBAXI2AgQLIARBCGohAAwKCwJAQQAoAuhGIgUgA00NAEEAIAUgA2siBDYC6EZBAEEAKAL0RiIAIANqIgY2AvRGIAYgBEEBcjYCBCAAIANBA3I2AgQgAEEIaiEADAoLAkACQEEAKAK0SkUNAEEAKAK8SiEEDAELQQBCfzcCwEpBAEKAoICAgIAENwK4SkEAIAFBDGpBcHFB2KrVqgVzNgK0SkEAQQA2AshKQQBBADYCmEpBgCAhBAtBACEAIAQgA0EvaiIHaiICQQAgBGsiC3EiCCADTQ0JQQAhAAJAQQAoApRKIgRFDQBBACgCjEoiBiAIaiIJIAZNDQogCSAESw0KC0EALQCYSkEEcQ0EAkACQAJAQQAoAvRGIgRFDQBBnMoAIQADQAJAIAAoAgAiBiAESw0AIAYgACgCBGogBEsNAwsgACgCCCIADQALC0EAEI8BIgVBf0YNBSAIIQICQEEAKAK4SiIAQX9qIgQgBXFFDQAgCCAFayAEIAVqQQAgAGtxaiECCyACIANNDQUgAkH+////B0sNBQJAQQAoApRKIgBFDQBBACgCjEoiBCACaiIGIARNDQYgBiAASw0GCyACEI8BIgAgBUcNAQwHCyACIAVrIAtxIgJB/v///wdLDQQgAhCPASIFIAAoAgAgACgCBGpGDQMgBSEACyAAIQUCQCADQTBqIAJNDQAgAkH+////B0sNACAFQX9GDQAgByACa0EAKAK8SiIAakEAIABrcSIAQf7///8HSw0GAkAgABCPAUF/Rg0AIAAgAmohAgwHC0EAIAJrEI8BGgwECyAFQX9HDQUMAwtBACEIDAcLQQAhBQwFCyAFQX9HDQILQQBBACgCmEpBBHI2AphKCyAIQf7///8HSw0BIAgQjwEiBUEAEI8BIgBPDQEgBUF/Rg0BIABBf0YNASAAIAVrIgIgA0Eoak0NAQtBAEEAKAKMSiACaiIANgKMSgJAIABBACgCkEpNDQBBACAANgKQSgsCQAJAAkACQEEAKAL0RiIERQ0AQZzKACEAA0AgBSAAKAIAIgYgACgCBCIIakYNAiAAKAIIIgANAAwDAAsACwJAAkBBACgC7EYiAEUNACAFIABPDQELQQAgBTYC7EYLQQAhAEEAIAI2AqBKQQAgBTYCnEpBAEF/NgL8RkEAQQAoArRKNgKAR0EAQQA2AqhKA0AgAEEDdCIEQYzHAGogBEGExwBqIgY2AgAgBEGQxwBqIAY2AgAgAEEBaiIAQSBHDQALQQAgAkFYaiIAQXggBWtBB3FBACAFQQhqQQdxGyIEayIGNgLoRkEAIAUgBGoiBDYC9EYgBCAGQQFyNgIEIAUgAGpBKDYCBEEAQQAoAsRKNgL4RgwCCyAALQAMQQhxDQAgBSAETQ0AIAYgBEsNACAAIAggAmo2AgRBACAEQXggBGtBB3FBACAEQQhqQQdxGyIAaiIGNgL0RkEAQQAoAuhGIAJqIgUgAGsiADYC6EYgBiAAQQFyNgIEIAQgBWpBKDYCBEEAQQAoAsRKNgL4RgwBCwJAIAVBACgC7EYiCE8NAEEAIAU2AuxGIAUhCAsgBSACaiEGQZzKACEAAkACQAJAAkACQAJAAkADQCAAKAIAIAZGDQEgACgCCCIADQAMAgALAAsgAC0ADEEIcUUNAQtBnMoAIQADQAJAIAAoAgAiBiAESw0AIAYgACgCBGoiBiAESw0DCyAAKAIIIQAMAAALAAsgACAFNgIAIAAgACgCBCACajYCBCAFQXggBWtBB3FBACAFQQhqQQdxG2oiCyADQQNyNgIEIAZBeCAGa0EHcUEAIAZBCGpBB3EbaiIFIAtrIANrIQAgCyADaiEGAkAgBCAFRw0AQQAgBjYC9EZBAEEAKALoRiAAaiIANgLoRiAGIABBAXI2AgQMAwsCQEEAKALwRiAFRw0AQQAgBjYC8EZBAEEAKALkRiAAaiIANgLkRiAGIABBAXI2AgQgBiAAaiAANgIADAMLAkAgBSgCBCIEQQNxQQFHDQAgBEF4cSEHAkACQCAEQf8BSw0AIAUoAgwhAwJAIAUoAggiAiAEQQN2IglBA3RBhMcAaiIERg0AIAggAksaCwJAIAMgAkcNAEEAQQAoAtxGQX4gCXdxNgLcRgwCCwJAIAMgBEYNACAIIANLGgsgAiADNgIMIAMgAjYCCAwBCyAFKAIYIQkCQAJAIAUoAgwiAiAFRg0AAkAgCCAFKAIIIgRLDQAgBCgCDCAFRxoLIAQgAjYCDCACIAQ2AggMAQsCQCAFQRRqIgQoAgAiAw0AIAVBEGoiBCgCACIDDQBBACECDAELA0AgBCEIIAMiAkEUaiIEKAIAIgMNACACQRBqIQQgAigCECIDDQALIAhBADYCAAsgCUUNAAJAAkAgBSgCHCIDQQJ0QYzJAGoiBCgCACAFRw0AIAQgAjYCACACDQFBAEEAKALgRkF+IAN3cTYC4EYMAgsgCUEQQRQgCSgCECAFRhtqIAI2AgAgAkUNAQsgAiAJNgIYAkAgBSgCECIERQ0AIAIgBDYCECAEIAI2AhgLIAUoAhQiBEUNACACQRRqIAQ2AgAgBCACNgIYCyAHIABqIQAgBSAHaiEFCyAFIAUoAgRBfnE2AgQgBiAAQQFyNgIEIAYgAGogADYCAAJAIABB/wFLDQAgAEEDdiIEQQN0QYTHAGohAAJAAkBBACgC3EYiA0EBIAR0IgRxDQBBACADIARyNgLcRiAAIQQMAQsgACgCCCEECyAAIAY2AgggBCAGNgIMIAYgADYCDCAGIAQ2AggMAwtBACEEAkAgAEEIdiIDRQ0AQR8hBCAAQf///wdLDQAgAyADQYD+P2pBEHZBCHEiBHQiAyADQYDgH2pBEHZBBHEiA3QiBSAFQYCAD2pBEHZBAnEiBXRBD3YgAyAEciAFcmsiBEEBdCAAIARBFWp2QQFxckEcaiEECyAGIAQ2AhwgBkIANwIQIARBAnRBjMkAaiEDAkACQEEAKALgRiIFQQEgBHQiCHENAEEAIAUgCHI2AuBGIAMgBjYCACAGIAM2AhgMAQsgAEEAQRkgBEEBdmsgBEEfRht0IQQgAygCACEFA0AgBSIDKAIEQXhxIABGDQMgBEEddiEFIARBAXQhBCADIAVBBHFqQRBqIggoAgAiBQ0ACyAIIAY2AgAgBiADNgIYCyAGIAY2AgwgBiAGNgIIDAILQQAgAkFYaiIAQXggBWtBB3FBACAFQQhqQQdxGyIIayILNgLoRkEAIAUgCGoiCDYC9EYgCCALQQFyNgIEIAUgAGpBKDYCBEEAQQAoAsRKNgL4RiAEIAZBJyAGa0EHcUEAIAZBWWpBB3EbakFRaiIAIAAgBEEQakkbIghBGzYCBCAIQRBqQQApAqRKNwIAIAhBACkCnEo3AghBACAIQQhqNgKkSkEAIAI2AqBKQQAgBTYCnEpBAEEANgKoSiAIQRhqIQADQCAAQQc2AgQgAEEIaiEFIABBBGohACAFIAZJDQALIAggBEYNAyAIIAgoAgRBfnE2AgQgBCAIIARrIgJBAXI2AgQgCCACNgIAAkAgAkH/AUsNACACQQN2IgZBA3RBhMcAaiEAAkACQEEAKALcRiIFQQEgBnQiBnENAEEAIAUgBnI2AtxGIAAhBgwBCyAAKAIIIQYLIAAgBDYCCCAGIAQ2AgwgBCAANgIMIAQgBjYCCAwEC0EAIQACQCACQQh2IgZFDQBBHyEAIAJB////B0sNACAGIAZBgP4/akEQdkEIcSIAdCIGIAZBgOAfakEQdkEEcSIGdCIFIAVBgIAPakEQdkECcSIFdEEPdiAGIAByIAVyayIAQQF0IAIgAEEVanZBAXFyQRxqIQALIARCADcCECAEQRxqIAA2AgAgAEECdEGMyQBqIQYCQAJAQQAoAuBGIgVBASAAdCIIcQ0AQQAgBSAIcjYC4EYgBiAENgIAIARBGGogBjYCAAwBCyACQQBBGSAAQQF2ayAAQR9GG3QhACAGKAIAIQUDQCAFIgYoAgRBeHEgAkYNBCAAQR12IQUgAEEBdCEAIAYgBUEEcWpBEGoiCCgCACIFDQALIAggBDYCACAEQRhqIAY2AgALIAQgBDYCDCAEIAQ2AggMAwsgAygCCCIAIAY2AgwgAyAGNgIIIAZBADYCGCAGIAM2AgwgBiAANgIICyALQQhqIQAMBQsgBigCCCIAIAQ2AgwgBiAENgIIIARBGGpBADYCACAEIAY2AgwgBCAANgIIC0EAKALoRiIAIANNDQBBACAAIANrIgQ2AuhGQQBBACgC9EYiACADaiIGNgL0RiAGIARBAXI2AgQgACADQQNyNgIEIABBCGohAAwDCxBRQTA2AgBBACEADAILAkAgC0UNAAJAAkAgCCAIKAIcIgRBAnRBjMkAaiIAKAIARw0AIAAgBTYCACAFDQFBACAHQX4gBHdxIgc2AuBGDAILIAtBEEEUIAsoAhAgCEYbaiAFNgIAIAVFDQELIAUgCzYCGAJAIAgoAhAiAEUNACAFIAA2AhAgACAFNgIYCyAIQRRqKAIAIgBFDQAgBUEUaiAANgIAIAAgBTYCGAsCQAJAIAZBD0sNACAIIAYgA2oiAEEDcjYCBCAIIABqIgAgACgCBEEBcjYCBAwBCyAIIANBA3I2AgQgCCADaiIFIAZBAXI2AgQgBSAGaiAGNgIAAkAgBkH/AUsNACAGQQN2IgRBA3RBhMcAaiEAAkACQEEAKALcRiIGQQEgBHQiBHENAEEAIAYgBHI2AtxGIAAhBAwBCyAAKAIIIQQLIAAgBTYCCCAEIAU2AgwgBSAANgIMIAUgBDYCCAwBCwJAAkAgBkEIdiIEDQBBACEADAELQR8hACAGQf///wdLDQAgBCAEQYD+P2pBEHZBCHEiAHQiBCAEQYDgH2pBEHZBBHEiBHQiAyADQYCAD2pBEHZBAnEiA3RBD3YgBCAAciADcmsiAEEBdCAGIABBFWp2QQFxckEcaiEACyAFIAA2AhwgBUIANwIQIABBAnRBjMkAaiEEAkACQAJAIAdBASAAdCIDcQ0AQQAgByADcjYC4EYgBCAFNgIAIAUgBDYCGAwBCyAGQQBBGSAAQQF2ayAAQR9GG3QhACAEKAIAIQMDQCADIgQoAgRBeHEgBkYNAiAAQR12IQMgAEEBdCEAIAQgA0EEcWpBEGoiAigCACIDDQALIAIgBTYCACAFIAQ2AhgLIAUgBTYCDCAFIAU2AggMAQsgBCgCCCIAIAU2AgwgBCAFNgIIIAVBADYCGCAFIAQ2AgwgBSAANgIICyAIQQhqIQAMAQsCQCAKRQ0AAkACQCAFIAUoAhwiBkECdEGMyQBqIgAoAgBHDQAgACAINgIAIAgNAUEAIAlBfiAGd3E2AuBGDAILIApBEEEUIAooAhAgBUYbaiAINgIAIAhFDQELIAggCjYCGAJAIAUoAhAiAEUNACAIIAA2AhAgACAINgIYCyAFQRRqKAIAIgBFDQAgCEEUaiAANgIAIAAgCDYCGAsCQAJAIARBD0sNACAFIAQgA2oiAEEDcjYCBCAFIABqIgAgACgCBEEBcjYCBAwBCyAFIANBA3I2AgQgBSADaiIGIARBAXI2AgQgBiAEaiAENgIAAkAgB0UNACAHQQN2IghBA3RBhMcAaiEDQQAoAvBGIQACQAJAQQEgCHQiCCACcQ0AQQAgCCACcjYC3EYgAyEIDAELIAMoAgghCAsgAyAANgIIIAggADYCDCAAIAM2AgwgACAINgIIC0EAIAY2AvBGQQAgBDYC5EYLIAVBCGohAAsgAUEQaiQAIAAL/g0BB38CQCAARQ0AIABBeGoiASAAQXxqKAIAIgJBeHEiAGohAwJAIAJBAXENACACQQNxRQ0BIAEgASgCACICayIBQQAoAuxGIgRJDQEgAiAAaiEAAkBBACgC8EYgAUYNAAJAIAJB/wFLDQAgASgCDCEFAkAgASgCCCIGIAJBA3YiB0EDdEGExwBqIgJGDQAgBCAGSxoLAkAgBSAGRw0AQQBBACgC3EZBfiAHd3E2AtxGDAMLAkAgBSACRg0AIAQgBUsaCyAGIAU2AgwgBSAGNgIIDAILIAEoAhghBwJAAkAgASgCDCIFIAFGDQACQCAEIAEoAggiAksNACACKAIMIAFHGgsgAiAFNgIMIAUgAjYCCAwBCwJAIAFBFGoiAigCACIEDQAgAUEQaiICKAIAIgQNAEEAIQUMAQsDQCACIQYgBCIFQRRqIgIoAgAiBA0AIAVBEGohAiAFKAIQIgQNAAsgBkEANgIACyAHRQ0BAkACQCABKAIcIgRBAnRBjMkAaiICKAIAIAFHDQAgAiAFNgIAIAUNAUEAQQAoAuBGQX4gBHdxNgLgRgwDCyAHQRBBFCAHKAIQIAFGG2ogBTYCACAFRQ0CCyAFIAc2AhgCQCABKAIQIgJFDQAgBSACNgIQIAIgBTYCGAsgASgCFCICRQ0BIAVBFGogAjYCACACIAU2AhgMAQsgAygCBCICQQNxQQNHDQBBACAANgLkRiADIAJBfnE2AgQgASAAQQFyNgIEIAEgAGogADYCAA8LIAMgAU0NACADKAIEIgJBAXFFDQACQAJAIAJBAnENAAJAQQAoAvRGIANHDQBBACABNgL0RkEAQQAoAuhGIABqIgA2AuhGIAEgAEEBcjYCBCABQQAoAvBGRw0DQQBBADYC5EZBAEEANgLwRg8LAkBBACgC8EYgA0cNAEEAIAE2AvBGQQBBACgC5EYgAGoiADYC5EYgASAAQQFyNgIEIAEgAGogADYCAA8LIAJBeHEgAGohAAJAAkAgAkH/AUsNACADKAIMIQQCQCADKAIIIgUgAkEDdiIDQQN0QYTHAGoiAkYNAEEAKALsRiAFSxoLAkAgBCAFRw0AQQBBACgC3EZBfiADd3E2AtxGDAILAkAgBCACRg0AQQAoAuxGIARLGgsgBSAENgIMIAQgBTYCCAwBCyADKAIYIQcCQAJAIAMoAgwiBSADRg0AAkBBACgC7EYgAygCCCICSw0AIAIoAgwgA0caCyACIAU2AgwgBSACNgIIDAELAkAgA0EUaiICKAIAIgQNACADQRBqIgIoAgAiBA0AQQAhBQwBCwNAIAIhBiAEIgVBFGoiAigCACIEDQAgBUEQaiECIAUoAhAiBA0ACyAGQQA2AgALIAdFDQACQAJAIAMoAhwiBEECdEGMyQBqIgIoAgAgA0cNACACIAU2AgAgBQ0BQQBBACgC4EZBfiAEd3E2AuBGDAILIAdBEEEUIAcoAhAgA0YbaiAFNgIAIAVFDQELIAUgBzYCGAJAIAMoAhAiAkUNACAFIAI2AhAgAiAFNgIYCyADKAIUIgJFDQAgBUEUaiACNgIAIAIgBTYCGAsgASAAQQFyNgIEIAEgAGogADYCACABQQAoAvBGRw0BQQAgADYC5EYPCyADIAJBfnE2AgQgASAAQQFyNgIEIAEgAGogADYCAAsCQCAAQf8BSw0AIABBA3YiAkEDdEGExwBqIQACQAJAQQAoAtxGIgRBASACdCICcQ0AQQAgBCACcjYC3EYgACECDAELIAAoAgghAgsgACABNgIIIAIgATYCDCABIAA2AgwgASACNgIIDwtBACECAkAgAEEIdiIERQ0AQR8hAiAAQf///wdLDQAgBCAEQYD+P2pBEHZBCHEiAnQiBCAEQYDgH2pBEHZBBHEiBHQiBSAFQYCAD2pBEHZBAnEiBXRBD3YgBCACciAFcmsiAkEBdCAAIAJBFWp2QQFxckEcaiECCyABQgA3AhAgAUEcaiACNgIAIAJBAnRBjMkAaiEEAkACQEEAKALgRiIFQQEgAnQiA3ENAEEAIAUgA3I2AuBGIAQgATYCACABIAE2AgwgAUEYaiAENgIAIAEgATYCCAwBCyAAQQBBGSACQQF2ayACQR9GG3QhAiAEKAIAIQUCQANAIAUiBCgCBEF4cSAARg0BIAJBHXYhBSACQQF0IQIgBCAFQQRxakEQaiIDKAIAIgUNAAsgAyABNgIAIAEgATYCDCABQRhqIAQ2AgAgASABNgIIDAELIAQoAggiACABNgIMIAQgATYCCCABQRhqQQA2AgAgASAENgIMIAEgADYCCAtBAEEAKAL8RkF/aiIBNgL8RiABDQBBpMoAIQEDQCABKAIAIgBBCGohASAADQALQQBBfzYC/EYLC2UCAX8BfgJAAkAgAA0AQQAhAgwBCyAArSABrX4iA6chAiABIAByQYCABEkNAEF/IAIgA0IgiKdBAEcbIQILAkAgAhCJASIARQ0AIABBfGotAABBA3FFDQAgAEEAIAIQkQEaCyAAC4sBAQJ/AkAgAA0AIAEQiQEPCwJAIAFBQEkNABBRQTA2AgBBAA8LAkAgAEF4akEQIAFBC2pBeHEgAUELSRsQjQEiAkUNACACQQhqDwsCQCABEIkBIgINAEEADwsgAiAAIABBfGooAgAiA0F4cUEEQQggA0EDcRtrIgMgASADIAFJGxCQARogABCKASACC/sHAQl/IAAgACgCBCICQXhxIgNqIQRBACgC7EYhBQJAIAJBA3EiBkEBRg0AIAUgAEsNACAEIABNGgsCQAJAIAYNAEEAIQYgAUGAAkkNAQJAIAMgAUEEakkNACAAIQYgAyABa0EAKAK8SkEBdE0NAgtBAA8LAkACQCADIAFJDQAgAyABayIDQRBJDQEgACACQQFxIAFyQQJyNgIEIAAgAWoiASADQQNyNgIEIAQgBCgCBEEBcjYCBCABIAMQjgEMAQtBACEGAkBBACgC9EYgBEcNAEEAKALoRiADaiIEIAFNDQIgACACQQFxIAFyQQJyNgIEIAAgAWoiAyAEIAFrIgFBAXI2AgRBACABNgLoRkEAIAM2AvRGDAELAkBBACgC8EYgBEcNAEEAIQZBACgC5EYgA2oiBCABSQ0CAkACQCAEIAFrIgNBEEkNACAAIAJBAXEgAXJBAnI2AgQgACABaiIBIANBAXI2AgQgACAEaiIEIAM2AgAgBCAEKAIEQX5xNgIEDAELIAAgAkEBcSAEckECcjYCBCAAIARqIgEgASgCBEEBcjYCBEEAIQNBACEBC0EAIAE2AvBGQQAgAzYC5EYMAQtBACEGIAQoAgQiB0ECcQ0BIAdBeHEgA2oiCCABSQ0BIAggAWshCQJAAkAgB0H/AUsNACAEKAIMIQMCQCAEKAIIIgQgB0EDdiIHQQN0QYTHAGoiBkYNACAFIARLGgsCQCADIARHDQBBAEEAKALcRkF+IAd3cTYC3EYMAgsCQCADIAZGDQAgBSADSxoLIAQgAzYCDCADIAQ2AggMAQsgBCgCGCEKAkACQCAEKAIMIgcgBEYNAAJAIAUgBCgCCCIDSw0AIAMoAgwgBEcaCyADIAc2AgwgByADNgIIDAELAkAgBEEUaiIDKAIAIgYNACAEQRBqIgMoAgAiBg0AQQAhBwwBCwNAIAMhBSAGIgdBFGoiAygCACIGDQAgB0EQaiEDIAcoAhAiBg0ACyAFQQA2AgALIApFDQACQAJAIAQoAhwiBkECdEGMyQBqIgMoAgAgBEcNACADIAc2AgAgBw0BQQBBACgC4EZBfiAGd3E2AuBGDAILIApBEEEUIAooAhAgBEYbaiAHNgIAIAdFDQELIAcgCjYCGAJAIAQoAhAiA0UNACAHIAM2AhAgAyAHNgIYCyAEKAIUIgRFDQAgB0EUaiAENgIAIAQgBzYCGAsCQCAJQQ9LDQAgACACQQFxIAhyQQJyNgIEIAAgCGoiASABKAIEQQFyNgIEDAELIAAgAkEBcSABckECcjYCBCAAIAFqIgEgCUEDcjYCBCAAIAhqIgQgBCgCBEEBcjYCBCABIAkQjgELIAAhBgsgBguMDQEGfyAAIAFqIQICQAJAIAAoAgQiA0EBcQ0AIANBA3FFDQEgACgCACIDIAFqIQECQEEAKALwRiAAIANrIgBGDQBBACgC7EYhBAJAIANB/wFLDQAgACgCDCEFAkAgACgCCCIGIANBA3YiB0EDdEGExwBqIgNGDQAgBCAGSxoLAkAgBSAGRw0AQQBBACgC3EZBfiAHd3E2AtxGDAMLAkAgBSADRg0AIAQgBUsaCyAGIAU2AgwgBSAGNgIIDAILIAAoAhghBwJAAkAgACgCDCIGIABGDQACQCAEIAAoAggiA0sNACADKAIMIABHGgsgAyAGNgIMIAYgAzYCCAwBCwJAIABBFGoiAygCACIFDQAgAEEQaiIDKAIAIgUNAEEAIQYMAQsDQCADIQQgBSIGQRRqIgMoAgAiBQ0AIAZBEGohAyAGKAIQIgUNAAsgBEEANgIACyAHRQ0BAkACQCAAKAIcIgVBAnRBjMkAaiIDKAIAIABHDQAgAyAGNgIAIAYNAUEAQQAoAuBGQX4gBXdxNgLgRgwDCyAHQRBBFCAHKAIQIABGG2ogBjYCACAGRQ0CCyAGIAc2AhgCQCAAKAIQIgNFDQAgBiADNgIQIAMgBjYCGAsgACgCFCIDRQ0BIAZBFGogAzYCACADIAY2AhgMAQsgAigCBCIDQQNxQQNHDQBBACABNgLkRiACIANBfnE2AgQgACABQQFyNgIEIAIgATYCAA8LAkACQCACKAIEIgNBAnENAAJAQQAoAvRGIAJHDQBBACAANgL0RkEAQQAoAuhGIAFqIgE2AuhGIAAgAUEBcjYCBCAAQQAoAvBGRw0DQQBBADYC5EZBAEEANgLwRg8LAkBBACgC8EYgAkcNAEEAIAA2AvBGQQBBACgC5EYgAWoiATYC5EYgACABQQFyNgIEIAAgAWogATYCAA8LQQAoAuxGIQQgA0F4cSABaiEBAkACQCADQf8BSw0AIAIoAgwhBQJAIAIoAggiBiADQQN2IgJBA3RBhMcAaiIDRg0AIAQgBksaCwJAIAUgBkcNAEEAQQAoAtxGQX4gAndxNgLcRgwCCwJAIAUgA0YNACAEIAVLGgsgBiAFNgIMIAUgBjYCCAwBCyACKAIYIQcCQAJAIAIoAgwiBiACRg0AAkAgBCACKAIIIgNLDQAgAygCDCACRxoLIAMgBjYCDCAGIAM2AggMAQsCQCACQRRqIgMoAgAiBQ0AIAJBEGoiAygCACIFDQBBACEGDAELA0AgAyEEIAUiBkEUaiIDKAIAIgUNACAGQRBqIQMgBigCECIFDQALIARBADYCAAsgB0UNAAJAAkAgAigCHCIFQQJ0QYzJAGoiAygCACACRw0AIAMgBjYCACAGDQFBAEEAKALgRkF+IAV3cTYC4EYMAgsgB0EQQRQgBygCECACRhtqIAY2AgAgBkUNAQsgBiAHNgIYAkAgAigCECIDRQ0AIAYgAzYCECADIAY2AhgLIAIoAhQiA0UNACAGQRRqIAM2AgAgAyAGNgIYCyAAIAFBAXI2AgQgACABaiABNgIAIABBACgC8EZHDQFBACABNgLkRg8LIAIgA0F+cTYCBCAAIAFBAXI2AgQgACABaiABNgIACwJAIAFB/wFLDQAgAUEDdiIDQQN0QYTHAGohAQJAAkBBACgC3EYiBUEBIAN0IgNxDQBBACAFIANyNgLcRiABIQMMAQsgASgCCCEDCyABIAA2AgggAyAANgIMIAAgATYCDCAAIAM2AggPC0EAIQMCQCABQQh2IgVFDQBBHyEDIAFB////B0sNACAFIAVBgP4/akEQdkEIcSIDdCIFIAVBgOAfakEQdkEEcSIFdCIGIAZBgIAPakEQdkECcSIGdEEPdiAFIANyIAZyayIDQQF0IAEgA0EVanZBAXFyQRxqIQMLIABCADcCECAAQRxqIAM2AgAgA0ECdEGMyQBqIQUCQAJAAkBBACgC4EYiBkEBIAN0IgJxDQBBACAGIAJyNgLgRiAFIAA2AgAgAEEYaiAFNgIADAELIAFBAEEZIANBAXZrIANBH0YbdCEDIAUoAgAhBgNAIAYiBSgCBEF4cSABRg0CIANBHXYhBiADQQF0IQMgBSAGQQRxakEQaiICKAIAIgYNAAsgAiAANgIAIABBGGogBTYCAAsgACAANgIMIAAgADYCCA8LIAUoAggiASAANgIMIAUgADYCCCAAQRhqQQA2AgAgACAFNgIMIAAgATYCCAsLSgECfwJAEAkiASgCACICIABqIgBBf0oNABBRQTA2AgBBfw8LAkAgAD8AQRB0TQ0AIAAQBQ0AEFFBMDYCAEF/DwsgASAANgIAIAILkwQBA38CQCACQYDAAEkNACAAIAEgAhAGGiAADwsgACACaiEDAkACQCABIABzQQNxDQACQAJAIAJBAU4NACAAIQIMAQsCQCAAQQNxDQAgACECDAELIAAhAgNAIAIgAS0AADoAACABQQFqIQEgAkEBaiICIANPDQEgAkEDcQ0ACwsCQCADQXxxIgRBwABJDQAgAiAEQUBqIgVLDQADQCACIAEoAgA2AgAgAiABKAIENgIEIAIgASgCCDYCCCACIAEoAgw2AgwgAiABKAIQNgIQIAIgASgCFDYCFCACIAEoAhg2AhggAiABKAIcNgIcIAIgASgCIDYCICACIAEoAiQ2AiQgAiABKAIoNgIoIAIgASgCLDYCLCACIAEoAjA2AjAgAiABKAI0NgI0IAIgASgCODYCOCACIAEoAjw2AjwgAUHAAGohASACQcAAaiICIAVNDQALCyACIARPDQEDQCACIAEoAgA2AgAgAUEEaiEBIAJBBGoiAiAESQ0ADAIACwALAkAgA0EETw0AIAAhAgwBCwJAIANBfGoiBCAATw0AIAAhAgwBCyAAIQIDQCACIAEtAAA6AAAgAiABLQABOgABIAIgAS0AAjoAAiACIAEtAAM6AAMgAUEEaiEBIAJBBGoiAiAETQ0ACwsCQCACIANPDQADQCACIAEtAAA6AAAgAUEBaiEBIAJBAWoiAiADRw0ACwsgAAvzAgIDfwF+AkAgAkUNACACIABqIgNBf2ogAToAACAAIAE6AAAgAkEDSQ0AIANBfmogAToAACAAIAE6AAEgA0F9aiABOgAAIAAgAToAAiACQQdJDQAgA0F8aiABOgAAIAAgAToAAyACQQlJDQAgAEEAIABrQQNxIgRqIgMgAUH/AXFBgYKECGwiATYCACADIAIgBGtBfHEiBGoiAkF8aiABNgIAIARBCUkNACADIAE2AgggAyABNgIEIAJBeGogATYCACACQXRqIAE2AgAgBEEZSQ0AIAMgATYCGCADIAE2AhQgAyABNgIQIAMgATYCDCACQXBqIAE2AgAgAkFsaiABNgIAIAJBaGogATYCACACQWRqIAE2AgAgBCADQQRxQRhyIgVrIgJBIEkNACABrSIGQiCGIAaEIQYgAyAFaiEBA0AgASAGNwMYIAEgBjcDECABIAY3AwggASAGNwMAIAFBIGohASACQWBqIgJBH0sNAAsLIAALHQACQEEAKALMSg0AQQAgATYC0EpBACAANgLMSgsLBAAjAAsSAQF/IwAgAGtBcHEiASQAIAELBgAgACQACwYAIABAAAsNACABIAIgAyAAEQkACw0AIAEgAiADIAARAgALCQAgASAAEQAACxMAIAEgAiADIAQgBSAGIAARDAALCwAgASACIAARBAALJAEBfiAAIAEgAq0gA61CIIaEIAQQlwEhBSAFQiCIpxAHIAWnCxMAIAAgAacgAUIgiKcgAiADEAgLC+pCAwBBgAgL6Bo8P3htbCB2ZXJzaW9uPSIxLjAiIHN0YW5kYWxvbmU9Im5vIj8+ADwhRE9DVFlQRSBzdmcgUFVCTElDICItLy9XM0MvL0RURCBTVkcgMjAwMTA5MDQvL0VOIgAgImh0dHA6Ly93d3cudzMub3JnL1RSLzIwMDEvUkVDLVNWRy0yMDAxMDkwNC9EVEQvc3ZnMTAuZHRkIj4APHN2ZyB2ZXJzaW9uPSIxLjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIAIHdpZHRoPSIlZiIgaGVpZ2h0PSIlZiIgdmlld0JveD0iMCAwICVmICVmIgAgcHJlc2VydmVBc3BlY3RSYXRpbz0ieE1pZFlNaWQgbWVldCI+ADxnIHRyYW5zZm9ybT0iAHRyYW5zbGF0ZSglZiwlZikgAHNjYWxlKCVmLCVmKSIgAGZpbGw9IiMwMDAwMDAiIHN0cm9rZT0ibm9uZSI+ADwvZz4APC9zdmc+ADxwYXRoIGQ9IgAiLz4AIAB6AE0lLjFmICUuMWYATSVsZCAlbGQAbSUuMWYgJS4xZgBtJWxkICVsZABsJS4xZiAlLjFmAGwlbGQgJWxkAGMlLjFmICUuMWYgJS4xZiAlLjFmICUuMWYgJS4xZgBjJWxkICVsZCAlbGQgJWxkICVsZCAlbGQAJXMAAAAAAAAAAAAAAAAAAAAAAQEAAQABAQABAQAAAQEBAAAAAQEBAAEAAQEAAQAAAAAAAAEBAQABAQAAAQAAAAAAAQAAAQEAAAABAAEBAQEBAQABAQEBAQEBAAEBAAEBAQEAAQAAAAEBAAAAAAEAAQEAAAEBAQAAAQABAQEBAQEBAQEBAQABAAAAAAAAAQABAAEAAQAAAQAAAQABAQEAAQAAAAABAAAAAAAAAQABAAEAAQAAAQEAAQAAAAAAAAEAAAAAAQEBAQABAQAAAQEAAAEBAAEBAAAAAQEBAQABAAAAAAEAAQEBAAAAAQABAQAAAQEBAAEAAAEBAAABAQEAAAEBAQAAAAABAAEAAQABAAEAdHJhY2UgZXJyb3I6ICVzCgBwYWdlX3N2ZyBlcnJvcjogJXMKAAAAAAAAAAAAAAAAGRJEOwI/LEcUPTMwChsGRktFNw9JDo4XA0AdPGkrNh9KLRwBICUpIQgMFRYiLhA4Pgs0MRhkdHV2L0EJfzkRI0MyQomKiwUEJignDSoeNYwHGkiTE5SVAAAAAAAAAAAASWxsZWdhbCBieXRlIHNlcXVlbmNlAERvbWFpbiBlcnJvcgBSZXN1bHQgbm90IHJlcHJlc2VudGFibGUATm90IGEgdHR5AFBlcm1pc3Npb24gZGVuaWVkAE9wZXJhdGlvbiBub3QgcGVybWl0dGVkAE5vIHN1Y2ggZmlsZSBvciBkaXJlY3RvcnkATm8gc3VjaCBwcm9jZXNzAEZpbGUgZXhpc3RzAFZhbHVlIHRvbyBsYXJnZSBmb3IgZGF0YSB0eXBlAE5vIHNwYWNlIGxlZnQgb24gZGV2aWNlAE91dCBvZiBtZW1vcnkAUmVzb3VyY2UgYnVzeQBJbnRlcnJ1cHRlZCBzeXN0ZW0gY2FsbABSZXNvdXJjZSB0ZW1wb3JhcmlseSB1bmF2YWlsYWJsZQBJbnZhbGlkIHNlZWsAQ3Jvc3MtZGV2aWNlIGxpbmsAUmVhZC1vbmx5IGZpbGUgc3lzdGVtAERpcmVjdG9yeSBub3QgZW1wdHkAQ29ubmVjdGlvbiByZXNldCBieSBwZWVyAE9wZXJhdGlvbiB0aW1lZCBvdXQAQ29ubmVjdGlvbiByZWZ1c2VkAEhvc3QgaXMgZG93bgBIb3N0IGlzIHVucmVhY2hhYmxlAEFkZHJlc3MgaW4gdXNlAEJyb2tlbiBwaXBlAEkvTyBlcnJvcgBObyBzdWNoIGRldmljZSBvciBhZGRyZXNzAEJsb2NrIGRldmljZSByZXF1aXJlZABObyBzdWNoIGRldmljZQBOb3QgYSBkaXJlY3RvcnkASXMgYSBkaXJlY3RvcnkAVGV4dCBmaWxlIGJ1c3kARXhlYyBmb3JtYXQgZXJyb3IASW52YWxpZCBhcmd1bWVudABBcmd1bWVudCBsaXN0IHRvbyBsb25nAFN5bWJvbGljIGxpbmsgbG9vcABGaWxlbmFtZSB0b28gbG9uZwBUb28gbWFueSBvcGVuIGZpbGVzIGluIHN5c3RlbQBObyBmaWxlIGRlc2NyaXB0b3JzIGF2YWlsYWJsZQBCYWQgZmlsZSBkZXNjcmlwdG9yAE5vIGNoaWxkIHByb2Nlc3MAQmFkIGFkZHJlc3MARmlsZSB0b28gbGFyZ2UAVG9vIG1hbnkgbGlua3MATm8gbG9ja3MgYXZhaWxhYmxlAFJlc291cmNlIGRlYWRsb2NrIHdvdWxkIG9jY3VyAFN0YXRlIG5vdCByZWNvdmVyYWJsZQBQcmV2aW91cyBvd25lciBkaWVkAE9wZXJhdGlvbiBjYW5jZWxlZABGdW5jdGlvbiBub3QgaW1wbGVtZW50ZWQATm8gbWVzc2FnZSBvZiBkZXNpcmVkIHR5cGUASWRlbnRpZmllciByZW1vdmVkAERldmljZSBub3QgYSBzdHJlYW0ATm8gZGF0YSBhdmFpbGFibGUARGV2aWNlIHRpbWVvdXQAT3V0IG9mIHN0cmVhbXMgcmVzb3VyY2VzAExpbmsgaGFzIGJlZW4gc2V2ZXJlZABQcm90b2NvbCBlcnJvcgBCYWQgbWVzc2FnZQBGaWxlIGRlc2NyaXB0b3IgaW4gYmFkIHN0YXRlAE5vdCBhIHNvY2tldABEZXN0aW5hdGlvbiBhZGRyZXNzIHJlcXVpcmVkAE1lc3NhZ2UgdG9vIGxhcmdlAFByb3RvY29sIHdyb25nIHR5cGUgZm9yIHNvY2tldABQcm90b2NvbCBub3QgYXZhaWxhYmxlAFByb3RvY29sIG5vdCBzdXBwb3J0ZWQAU29ja2V0IHR5cGUgbm90IHN1cHBvcnRlZABOb3Qgc3VwcG9ydGVkAFByb3RvY29sIGZhbWlseSBub3Qgc3VwcG9ydGVkAEFkZHJlc3MgZmFtaWx5IG5vdCBzdXBwb3J0ZWQgYnkgcHJvdG9jb2wAQWRkcmVzcyBub3QgYXZhaWxhYmxlAE5ldHdvcmsgaXMgZG93bgBOZXR3b3JrIHVucmVhY2hhYmxlAENvbm5lY3Rpb24gcmVzZXQgYnkgbmV0d29yawBDb25uZWN0aW9uIGFib3J0ZWQATm8gYnVmZmVyIHNwYWNlIGF2YWlsYWJsZQBTb2NrZXQgaXMgY29ubmVjdGVkAFNvY2tldCBub3QgY29ubmVjdGVkAENhbm5vdCBzZW5kIGFmdGVyIHNvY2tldCBzaHV0ZG93bgBPcGVyYXRpb24gYWxyZWFkeSBpbiBwcm9ncmVzcwBPcGVyYXRpb24gaW4gcHJvZ3Jlc3MAU3RhbGUgZmlsZSBoYW5kbGUAUmVtb3RlIEkvTyBlcnJvcgBRdW90YSBleGNlZWRlZABObyBtZWRpdW0gZm91bmQAV3JvbmcgbWVkaXVtIHR5cGUATm8gZXJyb3IgaW5mb3JtYXRpb24AAGASAAAtKyAgIDBYMHgAKG51bGwpAAAAAAAAAAAAAAAAAAAAABEACgAREREAAAAABQAAAAAAAAkAAAAACwAAAAAAAAAAEQAPChEREQMKBwABEwkLCwAACQYLAAALAAYRAAAAERERAAAAAAAAAAAAAAAAAAAAAAsAAAAAAAAAABEACgoREREACgAAAgAJCwAAAAkACwAACwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAMAAAAAAwAAAAACQwAAAAAAAwAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAAAAAAAAAAAAAADQAAAAQNAAAAAAkOAAAAAAAOAAAOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAA8AAAAADwAAAAAJEAAAAAAAEAAAEAAAEgAAABISEgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAASAAAAEhISAAAAAAAACQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACwAAAAAAAAAAAAAACgAAAAAKAAAAAAkLAAAAAAALAAALAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAAAwAAAAADAAAAAAJDAAAAAAADAAADAAAMDEyMzQ1Njc4OUFCQ0RFRi0wWCswWCAwWC0weCsweCAweABpbmYASU5GAG5hbgBOQU4ALgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD//////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQegiC4gDAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALCMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAAABgAAAFwjAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAD//////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQfAlC+QkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';
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




// STATICTOP = STATIC_BASE + 8704;
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
      return 9568;
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
 * @param turdsize suppress speckles of up to this many pixels.
 */
const defaultConfig = {
  colorFilter: (r, g, b, a) => a && 0.2126 * r + 0.7152 * g + 0.0722 * b < 128,
  transform: true,
  pathonly: false,
  turdsize: 2,
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
  let result = start(data, width, height, c.transform, c.pathonly, c.turdsize);

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
  ]);
}

export { loadFromCanvas, loadFromImageData };
