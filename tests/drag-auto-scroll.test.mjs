import test from "node:test";
import assert from "node:assert/strict";

import { dragAutoScrollSpeed } from "../public/drag-auto-scroll.mjs";

test("模块拖动靠近可视区边缘时渐进滚动", () => {
  const viewport = { top: 118, bottom: 900, edgeSize: 100, maxSpeed: 20 };
  assert.equal(dragAutoScrollSpeed(500, viewport), 0);
  assert.equal(dragAutoScrollSpeed(118, viewport), -20);
  assert.equal(dragAutoScrollSpeed(168, viewport), -10);
  assert.equal(dragAutoScrollSpeed(850, viewport), 10);
  assert.equal(dragAutoScrollSpeed(900, viewport), 20);
});

test("拖动自动滚动对无效视口参数安全降级", () => {
  assert.equal(dragAutoScrollSpeed(100, { top: 200, bottom: 100 }), 0);
  assert.equal(dragAutoScrollSpeed(Number.NaN, { top: 0, bottom: 900 }), 0);
});
