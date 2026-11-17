// Fork (ahx): values the region editor reads from files and from the nodes wired into it. Pure (no DOM, no
// ComfyUI imports), so it is tested headlessly (tests/web/sources.test.mjs).

const FOLDER_TYPES = ["input", "output", "temp"];
const ANNOTATION = /^(.*?)\s*\[(input|output|temp)\]$/;

/**
 * ComfyUI /view parameters {filename, subfolder, type} for an image name ("sub/name.png", optionally annotated
 * " [input]" / " [output]" / " [temp]" as ComfyUI does; else in `defaultType`). null for an empty name.
 */
export function parseImageRef(name, defaultType = "output") {
  let s = typeof name === "string" ? name.trim() : "";
  let type = FOLDER_TYPES.includes(defaultType) ? defaultType : "output";
  const m = ANNOTATION.exec(s);
  if (m) {
    s = m[1].trim();
    type = m[2];
  }
  s = s.replace(/\\/g, "/");
  if (!s) return null;
  const i = s.lastIndexOf("/");
  return { filename: i >= 0 ? s.slice(i + 1) : s, subfolder: i >= 0 ? s.slice(0, i) : "", type };
}

/** The /view path (with query) for an image {filename, subfolder, type}. */
export function viewPath(ref) {
  const q = (v) => encodeURIComponent(v ?? "");
  return `/view?filename=${q(ref.filename)}&type=${q(ref.type || "output")}&subfolder=${q(ref.subfolder)}`;
}

/** The Background value for an image {filename, subfolder, type}: "sub/name.png", annotated outside the
 * output folder (the field's default). null without a file name. */
export function imageRefValue(img) {
  const name = typeof img?.filename === "string" ? img.filename : "";
  if (!name) return null;
  const sub = typeof img.subfolder === "string" && img.subfolder ? `${img.subfolder.replace(/\\/g, "/")}/` : "";
  const type = FOLDER_TYPES.includes(img.type) ? img.type : "output";
  return type === "output" ? `${sub}${name}` : `${sub}${name} [${type}]`;
}

/** The Background value for ComfyUI's /upload/image reply {name, subfolder, type} (input folder by default). */
export function uploadedRefName(reply) {
  return imageRefValue({ filename: reply?.name, subfolder: reply?.subfolder, type: reply?.type ?? "input" });
}

/** "Use the last generated image": the first saved image in an "executed" event's output, or null. Previews
 * (temp/) are skipped: ComfyUI empties temp/ on restart, so a saved workflow would lose its background. */
export function savedImageRef(output) {
  const images = Array.isArray(output?.images) ? output.images : [];
  const img = images.find((i) => i && i.type === "output" && typeof i.filename === "string" && i.filename);
  return img ? imageRefValue(img) : null;
}

/** Ids of every node downstream of `start`. getNode(id) and getLink(linkId) read the graph. */
export function downstreamIds(start, getNode, getLink) {
  const seen = new Set();
  const queue = [start];
  while (queue.length) {
    const n = queue.shift();
    for (const out of n?.outputs || []) {
      for (const lid of out?.links || []) {
        const t = getLink(lid)?.target_id;
        if (t == null || seen.has(t)) continue;
        seen.add(t);
        const tn = getNode(t);
        if (tn) queue.push(tn);
      }
    }
  }
  return seen;
}

/** File names from ComfyUI's /internal/files/<type> list ("name.png [output]"), without the annotation. */
export function stripAnnotations(list, type) {
  const tail = ` [${type}]`;
  return (Array.isArray(list) ? list : []).map((x) => {
    const s = String(x);
    return s.endsWith(tail) ? s.slice(0, -tail.length) : s;
  });
}

/** The image a Load Image style node (a string widget named "image"; files in input/ unless annotated) shows
 * without running; null for other nodes, whose image only exists after a run. */
export function imageWidgetRef(src) {
  const w = src?.widgets?.find?.((x) => x?.name === "image");
  return w && typeof w.value === "string" ? parseImageRef(w.value, "input") : null;
}

// ComfyUI's Resolution Selector (comfy_extras/nodes_resolution.py), so the canvas follows its widgets live.
const ASPECT_RATIOS = {
  "1:1 (Square)": [1, 1],
  "2:3 (Portrait Photo)": [2, 3],
  "3:2 (Photo)": [3, 2],
  "3:4 (Portrait Standard)": [3, 4],
  "4:3 (Standard)": [4, 3],
  "9:16 (Portrait Widescreen)": [9, 16],
  "16:9 (Widescreen)": [16, 9],
  "21:9 (Ultrawide)": [21, 9],
};

/** Python's round(): halves go to the even neighbour. */
function roundHalfEven(x) {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

/** [width, height] a Resolution Selector node outputs, computed exactly as its execute(); null if unreadable. */
export function resolutionSelectorSize(src) {
  const val = (name) => src?.widgets?.find?.((w) => w?.name === name)?.value;
  const ratio = ASPECT_RATIOS[val("aspect_ratio")];
  const mp = val("megapixels");
  const multiple = val("multiple") ?? 8; // the node's default, if its advanced widget isn't there
  if (!ratio || typeof mp !== "number" || !Number.isFinite(mp) || typeof multiple !== "number" || !(multiple > 0)) return null;
  const scale = Math.sqrt((mp * 1024 * 1024) / (ratio[0] * ratio[1]));
  return [roundHalfEven((ratio[0] * scale) / multiple) * multiple, roundHalfEven((ratio[1] * scale) / multiple) * multiple];
}

/** The number output `slot` of a node gives without running: a primitive (PrimitiveNode, or a single-output
 * node with a "value" widget such as Int) or a Resolution Selector; null when only a run knows it. */
export function liveNumber(src, slot = 0) {
  if (!src) return null;
  if (src.type === "ResolutionSelector") return resolutionSelectorSize(src)?.[slot] ?? null;
  let w = null;
  if (src.type === "PrimitiveNode") w = src.widgets?.[0];
  else if ((src.outputs || []).length === 1) w = src.widgets?.find?.((x) => x?.name === "value");
  const v = w?.value;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** A size from width_input / height_input as the node uses it: rounded down to whole 16 px cells, at least one. */
export function canvasSide(v) {
  return Math.max(16, Math.floor(v / 16) * 16);
}
