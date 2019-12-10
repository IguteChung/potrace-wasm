# potrace-wasm

[Potrace][potrace] Porting in Web Assembly.

[Online Demo][demo]

## Example

![image](https://github.com/IguteChung/potrace-wasm/blob/master/doc/example.png)

## Usage

Build .wasm and js helper:

```sh
emcc ../lib/*.c -s WASM=1 -s EXPORTED_FUNCTIONS='["_convert_svg"]' -s "EXTRA_EXPORTED_RUNTIME_METHODS=['cwrap']" -o potrace.js
```

Call the `convert_svg` in browser with canvas:

```sh
let convertSVG = Module.cwrap("convert_svg", "string", ["array", "number", "number"]);
let svg = convertSVG(imagedata.data, imgCanvas.width, imgCanvas.height);
console.log(svg);
```

## License

The GNU General Public License version 2 (GPLv2).

[potrace]: http://potrace.sourceforge.net/
[demo]: https://igutechung.github.io/
