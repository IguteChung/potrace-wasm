#!/bin/bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

cd $DIR && emcc ./lib/*.c -Oz -s WASM=1 -s EXPORTED_FUNCTIONS='["_convert_svg"]' -s "EXTRA_EXPORTED_RUNTIME_METHODS=['cwrap']" -s "TOTAL_MEMORY=134217728" -s "TOTAL_STACK=67108864" -s "ALLOW_MEMORY_GROWTH=1" -o potrace.js