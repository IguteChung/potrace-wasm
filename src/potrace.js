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
  let start = wrapStart();
  let ctx = canvas.getContext("2d");
  let imagedata = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let data = new Array(Math.ceil(imagedata.length / 32)).fill(0);

  for (i = 0; i < imagedata.length; i += 4) {
    let r = imagedata[i],
      g = imagedata[i + 1],
      b = imagedata[i + 2],
      a = imagedata[i + 3];

    let color = a ? 0.2126 * r + 0.7152 * g + 0.0722 * b : 255;
    if (color < 128) {
      // each number contains 8 pixels from rightmost bit.
      let index = Math.floor(i / 4);
      data[Math.floor(index / 8)] += 1 << index % 8;
    }
  }

  await ready();
  return start(data, canvas.width, canvas.height);
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
