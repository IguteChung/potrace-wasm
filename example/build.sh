#!/bin/bash

emcc ../lib/*.c -s WASM=1 -s EXPORTED_FUNCTIONS='["_convert_svg"]' -s "EXTRA_EXPORTED_RUNTIME_METHODS=['cwrap']" -o potrace.js