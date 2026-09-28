/* Classic worker: MediaPipe loads its WASM glue through importScripts. All URLs local. */
var segmenter;
async function initialize() {
  var vision = await import('../../assets/photo-ai/vision_bundle.mjs');
  var files = await vision.FilesetResolver.forVisionTasks(new URL('../../assets/photo-ai/wasm', self.location.href).href);
  return vision.ImageSegmenter.createFromOptions(files, {
    baseOptions: { modelAssetPath: new URL('../../assets/photo-ai/selfie_multiclass.tflite', self.location.href).href, delegate: 'CPU' },
    runningMode: 'IMAGE', outputCategoryMask: false, outputConfidenceMasks: true
  });
}
self.onmessage = async function (event) {
  var bitmap = event.data.bitmap;
  try {
    segmenter = segmenter || await initialize();
    segmenter.segment(bitmap, function (result) {
      var masks = result.confidenceMasks, size = masks[0].width * masks[0].height;
      var arrays = masks.map(function (m) { return m.getAsFloat32Array(); });
      var skin = new Uint8Array(size), hair = new Uint8Array(size), background = new Uint8Array(size);
      for (var i = 0; i < size; i++) {
        skin[i] = Math.round(Math.min(1, arrays[2][i] + arrays[3][i]) * 255);
        hair[i] = Math.round(arrays[1][i] * 255); background[i] = Math.round(arrays[0][i] * 255);
      }
      self.postMessage({ w: masks[0].width, h: masks[0].height, skin: skin, hair: hair, background: background }, [skin.buffer, hair.buffer, background.buffer]);
    });
  } catch (e) { self.postMessage({ error: String(e.message || e) }); }
  finally { if (bitmap) bitmap.close(); }
};
