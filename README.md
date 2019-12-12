# potrace-wasm

[Potrace][potrace] Porting in Web Assembly.

[Online Demo][demo]

## Example

![image](https://github.com/IguteChung/potrace-wasm/blob/master/doc/kana.png)
![image](https://github.com/IguteChung/potrace-wasm/blob/master/doc/kana.svg)

## Usage

Add potrace-wasm dependency

```sh
npm install potrace-wasm
```

Call the helper methods

```sh
import { loadFromCanvas } from "potrace-wasm";

loadFromCanvas(imgCanvas)
    .then(svg => drawSVG(svg))
    .catch(err => console.log(err));
```

## Build from source

Install [emsdk][emsdk]

Build the wasm and js

```sh
npm run build
```

## License

The GNU General Public License version 2 (GPLv2).

[potrace]: http://potrace.sourceforge.net/
[demo]: https://igutechung.github.io/
[emsdk]: https://emscripten.org/docs/getting_started/downloads.html
