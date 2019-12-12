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
