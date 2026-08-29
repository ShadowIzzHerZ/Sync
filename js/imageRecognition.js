// ---------------------------------------------------------------------------
// Client-side image recognition for the report form.
//
// Honest scope: this runs MobileNet (a general 1000-class ImageNet
// classifier) entirely in the browser — nothing is uploaded anywhere for
// this step. There is no model trained specifically on "potholes"; instead
// we map the subset of ImageNet classes that plausibly correspond to civic
// infrastructure onto our report categories, and fall back to "Other" with
// a low-confidence flag when nothing matches. It's a real, on-device
// suggestion — treat it as an assist for the citizen filling out the form,
// not a certified detector.
// ---------------------------------------------------------------------------

let modelPromise = null;

function loadModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      const [tf, mobilenetModule] = await Promise.all([
        import("https://esm.sh/@tensorflow/tfjs@4.20.0"),
        import("https://esm.sh/@tensorflow-models/mobilenet@2.1.1?deps=@tensorflow/tfjs@4.20.0"),
      ]);
      await tf.ready();
      return mobilenetModule.load({ version: 2, alpha: 1.0 });
    })();
  }
  return modelPromise;
}

// ImageNet label keywords -> our category slugs.
const KEYWORD_TO_CATEGORY = [
  { slug: "pothole", keywords: ["manhole cover", "pothole", "crack"] },
  {
    slug: "garbage",
    keywords: ["ashcan", "trash", "garbage", "bin", "dumpster", "waste"],
  },
  {
    slug: "streetlight",
    keywords: ["street sign", "traffic light", "lamp", "pole", "streetlight"],
  },
  {
    slug: "water",
    keywords: ["fountain", "drain", "sewer", "puddle", "hydrant", "pipe"],
  },
];

function mapPredictionToCategory(predictions) {
  for (const pred of predictions) {
    const label = pred.className.toLowerCase();
    for (const { slug, keywords } of KEYWORD_TO_CATEGORY) {
      if (keywords.some((k) => label.includes(k))) {
        return { slug, label: pred.className, confidence: pred.probability };
      }
    }
  }
  const top = predictions[0];
  return {
    slug: "other",
    label: top?.className ?? "unknown",
    confidence: top?.probability ?? 0,
  };
}

/**
 * @param {HTMLImageElement} imgEl - already-loaded <img> pointing at the photo
 * @param {(status: string) => void} onProgress
 */
export async function classifyImage(imgEl, onProgress) {
  onProgress?.("loading-model");
  const model = await loadModel();
  onProgress?.("classifying");
  const predictions = await model.classify(imgEl, 5);
  onProgress?.("done");
  return {
    suggestion: mapPredictionToCategory(predictions),
    raw: predictions,
  };
}

// ---------------------------------------------------------------------------
// Severity estimate — an honest heuristic, not a measurement.
//
// There is no way to recover a real-world pothole width/depth from a single
// 2D photo without a reference object or a second camera angle (a solved-
// but-not-here problem). What we *can* do on-device and for free: look at
// how much of the frame is a large dark/shadowed void (a proxy for a deep
// hole) and how visually "rough" the frame is (a proxy for cracking/debris
// vs. a clean surface). Combined into a 1–3 Low/Medium/High score. Treat
// this as a triage nudge for prioritization, not a certified severity
// rating — the UI copy says as much.
// ---------------------------------------------------------------------------

/**
 * @param {HTMLImageElement} imgEl
 * @returns {{level:1|2|3, label:'Low'|'Medium'|'High', score:number, darkRatio:number, contrast:number}}
 */
export function estimateSeverity(imgEl) {
  const size = 96;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(imgEl, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  const pixelCount = size * size;
  let sum = 0;
  let sumSquares = 0;
  let darkCount = 0;
  const DARK_THRESHOLD = 60; // 0-255 luminance

  for (let i = 0; i < data.length; i += 4) {
    const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    sum += luminance;
    sumSquares += luminance * luminance;
    if (luminance < DARK_THRESHOLD) darkCount++;
  }

  const mean = sum / pixelCount;
  const variance = Math.max(sumSquares / pixelCount - mean * mean, 0);
  const contrast = Math.sqrt(variance); // 0-~128
  const darkRatio = darkCount / pixelCount; // 0-1

  // Weighted 0-100 blend: a large dark void matters more than raw contrast.
  const score = Math.round(Math.min(darkRatio * 60 + (contrast / 128) * 40, 100));

  let level, label;
  if (score >= 60) {
    level = 3;
    label = "High";
  } else if (score >= 30) {
    level = 2;
    label = "Medium";
  } else {
    level = 1;
    label = "Low";
  }

  return { level, label, score, darkRatio: Number(darkRatio.toFixed(3)), contrast: Number(contrast.toFixed(1)) };
}
