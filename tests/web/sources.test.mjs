// Fork (ahx): the region editor's Reference / background / size sources (web/sources.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { canvasSide, downstreamIds, imageRefValue, imageWidgetRef, liveNumber, liveText, parseImageRef, resolutionSelectorSize, savedImageRef, uploadedRefName, viewPath } from "../../web/sources.js";
import * as S from "../../web/state.js";

test("Follow last image takes the first saved image of a node's output, never a preview", () => {
  assert.equal(savedImageRef({ images: [{ filename: "moss_00007_.png", subfolder: "", type: "output" }] }), "moss_00007_.png");
  assert.equal(savedImageRef({ images: [{ filename: "img_00001_.png", subfolder: "MOSS Layout", type: "output" }] }), "MOSS Layout/img_00001_.png");
  assert.equal(savedImageRef({ images: [{ filename: "p.png", subfolder: "", type: "temp" }] }), null); // Preview Image
  assert.equal(savedImageRef({ moss_regional_lora: [{}] }), null);
  assert.equal(savedImageRef(undefined), null);
  // and the value finds the file again
  assert.deepEqual(parseImageRef(savedImageRef({ images: [{ filename: "a.png", subfolder: "x/y", type: "output" }] })), { filename: "a.png", subfolder: "x/y", type: "output" });
  assert.equal(imageRefValue({ filename: "t.png", subfolder: "", type: "temp" }), "t.png [temp]");
});

test("only images made downstream of this node are followed", () => {
  // 1 (this node) -> 2 (KSampler) -> 3 (VAE Decode) -> 4 (Save) ; 3 -> 5 (Preview) ; 6 (unrelated Save)
  const nodes = {
    1: { id: 1, outputs: [{ links: [10] }, { links: null }] },
    2: { id: 2, outputs: [{ links: [11] }] },
    3: { id: 3, outputs: [{ links: [12, 13] }] },
    4: { id: 4, outputs: [{ links: [] }] },
    5: { id: 5, outputs: [] },
    6: { id: 6, outputs: [{ links: [14] }] },
    7: { id: 7, outputs: [] },
  };
  const links = { 10: { target_id: 2 }, 11: { target_id: 3 }, 12: { target_id: 4 }, 13: { target_id: 5 }, 14: { target_id: 7 } };
  const down = downstreamIds(nodes[1], (id) => nodes[id], (id) => links[id]);
  assert.deepEqual([...down].sort(), [2, 3, 4, 5]);
  assert.equal(down.has(6), false);
});

test("the Follow last setting is saved with the workflow but never sent to the backend", () => {
  const text = JSON.stringify({ version: 2, regions: [], groups: [], editor: { grid_divisions: 3, snap: false, reference_image: "a.png", reference_follow: true } });
  const res = S.parseState(text);
  assert.equal(res.ok, true);
  assert.equal(JSON.parse(S.serializeState(res.state)).editor.reference_follow, true);
  assert.equal("editor" in JSON.parse(S.backendRegions(text)), false); // so following never re-runs the node
});

test("a file picked on the computer becomes a Reference value that finds the uploaded copy", () => {
  // ComfyUI's /upload/image reply; a different file with the same name comes back renamed
  assert.equal(uploadedRefName({ name: "pose (1).png", subfolder: "", type: "input" }), "pose (1).png [input]");
  assert.equal(uploadedRefName({ name: "a.png", subfolder: "refs\\day", type: "input" }), "refs/day/a.png [input]");
  assert.equal(uploadedRefName({ name: "a.png", subfolder: "", type: "output" }), "a.png");
  assert.equal(uploadedRefName({ name: "a.png" }), "a.png [input]");
  assert.equal(uploadedRefName({ name: "" }), null);
  assert.equal(uploadedRefName(null), null);
  // and the stored value is read back from the same folder
  assert.deepEqual(parseImageRef(uploadedRefName({ name: "pose (1).png", subfolder: "", type: "input" })), { filename: "pose (1).png", subfolder: "", type: "input" });
});

const selector = (aspect_ratio, megapixels, multiple) => ({
  type: "ResolutionSelector",
  outputs: [{ name: "width" }, { name: "height" }],
  widgets: [{ name: "aspect_ratio", value: aspect_ratio }, { name: "megapixels", value: megapixels }, { name: "preview", value: null }, ...(multiple == null ? [] : [{ name: "multiple", value: multiple }])],
});

test("a Resolution Selector is computed exactly as ComfyUI computes it", () => {
  // the values its own preview shows: 21:9, 5 MP, multiple 16 -> 3504 x 1504
  assert.deepEqual(resolutionSelectorSize(selector("21:9 (Ultrawide)", 5, 16)), [3504, 1504]);
  assert.deepEqual(resolutionSelectorSize(selector("1:1 (Square)", 1, 8)), [1024, 1024]);
  assert.deepEqual(resolutionSelectorSize(selector("9:16 (Portrait Widescreen)", 1, 8)), [768, 1368]);
  // Python's round(): 1028 / 8 = 128.5 rounds to the even 128, not 129
  assert.deepEqual(resolutionSelectorSize(selector("1:1 (Square)", 1.0078277587890625, 8)), [1024, 1024]);
  // the advanced "multiple" widget absent: the node's default, 8
  assert.deepEqual(resolutionSelectorSize(selector("1:1 (Square)", 1, null)), [1024, 1024]);
  assert.equal(resolutionSelectorSize(selector("5:4 (Unknown)", 1, 8)), null);
});

test("each Resolution Selector output feeds its own side", () => {
  assert.equal(liveNumber(selector("21:9 (Ultrawide)", 5, 16), 0), 3504);
  assert.equal(liveNumber(selector("21:9 (Ultrawide)", 5, 16), 1), 1504);
});

test("a Reference name is looked for in the output folder unless annotated", () => {
  assert.deepEqual(parseImageRef("ComfyUI_00012_.png"), { filename: "ComfyUI_00012_.png", subfolder: "", type: "output" });
  assert.deepEqual(parseImageRef("runs/day 2/a.png"), { filename: "a.png", subfolder: "runs/day 2", type: "output" });
  assert.deepEqual(parseImageRef("runs\\a.png"), { filename: "a.png", subfolder: "runs", type: "output" });
  assert.deepEqual(parseImageRef("pose.png [input]"), { filename: "pose.png", subfolder: "", type: "input" });
  assert.deepEqual(parseImageRef("x.png [temp]"), { filename: "x.png", subfolder: "", type: "temp" });
  assert.deepEqual(parseImageRef("x.png [output]", "input"), { filename: "x.png", subfolder: "", type: "output" });
});

test("empty or non-string names give no reference", () => {
  for (const v of ["", "   ", " [output]", null, undefined, 3]) assert.equal(parseImageRef(v), null);
});

test("the /view path escapes every part", () => {
  assert.equal(viewPath({ filename: "a b&c.png", subfolder: "d/e", type: "output" }), "/view?filename=a%20b%26c.png&type=output&subfolder=d%2Fe");
  assert.equal(viewPath({ filename: "x.png", subfolder: "", type: "temp" }), "/view?filename=x.png&type=temp&subfolder=");
});

test("a Load Image node's file is shown live; other sources only after a run", () => {
  const load = { type: "LoadImage", widgets: [{ name: "image", value: "pose.png" }, { name: "upload", value: "image" }] };
  assert.deepEqual(imageWidgetRef(load), { filename: "pose.png", subfolder: "", type: "input" });
  const fromOutputs = { type: "LoadImageOutput", widgets: [{ name: "image", value: "ComfyUI_00003_.png [output]" }] };
  assert.deepEqual(imageWidgetRef(fromOutputs), { filename: "ComfyUI_00003_.png", subfolder: "", type: "output" });
  assert.equal(imageWidgetRef({ type: "VAEDecode", widgets: undefined }), null);
  assert.equal(imageWidgetRef(null), null);
});

test("a primitive's number is read live; computed sizes are not", () => {
  assert.equal(liveNumber({ type: "PrimitiveNode", outputs: [{}], widgets: [{ name: "INT", value: 1344 }] }), 1344);
  assert.equal(liveNumber({ type: "PrimitiveInt", outputs: [{}], widgets: [{ name: "value", value: 768 }] }), 768);
  // two outputs (width, height): which one is wired can't be told from a widget
  assert.equal(liveNumber({ type: "SomeResolution", outputs: [{}, {}], widgets: [{ name: "value", value: 5 }] }), null);
  assert.equal(liveNumber({ type: "PrimitiveInt", outputs: [{}], widgets: [{ name: "value", value: "12" }] }), null);
  assert.equal(liveNumber(null), null);
});

test("a text primitive's caption is read live; other text only after a run", () => {
  assert.equal(liveText({ type: "PrimitiveNode", outputs: [{}], widgets: [{ name: "STRING", value: "a scene" }] }), "a scene");
  assert.equal(liveText({ type: "PrimitiveStringMultiline", outputs: [{}], widgets: [{ name: "value", value: "two people" }] }), "two people");
  assert.equal(liveText({ type: "PrimitiveInt", outputs: [{}], widgets: [{ name: "value", value: 3 }] }), null);
  assert.equal(liveText({ type: "SomePromptWriter", outputs: [{}, {}], widgets: [{ name: "value", value: "x" }] }), null);
  assert.equal(liveText(null), null);
});

test("sizes from a socket round down to whole 16 px cells, like the node", () => {
  assert.equal(canvasSide(1000), 992);
  assert.equal(canvasSide(1024), 1024);
  assert.equal(canvasSide(5), 16);
});
