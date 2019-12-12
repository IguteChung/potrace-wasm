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
    STACK_BASE = 67118592,
    STACKTOP = STACK_BASE,
    STACK_MAX = 9728,
    DYNAMIC_BASE = 67118592,
    DYNAMICTOP_PTR = 9568;

assert(STACK_BASE % 16 === 0, 'stack must start aligned');
assert(DYNAMIC_BASE % 16 === 0, 'heap must start aligned');



var TOTAL_STACK = 67108864;
if (Module['TOTAL_STACK']) assert(TOTAL_STACK === Module['TOTAL_STACK'], 'the stack size can no longer be determined at runtime')

var INITIAL_TOTAL_MEMORY = Module['TOTAL_MEMORY'] || 134217728;if (!Object.getOwnPropertyDescriptor(Module, 'TOTAL_MEMORY')) Object.defineProperty(Module, 'TOTAL_MEMORY', { configurable: true, get: function() { abort('Module.TOTAL_MEMORY has been replaced with plain INITIAL_TOTAL_MEMORY') } });

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




var wasmBinaryFile = 'data:application/octet-stream;base64,AGFzbQEAAAAB8AEiYAF/AX9gA39/fwF/YAJ/fwF/YAJ/fwBgAX8AYAABf2ADf39/AGAFf39/f38Bf2ADf35/AX5gBH9/f38AYAR/f39/AX9gBn98f39/fwF/YAJ/fwF8YAN/f38BfGAAAGAFf39/f38AYAR/fn5/AGADf3x8AGACfn8Bf2AEf39/fwF8YAJ/fABgBH98f38AYAZ/fH9/f38AYAd/f39/f39/AX9gB39/f398f38Bf2AHf398f39/fwF/YAR/fn9/AX9gAn98AX9gA35/fwF/YAR/f35/AX5gAXwBfmAGf39/f39/AXxgAn5+AXxgAnx/AXwC2gELA2VudgRleGl0AAQDZW52Bl9fbG9jawAEA2VudghfX3VubG9jawAEDXdhc2lfdW5zdGFibGUIZmRfY2xvc2UAAA13YXNpX3Vuc3RhYmxlCGZkX3dyaXRlAAoDZW52FmVtc2NyaXB0ZW5fcmVzaXplX2hlYXAAAANlbnYVZW1zY3JpcHRlbl9tZW1jcHlfYmlnAAEDZW52C3NldFRlbXBSZXQwAAQNd2FzaV91bnN0YWJsZQdmZF9zZWVrAAcDZW52Bm1lbW9yeQIAgBADZW52BXRhYmxlAXAACgOXAZUBBQ4BAwEDAwMJAwMGBQQEBAIDAQAEAQcDAwQCAgEJAwMDAAIAAQIEAwIAAgQCAAAAAAQUGwICAQINDwwVDA0YBgwTEx8WDRERBQIABQICBQAEBAAAAAEFDgACCAEAAAABCAABBQIhAAEHFwYACQ8SHBIBCwMeCgEBAQICAAAQECAABAICAgMAAQEDBQAEAB0KAhkGBxoGEAJ/AUHgyoAgC38AQdTKAAsH8wEREV9fd2FzbV9jYWxsX2N0b3JzAAoGZmZsdXNoAFwEZnJlZQCKARBfX2Vycm5vX2xvY2F0aW9uAFEGbWFsbG9jAIkBBXN0YXJ0AC0Ic2V0VGhyZXcAkgEKX19kYXRhX2VuZAMBCXN0YWNrU2F2ZQCTAQpzdGFja0FsbG9jAJQBDHN0YWNrUmVzdG9yZQCVARBfX2dyb3dXYXNtTWVtb3J5AJYBDGR5bkNhbGxfamlqaQCcAQxkeW5DYWxsX2lpaWkAmAEKZHluQ2FsbF9paQCZAQ9keW5DYWxsX2lpZGlpaWkAmgELZHluQ2FsbF92aWkAmwEJDwEAQQELCWNk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ACE7QQQhPCADKAI0IT1BASE+ID0gPmohPyA/IDwQiwEhQCADIEA2AhwgQCFBIDshQiBBIEJGIUNBASFEIEMgRHEhRQJAIEVFDQAMAQtBACFGIAMgRjYCRAJAA0AgAygCRCFHIAMoAjQhSCBHIUkgSCFKIEkgSkghS0EBIUwgSyBMcSFNIE1FDQEgAygCSCFOIE4oAgghTyADKAJEIVBBASFRIFAgUWshUiADKAI0IVMgUiBTED0hVEECIVUgVCBVdCFWIE8gVmohVyBXKAIAIVhBASFZIFggWWshWiADKAI0IVsgWiBbED0hXCADIFw2AgQgAygCBCFdIAMoAkQhXiBdIV8gXiFgIF8gYEYhYUEBIWIgYSBicSFjAkAgY0UNACADKAJEIWRBASFlIGQgZWohZiADKAI0IWcgZiBnED0haCADIGg2AgQLIAMoAgQhaSADKAJEIWogaSFrIGohbCBrIGxIIW1BASFuIG0gbnEhbwJAAkAgb0UNACADKAI0IXAgAygCKCFxIAMoAkQhckECIXMgciBzdCF0IHEgdGohdSB1IHA2AgAMAQsgAygCBCF2IAMoAighdyADKAJEIXhBAiF5IHggeXQheiB3IHpqIXsgeyB2NgIACyADKAJEIXxBASF9IHwgfWohfiADIH42AkQMAAALAAtBACF/QQEhgAEgAyCAATYCQCADIH82AkQCQANAIAMoAkQhgQEgAygCNCGCASCBASGDASCCASGEASCDASCEAUghhQFBASGGASCFASCGAXEhhwEghwFFDQECQANAIAMoAkAhiAEgAygCKCGJASADKAJEIYoBQQIhiwEgigEgiwF0IYwBIIkBIIwBaiGNASCNASgCACGOASCIASGPASCOASGQASCPASCQAUwhkQFBASGSASCRASCSAXEhkwEgkwFFDQEgAygCRCGUASADKAIkIZUBIAMoAkAhlgFBAiGXASCWASCXAXQhmAEglQEgmAFqIZkBIJkBIJQBNgIAIAMoAkAhmgFBASGbASCaASCbAWohnAEgAyCcATYCQAwAAAsACyADKAJEIZ0BQQEhngEgnQEgngFqIZ8BIAMgnwE2AkQMAAALAAtBACGgASADIKABNgJEIAMgoAE2AkACQANAIAMoAkQhoQEgAygCNCGiASChASGjASCiASGkASCjASCkAUghpQFBASGmASCl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AUHXACEDIAJBAWoiAkHXAEcNAAwCAAsACyACIQMgAg0AQaAPIQQMAQtBoA8hAgNAIAItAAAhACACQQFqIgQhAiAADQAgBCECIANBf2oiAw0ACwsgBCABKAIUEFYLDAAgABBUKAK8ARBSCwQAEFcLBAAgAAsIACAAIAEQVQsFAEHsIgsEAEEBCwIACwIAC7sBAQV/QQAhAQJAIAAoAkxBAEgNACAAEFghAQsgABBaAkAgACgCAEEBcSICDQAQXyEDAkAgACgCNCIERQ0AIAQgACgCODYCOAsCQCAAKAI4IgVFDQAgBSAENgI0CwJAIAMoAgAgAEcNACADIAU2AgALEGALIAAQXCEDIAAgACgCDBEAACEEAkAgACgCYCIFRQ0AIAUQigELIAQgA3IhAwJAIAINACAAEIoBIAMPCwJAIAFFDQAgABBZCyADC6wBAQJ/AkACQCAARQ0AAkAgACgCTEF/Sg0AIAAQXQ8LIAAQWCEBIAAQXSECIAFFDQEgABBZIAIPC0EAIQICQEEAKALERkUNAEEAKALERhBcIQILAkAQXygCACIARQ0AA0BBACEBAkAgACgCTEEASA0AIAAQWCEBCwJAIAAoAhQgACgCHE0NACAAEF0gAnIhAgsCQCABRQ0AIAAQWQsgACgCOCIADQALCxBgCyACC2sBAn8CQCAAKAIUIAAoAhxNDQAgAEEAQQAgACgCJBEBABogACgCFA0AQX8PCwJAIAAoAgQiASAAKAIIIgJPDQAgACABIAJrrEEBIAAoAigRCAAaCyAAQQA2AhwgAEIANwMQIABCADcCBEEACycBAX8jAEEQayIDJAAgAyACNgIMIAAgASACEHohAiADQRBqJAAgAgsMAEHIxgAQAUHQxgALCABByMYAEAILLwECfyAAEF8iASgCADYCOAJAIAEoAgAiAkUNACACIAA2AjQLIAEgADYCABBgIAAL1QEBAn9BACECAkBBqAkQiQEiA0UNAAJAQQEQiQEiAg0AIAMQigFBAA8LIANBAEGoARCRARogAyABNgKUASADIAA2ApABIAMgA0GQAWo2AlQgAUEANgIAIANCADcCoAEgA0EANgKYASAAIAI2AgAgAyACNgKcASACQQA6AAAgA0F/NgI8IANBBDYCACADQf8BOgBLIANBgAg2AjAgAyADQagBajYCLCADQQE2AiggA0ECNgIkIANBAzYCDAJAQQAoAohGDQAgA0F/NgJMCyADEGEhAgsgAguMAQEBfyMAQRBrIgMkAAJAAkAgAkEDTw0AIAAoAlQhACADQQA2AgQgAyAAKAIINgIIIAMgACgCEDYCDEEAIANBBGogAkECdGooAgAiAmusIAFVDQBB/////wcgAmusIAFTDQAgACACIAGnaiICNgIIIAKtIQEMAQsQUUEcNgIAQn8hAQsgA0EQaiQAIAEL8AEBBH8gACgCVCEDAkACQCAAKAIUIAAoAhwiBGsiBUUNACAAIAQ2AhRBACEGIAAgBCAFEGQgBUkNAQsCQCADKAIIIgAgAmoiBCADKAIUIgVJDQACQCADKAIMIARBAWogBUEBdHJBAXIiABCMASIEDQBBAA8LIAMgBDYCDCADKAIAIAQ2AgAgAygCDCADKAIUIgRqQQAgACAEaxCRARogAyAANgIUIAMoAgghAAsgAygCDCAAaiABIAIQkAEaIAMgAygCCCACaiIANgIIAkAgACADKAIQSQ0AIAMgADYCEAsgAygCBCAANgIAIAIhBgsgBgsEAEEACwQAIAALCwAgACgCPBBmEAMLvgIBBn8jAEEgayIDJAAgAyAAKAIcIgQ2AhAgACgCFCEFIAMgAjYCHCADIAE2AhggAyAFIARrIgE2AhQgASACaiEGQQIhBSADQRBqIQEDfwJAAkAgACgCPCABIAUgA0EMahAEEIUBRQ0AQX8hBCADQX82AgwMAQsgAygCDCEECwJAAkACQCAGIARHDQAgACAAKAIsIgE2AhwgACABNgIUIAAgASAAKAIwajYCECACIQQMAQsgBEF/Sg0BQQAhBCAAQQA2AhwgAEIANwMQIAAgACgCAEEgcjYCACAFQQJGDQAgAiABKAIEayEECyADQSBqJAAgBA8LIAFBCGogASAEIAEoAgQiB0siCBsiASABKAIAIAQgB0EAIAgbayIHajYCACABIAEoAgQgB2s2AgQgBiAEayEGIAUgCGshBQwACwtKAQF/IwBBEGsiAyQAAkACQCAAKAI8IAEgAkH/AXEgA0EIahCdARCFAQ0AIAMpAwghAQwBC0J/IQEgA0J/NwMICyADQRBqJAAgAQsKACAAQVBqQQpJC6ECAQF/QQEhAwJAAkAgAEUNACABQf8ATQ0BAkACQBBsKAK8ASgCAA0AIAFBgH9xQYC/A0YNAxBRQRk2AgAMAQsCQCABQf8PSw0AIAAgAUE/cUGAAXI6AAEgACABQQZ2QcABcjoAAEECDwsCQAJAIAFBgLADSQ0AIAFBgEBxQYDAA0cNAQsgACABQT9xQYABcjoAAiAAIAFBDHZB4AFyOgAAIAAgAUEGdkE/cUGAAXI6AAFBAw8LAkAgAUGAgHxqQf//P0sNACAAIAFBP3FBgAFyOgADIAAgAUESdkHwAXI6AAAgACABQQZ2QT9xQYABcjoAAiAAIAFBDHZBP3FBgAFyOgABQQQPCxBRQRk2AgALQX8hAwsgAw8LIAAgAToAAEEBCwQAEFcLFAACQCAADQBBAA8LIAAgAUEAEGsLjgECAX8BfgJAIAC9IgNCNIinQf8PcSICQf8PRg0AAkAgAg0AAkACQCAARAAAAAAAAAAAYg0AQQAhAgwBCyAARAAAAAAAAPBDoiABEG4hACABKAIAQUBqIQILIAEgAjYCACAADwsgASACQYJ4ajYCACADQv////////+HgH+DQoCAgICAgIDwP4S/IQALIAALXAEBfyAAIAAtAEoiAUF/aiABcjoASgJAIAAoAgAiAUEIcUUNACAAIAFBIHI2AgBBfw8LIABCADcCBCAAIAAoAiwiATYCHCAAIAE2AhQgACABIAAoAjBqNgIQQQALxAEBBH8CQAJAIAIoAhAiAw0AQQAhBCACEG8NASACKAIQIQMLAkAgAyACKAIUIgVrIAFPDQAgAiAAIAEgAigCJBEBAA8LQQAhBgJAIAIsAEtBAEgNACABIQQDQCAEIgNFDQEgACADQX9qIgRqLQAAQQpHDQALIAIgACADIAIoAiQRAQAiBCADSQ0BIAEgA2shASAAIANqIQAgAigCFCEFIAMhBgsgBSAAIAEQkAEaIAIgAigCFCABajYCFCAGIAFqIQQLIAQLiQMBA38jAEHQAWsiBSQAIAUgAjYCzAFBACECIAVBoAFqQQBBKBCRARogBSAFKALMATYCyAECQAJAQQAgASAFQcgBaiAFQdAAaiAFQaABaiADIAQQckEATg0AQX8hAQwBCwJAIAAoAkxBAEgNACAAEFghAgsgACgCACEGAkAgACwASkEASg0AIAAgBkFfcTYCAAsgBkEgcSEGAkACQCAAKAIwRQ0AIAAgASAFQcgBaiAFQdAAaiAFQaABaiADIAQQciEBDAELIABB0AA2AjAgACAFQdAAajYCECAAIAU2AhwgACAFNgIUIAAoAiwhByAAIAU2AiwgACABIAVByAFqIAVB0ABqIAVBoAFqIAMgBBByIQEgB0UNACAAQQBBACAAKAIkEQEAGiAAQQA2AjAgACAHNgIsIABBADYCHCAAQQA2AhAgACgCFCEDIABBADYCFCABQX8gAxshAQsgACAAKAIAIgMgBnI2AgBBfyABIANBIHEbIQEgAkUNACAAEFkLIAVB0AFqJAAgAQubEgIPfwF+IwBB0ABrIgckACAHIAE2AkwgB0E3aiEIIAdBOGohCUEAIQpBACELQQAhAQJAA0ACQCALQQBIDQACQCABQf////8HIAtrTA0AEFFBPTYCAEF/IQsMAQsgASALaiELCyAHKAJMIgwhAQJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQCAMLQAAIg1FDQACQANAAkACQAJAIA1B/wFxIg0NACABIQ0MAQsgDUElRw0BIAEhDQNAIAEtAAFBJUcNASAHIAFBAmoiDjYCTCANQQFqIQ0gAS0AAiEPIA4hASAPQSVGDQALCyANIAxrIQECQCAARQ0AIAAgDCABEHMLIAENEiAHKAJMLAABEGohDkF/IRBBASENIAcoAkwhAQJAIA5FDQAgAS0AAkEkRw0AIAEsAAFBUGohEEEBIQpBAyENCyAHIAEgDWoiATYCTEEAIQ0CQAJAIAEsAAAiEUFgaiIPQR9NDQAgASEODAELIAEhDkEBIA90Ig9BidEEcUUNAANAIAcgAUEBaiIONgJMIA8gDXIhDSABLAABIhFBYGoiD0EfSw0BIA4hAUEBIA90Ig9BidEEcQ0ACwsCQAJAIBFBKkcNAAJAAkAgDiwAARBqRQ0AIAcoAkwiDi0AAkEkRw0AIA4sAAFBAnQgBGpBwH5qQQo2AgAgDkEDaiEBIA4sAAFBA3QgA2pBgH1qKAIAIRJBASEKDAELIAoNB0EAIQpBACESAkAgAEUNACACIAIoAgAiAUEEajYCACABKAIAIRILIAcoAkxBAWohAQsgByABNgJMIBJBf0oNAUEAIBJrIRIgDUGAwAByIQ0MAQsgB0HMAGoQdCISQQBIDQUgBygCTCEBC0F/IRMCQCABLQAAQS5HDQACQCABLQABQSpHDQACQCABLAACEGpFDQAgBygCTCIBLQADQSRHDQAgASwAAkECdCAEakHAfmpBCjYCACABLAACQQN0IANqQYB9aigCACETIAcgAUEEaiIBNgJMDAILIAoNBgJAAkAgAA0AQQAhEwwBCyACIAIoAgAiAUEEajYCACABKAIAIRMLIAcgBygCTEECaiIBNgJMDAELIAcgAUEBajYCTCAHQcwAahB0IRMgBygCTCEBC0EAIQ4DQCAOIQ9BfyEUIAEsAABBv39qQTlLDRQgByABQQFqIhE2AkwgASwAACEOIBEhASAOIA9BOmxqQY8dai0AACIOQX9qQQhJDQALIA5FDRMCQAJAAkACQCAOQRNHDQBBfyEUIBBBf0wNAQwXCyAQQQBIDQEgBCAQQQJ0aiAONgIAIAcgAyAQQQN0aikDADcDQAtBACEBIABFDRQMAQsgAEUNEiAHQcAAaiAOIAIgBhB1IAcoAkwhEQsgDUH//3txIhUgDSANQYDAAHEbIQ1BACEUQbAdIRAgCSEOIBFBf2osAAAiAUFfcSABIAFBD3FBA0YbIAEgDxsiAUGof2oiEUEgTQ0CAkACQAJAAkACQCABQb9/aiIPQQZNDQAgAUHTAEcNFSATRQ0BIAcoAkAhDgwDCyAPDgcJFAEUCQkJCQtBACEBIABBICASQQAgDRB2DAILIAdBADYCDCAHIAcpA0A+AgggByAHQQhqNgJAQX8hEyAHQQhqIQ4LQQAhAQJAA0AgDigCACIPRQ0BAkAgB0EEaiAPEG0iD0EASCIMDQAgDyATIAFrSw0AIA5BBGohDiATIA8gAWoiAUsNAQwCCwtBfyEUIAwNFQsgAEEgIBIgASANEHYCQCABDQBBACEBDAELQQAhDyAHKAJAIQ4DQCAOKAIAIgxFDQEgB0EEaiAMEG0iDCAPaiIPIAFKDQEgACAHQQRqIAwQcyAOQQRqIQ4gDyABSQ0ACwsgAEEgIBIgASANQYDAAHMQdiASIAEgEiABShshAQwSCyAHIAFBAWoiDjYCTCABLQABIQ0gDiEBDAAACwALIBEOIQgNDQ0NDQ0NDQINBAUCAgINBQ0NDQ0JBgcNDQMNCg0NCAgLIAshFCAADQ8gCkUNDUEBIQECQANAIAQgAUECdGooAgAiDUUNASADIAFBA3RqIA0gAiAGEHVBASEUIAFBAWoiAUEKRw0ADBEACwALQQEhFCABQQpPDQ8DQCAEIAFBAnRqKAIADQFBASEUIAFBCEshDSABQQFqIQEgDQ0QDAAACwALQX8hFAwOCyAAIAcrA0AgEiATIA0gASAFEQsAIQEMDAtBACEUIAcoAkAiAUG6HSABGyIMQQAgExCBASIBIAwgE2ogARshDiAVIQ0gASAMayATIAEbIRMMCQsgByAHKQNAPAA3QQEhEyAIIQwgCSEOIBUhDQwICwJAIAcpA0AiFkJ/VQ0AIAdCACAWfSIWNwNAQQEhFEGwHSEQDAYLAkAgDUGAEHFFDQBBASEUQbEdIRAMBgtBsh1BsB0gDUEBcSIUGyEQDAULIAcpA0AgCRB3IQxBACEUQbAdIRAgDUEIcUUNBSATIAkgDGsiAUEBaiATIAFKGyETDAULIBNBCCATQQhLGyETIA1BCHIhDUH4ACEBCyAHKQNAIAkgAUEgcRB4IQxBACEUQbAdIRAgDUEIcUUNAyAHKQNAUA0DIAFBBHZBsB1qIRBBAiEUDAMLQQAhASAPQf8BcSINQQdLDQUCQAJAAkACQAJAAkACQCANDggAAQIDBAwFBgALIAcoAkAgCzYCAAwLCyAHKAJAIAs2AgAMCgsgBygCQCALrDcDAAwJCyAHKAJAIAs7AQAMCAsgBygCQCALOgAADAcLIAcoAkAgCzYCAAwGCyAHKAJAIAusNwMADAULQQAhFEGwHSEQIAcpA0AhFgsgFiAJEHkhDAsgDUH//3txIA0gE0F/ShshDSAHKQNAIRYCQAJAIBMNACAWUEUNAEEAIRMgCSEMDAELIBMgCSAMayAWUGoiASATIAFKGyETCyAJIQ4LIABBICAUIA4gDGsiDyATIBMgD0gbIhFqIg4gEiASIA5IGyIBIA4gDRB2IAAgECAUEHMgAEEwIAEgDiANQYCABHMQdiAAQTAgESAPQQAQdiAAIAwgDxBzIABBICABIA4gDUGAwABzEHYMAQsLQQAhFAsgB0HQAGokACAUCxgAAkAgAC0AAEEgcQ0AIAEgAiAAEHAaCwtJAQN/QQAhAQJAIAAoAgAsAAAQakUNAANAIAAoAgAiAiwAACEDIAAgAkEBajYCACADIAFBCmxqQVBqIQEgAiwAARBqDQALCyABC8QCAAJAIAFBFEsNACABQXdqIgFBCUsNAAJAAkACQAJAAkACQAJAAkACQAJAIAEOCgABAgMEBQYHCAkACyACIAIoAgAiAUEEajYCACAAIAEoAgA2AgAPCyACIAIoAgAiAUEEajYCACAAIAE0AgA3AwAPCyACIAIoAgAiAUEEajYCACAAIAE1AgA3AwAPCyACIAIoAgBBB2pBeHEiAUEIajYCACAAIAEpAwA3AwAPCyACIAIoAgAiAUEEajYCACAAIAEyAQA3AwAPCyACIAIoAgAiAUEEajYCACAAIAEzAQA3AwAPCyACIAIoAgAiAUEEajYCACAAIAEwAAA3AwAPCyACIAIoAgAiAUEEajYCACAAIAExAAA3AwAPCyACIAIoAgBBB2pBeHEiAUEIajYCACAAIAEpAwA3AwAPCyAAIAIgAxEDAAsLfAECfyMAQYACayIFJAACQCACIANMDQAgBEGAwARxDQAgBSABIAIgA2siBEGAAiAEQYACSSIGGxCRARoCQCAGDQAgAiADayECA0AgACAFQYACEHMgBEGAfmoiBEH/AUsNAAsgAkH/AXEhBAsgACAFIAQQcwsgBUGAAmokAAsuAAJAIABQDQADQCABQX9qIgEgAKdBB3FBMHI6AAAgAEIDiCIAQgBSDQALCyABCzUAAkAgAFANAANAIAFBf2oiASAAp0EPcUGgIWotAAAgAnI6AAAgAEIEiCIAQgBSDQALCyABC4gBAgN/AX4CQAJAIABCgICAgBBaDQAgACEFDAELA0AgAUF/aiIBIAAgAEIKgCIFQgp+fadBMHI6AAAgAEL/////nwFWIQIgBSEAIAINAAsLAkAgBaciAkUNAANAIAFBf2oiASACIAJBCm4iA0EKbGtBMHI6AAAgAkEJSyEEIAMhAiAEDQALCyABCw4AIAAgASACQQdBCBBxC+kXAxB/An4BfCMAQbAEayIGJAAgBkEANgIsAkACQCABEH0iFkJ/VQ0AIAGaIgEQfSEWQQEhB0GwISEIDAELAkAgBEGAEHFFDQBBASEHQbMhIQgMAQtBtiFBsSEgBEEBcSIHGyEICwJAAkAgFkKAgICAgICA+P8Ag0KAgICAgICA+P8AUg0AIABBICACIAdBA2oiCSAEQf//e3EQdiAAIAggBxBzIABByyFBzyEgBUEFdkEBcSIKG0HDIUHHISAKGyABIAFiG0EDEHMgAEEgIAIgCSAEQYDAAHMQdgwBCwJAIAEgBkEsahBuIgEgAaAiAUQAAAAAAAAAAGENACAGIAYoAixBf2o2AiwLIAZBEGohCwJAIAVBIHIiDEHhAEcNACAIQQlqIAggBUEgcSINGyEOAkAgA0ELSw0AQQwgA2siCkUNAEQAAAAAAAAgQCEYA0AgGEQAAAAAAAAwQKIhGCAKQX9qIgoNAAsCQCAOLQAAQS1HDQAgGCABmiAYoaCaIQEMAQsgASAYoCAYoSEBCwJAIAYoAiwiCiAKQR91IgpqIApzrSALEHkiCiALRw0AIAZBMDoADyAGQQ9qIQoLIAdBAnIhDyAGKAIsIRAgCkF+aiIRIAVBD2o6AAAgCkF/akEtQSsgEEEASBs6AAAgBEEIcSESIAZBEGohEANAIBAhCgJAAkAgAZlEAAAAAAAA4EFjRQ0AIAGqIRAMAQtBgICAgHghEAsgCiAQQaAhai0AACANcjoAACABIBC3oUQAAAAAAAAwQKIhAQJAIApBAWoiECAGQRBqa0EBRw0AAkAgEg0AIANBAEoNACABRAAAAAAAAAAAYQ0BCyAKQS46AAEgCkECaiEQCyABRAAAAAAAAAAAYg0ACwJAAkAgA0UNACAQIAZBEGprQX5qIANODQAgAyALaiARa0ECaiEKDAELIAsgBkEQamsgEWsgEGohCgsgAEEgIAIgCiAPaiIJIAQQdiAAIA4gDxBzIABBMCACIAkgBEGAgARzEHYgACAGQRBqIBAgBkEQamsiEBBzIABBMCAKIBAgCyARayINamtBAEEAEHYgACARIA0QcyAAQSAgAiAJIARBgMAAcxB2DAELIANBAEghCgJAAkAgAUQAAAAAAAAAAGINACAGKAIsIRIMAQsgBiAGKAIsQWRqIhI2AiwgAUQAAAAAAACwQaIhAQtBBiADIAobIQ4gBkEwaiAGQdACaiASQQBIGyITIQ0DQAJAAkAgAUQAAAAAAADwQWMgAUQAAAAAAAAAAGZxRQ0AIAGrIQoMAQtBACEKCyANIAo2AgAgDUEEaiENIAEgCrihRAAAAABlzc1BoiIBRAAAAAAAAAAAYg0ACwJAAkAgEkEBTg0AIA0hCiATIRAMAQsgEyEQA0AgEkEdIBJBHUgbIRICQCANQXxqIgogEEkNACASrSEXQgAhFgNAIAogCjUCACAXhiAWQv////8Pg3wiFiAWQoCU69wDgCIWQoCU69wDfn0+AgAgCkF8aiIKIBBPDQALIBanIgpFDQAgEEF8aiIQIAo2AgALAkADQCANIgogEE0NASAKQXxqIg0oAgBFDQALCyAGIAYoAiwgEmsiEjYCLCAKIQ0gEkEASg0ACwsCQCASQX9KDQAgDkEZakEJbUEBaiEUIAxB5gBGIRUDQEEJQQAgEmsgEkF3SBshCQJAAkAgECAKSQ0AIBAgEEEEaiAQKAIAGyEQDAELQYCU69wDIAl2IRFBfyAJdEF/cyEPQQAhEiAQIQ0DQCANIA0oAgAiAyAJdiASajYCACADIA9xIBFsIRIgDUEEaiINIApJDQALIBAgEEEEaiAQKAIAGyEQIBJFDQAgCiASNgIAIApBBGohCgsgBiAGKAIsIAlqIhI2AiwgEyAQIBUbIg0gFEECdGogCiAKIA1rQQJ1IBRKGyEKIBJBAEgNAAsLQQAhDQJAIBAgCk8NACATIBBrQQJ1QQlsIQ1BCiESIBAoAgAiA0EKSQ0AA0AgDUEBaiENIAMgEkEKbCISTw0ACwsCQCAOQQAgDSAMQeYARhtrIA5BAEcgDEHnAEZxayISIAogE2tBAnVBCWxBd2pODQAgEkGAyABqIhJBCW0iCUECdCATakGEYGohEUEKIQMCQCASIAlBCWxrIhJBB0oNAANAIANBCmwhAyASQQdIIQkgEkEBaiESIAkNAAsLIBEoAgAiCSAJIANuIg8gA2xrIRICQAJAIBFBBGoiFCAKRw0AIBJFDQELRAAAAAAAAOA/RAAAAAAAAPA/RAAAAAAAAPg/IBIgA0EBdiIVRhtEAAAAAAAA+D8gFCAKRhsgEiAVSRshGEQBAAAAAABAQ0QAAAAAAABAQyAPQQFxGyEBAkAgB0UNACAILQAAQS1HDQAgGJohGCABmiEBCyARIAkgEmsiEjYCACABIBigIAFhDQAgESASIANqIg02AgACQCANQYCU69wDSQ0AA0AgEUEANgIAAkAgEUF8aiIRIBBPDQAgEEF8aiIQQQA2AgALIBEgESgCAEEBaiINNgIAIA1B/5Pr3ANLDQALCyATIBBrQQJ1QQlsIQ1BCiESIBAoAgAiA0EKSQ0AA0AgDUEBaiENIAMgEkEKbCISTw0ACwsgEUEEaiISIAogCiASSxshCgsCQANAAkAgCiISIBBLDQBBACEVDAILIBJBfGoiCigCAEUNAAtBASEVCwJAAkAgDEHnAEYNACAEQQhxIQ8MAQsgDUF/c0F/IA5BASAOGyIKIA1KIA1Be0pxIgMbIApqIQ5Bf0F+IAMbIAVqIQUgBEEIcSIPDQBBCSEKAkAgFUUNAEEJIQogEkF8aigCACIJRQ0AQQohA0EAIQogCUEKcA0AA0AgCkEBaiEKIAkgA0EKbCIDcEUNAAsLIBIgE2tBAnVBCWxBd2ohAwJAIAVBIHJB5gBHDQBBACEPIA4gAyAKayIKQQAgCkEAShsiCiAOIApIGyEODAELQQAhDyAOIAMgDWogCmsiCkEAIApBAEobIgogDiAKSBshDgsgDiAPciIMQQBHIQMCQAJAIAVBIHIiEUHmAEcNACANQQAgDUEAShshCgwBCwJAIAsgDSANQR91IgpqIApzrSALEHkiCmtBAUoNAANAIApBf2oiCkEwOgAAIAsgCmtBAkgNAAsLIApBfmoiFCAFOgAAIApBf2pBLUErIA1BAEgbOgAAIAsgFGshCgsgAEEgIAIgByAOaiADaiAKakEBaiIJIAQQdiAAIAggBxBzIABBMCACIAkgBEGAgARzEHYCQAJAAkACQCARQeYARw0AIAZBEGpBCHIhESAGQRBqQQlyIQ0gEyAQIBAgE0sbIgMhEANAIBA1AgAgDRB5IQoCQAJAIBAgA0YNACAKIAZBEGpNDQEDQCAKQX9qIgpBMDoAACAKIAZBEGpLDQAMAgALAAsgCiANRw0AIAZBMDoAGCARIQoLIAAgCiANIAprEHMgEEEEaiIQIBNNDQALAkAgDEUNACAAQdMhQQEQcwsgECASTw0BIA5BAUgNAQNAAkAgEDUCACANEHkiCiAGQRBqTQ0AA0AgCkF/aiIKQTA6AAAgCiAGQRBqSw0ACwsgACAKIA5BCSAOQQlIGxBzIA5Bd2ohCiAQQQRqIhAgEk8NAyAOQQlKIQMgCiEOIAMNAAwDAAsACwJAIA5BAEgNACASIBBBBGogFRshESAGQRBqQQhyIRMgBkEQakEJciESIBAhDQNAAkAgDTUCACASEHkiCiASRw0AIAZBMDoAGCATIQoLAkACQCANIBBGDQAgCiAGQRBqTQ0BA0AgCkF/aiIKQTA6AAAgCiAGQRBqSw0ADAIACwALIAAgCkEBEHMgCkEBaiEKAkAgDw0AIA5BAUgNAQsgAEHTIUEBEHMLIAAgCiASIAprIgMgDiAOIANKGxBzIA4gA2shDiANQQRqIg0gEU8NASAOQX9KDQALCyAAQTAgDkESakESQQAQdiAAIBQgCyAUaxBzDAILIA4hCgsgAEEwIApBCWpBCUEAEHYLIABBICACIAkgBEGAwABzEHYLIAZBsARqJAAgAiAJIAkgAkgbCysBAX8gASABKAIAQQ9qQXBxIgJBEGo2AgAgACACKQMAIAIpAwgQiAE5AwALBQAgAL0LuQEBAn8jAEGgAWsiBCQAIARBCGpB2CFBkAEQkAEaAkACQAJAIAFBf2pB/////wdJDQAgAQ0BIARBnwFqIQBBASEBCyAEIAA2AjQgBCAANgIcIARBfiAAayIFIAEgASAFSxsiATYCOCAEIAAgAWoiADYCJCAEIAA2AhggBEEIaiACIAMQeiEAIAFFDQEgBCgCHCIBIAEgBCgCGEZrQQA6AAAMAQsQUUE9NgIAQX8hAAsgBEGgAWokACAACzQBAX8gACgCFCIDIAEgAiAAKAIQIANrIgMgAyACSxsiAxCQARogACAAKAIUIANqNgIUIAILEAAgAEH/////ByABIAIQfguNAgEEfyACQQBHIQMCQAJAAkACQCACRQ0AIABBA3FFDQAgAUH/AXEhBANAIAAtAAAgBEYNAiAAQQFqIQAgAkF/aiICQQBHIQMgAkUNASAAQQNxDQALCyADRQ0BCyAALQAAIAFB/wFxRg0BAkACQCACQQRJDQAgAUH/AXFBgYKECGwhBCACQXxqIgMgA0F8cSIDayEFIAMgAGpBBGohBgNAIAAoAgAgBHMiA0F/cyADQf/9+3dqcUGAgYKEeHENAiAAQQRqIQAgAkF8aiICQQNLDQALIAUhAiAGIQALIAJFDQELIAFB/wFxIQMDQCAALQAAIANGDQIgAEEBaiEAIAJBf2oiAg0ACwtBAA8LIAALGgAgACABEIMBIgBBACAALQAAIAFB/wFxRhsL5AEBAn8CQAJAIAFB/wFxIgJFDQACQCAAQQNxRQ0AA0AgAC0AACIDRQ0DIAMgAUH/AXFGDQMgAEEBaiIAQQNxDQALCwJAIAAoAgAiA0F/cyADQf/9+3dqcUGAgYKEeHENACACQYGChAhsIQIDQCADIAJzIgNBf3MgA0H//ft3anFBgIGChHhxDQEgACgCBCEDIABBBGohACADQX9zIANB//37d2pxQYCBgoR4cUUNAAsLAkADQCAAIgMtAAAiAkUNASADQQFqIQAgAiABQf8BcUcNAAsLIAMPCyAAIAAQhAFqDwsgAAucAQEDfyAAIQECQAJAIABBA3FFDQACQCAALQAADQAgACEBDAILIAAhAQNAIAFBAWoiAUEDcUUNASABLQAARQ0CDAAACwALA0AgASICQQRqIQEgAigCACIDQX9zIANB//37d2pxQYCBgoR4cUUNAAsCQCADQf8BcQ0AIAIhAQwBCwNAIAItAAEhAyACQQFqIgEhAiADDQALCyABIABrCxUAAkAgAA0AQQAPCxBRIAA2AgBBfwtlAQF+AkACQAJAIANBwABxRQ0AIAIgA0FAaq2IIQFCACEEQgAhAgwBCyADRQ0BIAJBwAAgA2uthiABIAOtIgSIhCEBIAIgBIghAkIAIQQLIAQgAYQhAQsgACABNwMAIAAgAjcDCAtdAQF+AkACQAJAIANBwABxRQ0AIAEgA0FAaq2GIQJCACEBDAELIANFDQEgAUHAACADa62IIAIgA60iBIaEIQIgASAEhiEBCyACQgCEIQILIAAgATcDACAAIAI3AwgL6gMCAn8CfiMAQSBrIgIkAAJAAkAgAUL///////////8AgyIEQoCAgICAgMD/Q3wgBEKAgICAgIDAgLx/fFoNACAAQjyIIAFCBIaEIQQCQCAAQv//////////D4MiAEKBgICAgICAgAhUDQAgBEKBgICAgICAgMAAfCEFDAILIARCgICAgICAgIDAAHwhBSAAQoCAgICAgICACIVCAFINASAFQgGDIAV8IQUMAQsCQCAAUCAEQoCAgICAgMD//wBUIARCgICAgICAwP//AFEbDQAgAEI8iCABQgSGhEL/////////A4NCgICAgICAgPz/AIQhBQwBC0KAgICAgICA+P8AIQUgBEL///////+//8MAVg0AQgAhBSAEQjCIpyIDQZH3AEkNACACIAAgAUL///////8/g0KAgICAgIDAAIQiBEGB+AAgA2sQhgEgAkEQaiAAIAQgA0H/iH9qEIcBIAIpAwAiBEI8iCACQQhqKQMAQgSGhCEFAkAgBEL//////////w+DIAIpAxAgAkEQakEIaikDAIRCAFKthCIEQoGAgICAgICACFQNACAFQgF8IQUMAQsgBEKAgICAgICAgAiFQgBSDQAgBUIBgyAFfCEFCyACQSBqJAAgBSABQoCAgICAgICAgH+DhL8LizABC38jAEEQayIB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ZXJyb3IATm8gc3VjaCBkZXZpY2Ugb3IgYWRkcmVzcwBCbG9jayBkZXZpY2UgcmVxdWlyZWQATm8gc3VjaCBkZXZpY2UATm90IGEgZGlyZWN0b3J5AElzIGEgZGlyZWN0b3J5AFRleHQgZmlsZSBidXN5AEV4ZWMgZm9ybWF0IGVycm9yAEludmFsaWQgYXJndW1lbnQAQXJndW1lbnQgbGlzdCB0b28gbG9uZwBTeW1ib2xpYyBsaW5rIGxvb3AARmlsZW5hbWUgdG9vIGxvbmcAVG9vIG1hbnkgb3BlbiBmaWxlcyBpbiBzeXN0ZW0ATm8gZmlsZSBkZXNjcmlwdG9ycyBhdmFpbGFibGUAQmFkIGZpbGUgZGVzY3JpcHRvcgBObyBjaGlsZCBwcm9jZXNzAEJhZCBhZGRyZXNzAEZpbGUgdG9vIGxhcmdlAFRvbyBtYW55IGxpbmtzAE5vIGxvY2tzIGF2YWlsYWJsZQBSZXNvdXJjZSBkZWFkbG9jayB3b3VsZCBvY2N1cgBTdGF0ZSBub3QgcmVjb3ZlcmFibGUAUHJldmlvdXMgb3duZXIgZGllZABPcGVyYXRpb24gY2FuY2VsZWQARnVuY3Rpb24gbm90IGltcGxlbWVudGVkAE5vIG1lc3NhZ2Ugb2YgZGVzaXJlZCB0eXBlAElkZW50aWZpZXIgcmVtb3ZlZABEZXZpY2Ugbm90IGEgc3RyZWFtAE5vIGRhdGEgYXZhaWxhYmxlAERldmljZSB0aW1lb3V0AE91dCBvZiBzdHJlYW1zIHJlc291cmNlcwBMaW5rIGhhcyBiZWVuIHNldmVyZWQAUHJvdG9jb2wgZXJyb3IAQmFkIG1lc3NhZ2UARmlsZSBkZXNjcmlwdG9yIGluIGJhZCBzdGF0ZQBOb3QgYSBzb2NrZXQARGVzdGluYXRpb24gYWRkcmVzcyByZXF1aXJlZABNZXNzYWdlIHRvbyBsYXJnZQBQcm90b2NvbCB3cm9uZyB0eXBlIGZvciBzb2NrZXQAUHJvdG9jb2wgbm90IGF2YWlsYWJsZQBQcm90b2NvbCBub3Qgc3VwcG9ydGVkAFNvY2tldCB0eXBlIG5vdCBzdXBwb3J0ZWQATm90IHN1cHBvcnRlZABQcm90b2NvbCBmYW1pbHkgbm90IHN1cHBvcnRlZABBZGRyZXNzIGZhbWlseSBub3Qgc3VwcG9ydGVkIGJ5IHByb3RvY29sAEFkZHJlc3Mgbm90IGF2YWlsYWJsZQBOZXR3b3JrIGlzIGRvd24ATmV0d29yayB1bnJlYWNoYWJsZQBDb25uZWN0aW9uIHJlc2V0IGJ5IG5ldHdvcmsAQ29ubmVjdGlvbiBhYm9ydGVkAE5vIGJ1ZmZlciBzcGFjZSBhdmFpbGFibGUAU29ja2V0IGlzIGNvbm5lY3RlZABTb2NrZXQgbm90IGNvbm5lY3RlZABDYW5ub3Qgc2VuZCBhZnRlciBzb2NrZXQgc2h1dGRvd24AT3BlcmF0aW9uIGFscmVhZHkgaW4gcHJvZ3Jlc3MAT3BlcmF0aW9uIGluIHByb2dyZXNzAFN0YWxlIGZpbGUgaGFuZGxlAFJlbW90ZSBJL08gZXJyb3IAUXVvdGEgZXhjZWVkZWQATm8gbWVkaXVtIGZvdW5kAFdyb25nIG1lZGl1bSB0eXBlAE5vIGVycm9yIGluZm9ybWF0aW9uAABgEgAALSsgICAwWDB4AChudWxsKQAAAAAAAAAAAAAAAAAAAAARAAoAERERAAAAAAUAAAAAAAAJAAAAAAsAAAAAAAAAABEADwoREREDCgcAARMJCwsAAAkGCwAACwAGEQAAABEREQAAAAAAAAAAAAAAAAAAAAALAAAAAAAAAAARAAoKERERAAoAAAIACQsAAAAJAAsAAAsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAADAAAAAAMAAAAAAkMAAAAAAAMAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4AAAAAAAAAAAAAAA0AAAAEDQAAAAAJDgAAAAAADgAADgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAPAAAAAA8AAAAACRAAAAAAABAAABAAABIAAAASEhIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEgAAABISEgAAAAAAAAkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsAAAAAAAAAAAAAAAoAAAAACgAAAAAJCwAAAAAACwAACwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAMAAAAAAwAAAAACQwAAAAAAAwAAAwAADAxMjM0NTY3ODlBQkNERUYtMFgrMFggMFgtMHgrMHggMHgAaW5mAElORgBuYW4ATkFOAC4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEHoIguIAwEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACwjAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAAAAYAAABcIwAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAA//////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEHwJQvkJAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
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
 * This file will be inserted to generated output {@link potrace.js} when building the library.
 */

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
 *
 * @param {*} canvas to be converted for svg.
 */
async function loadFromCanvas(canvas) {
  await ready();
  let start = wrapStart();
  let ctx = canvas.getContext("2d");
  let imagedata = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return start(imagedata.data, canvas.width, canvas.height);
}

/**
 * @returns wrapped function for potrace run.
 */
function wrapStart() {
  return cwrap("start", "string", ["array", "number", "number"]);
}

// export the functions in server env.
if (typeof module !== "undefined") {
  module.exports = { loadFromCanvas };
}

