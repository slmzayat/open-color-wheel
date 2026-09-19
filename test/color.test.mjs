/**
 * Unit tests for scripts/color.mjs.
 *
 * npm run verify already asserts the finished palette against docs/CONTRACT.md,
 * but it only ever sees the 242 colors the spec happens to produce. These tests
 * cover the arithmetic itself, including inputs the spec never generates:
 * degenerate alpha solves, hue wraparound, gamut edges and out-of-range values.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Color from 'colorjs.io';

import {
  relLuminance, contrastVsWhite, contrastVsBlack, solveLightness,
  toSrgb, toP3, apcaOn, gamutBoundary, solveAlpha, alphaVariant,
  toCssAlphaHex, toCssAlphaP3, resolve, angularDist, nearestHue,
  WHITE, BLACK,
} from '../scripts/color.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const spec = JSON.parse(readFileSync(join(ROOT, 'data/spec.json'), 'utf8'));
const oklch = (l, c, h) => new Color('oklch', [l, c, h]);
const close = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);

/* ---------- WCAG luminance and contrast ---------------------------------- */

test('relLuminance anchors at the sRGB extremes', () => {
  close(relLuminance(oklch(1, 0, 0)), 1, 1e-6, 'white is 1.0');
  close(relLuminance(oklch(0, 0, 0)), 0, 1e-9, 'black is 0.0');
});

test('contrast against white and black inverts correctly', () => {
  close(contrastVsWhite(oklch(1, 0, 0)), 1, 1e-6, 'white on white');
  close(contrastVsBlack(oklch(1, 0, 0)), 21, 1e-6, 'white on black');
  close(contrastVsWhite(oklch(0, 0, 0)), 21, 1e-9, 'black on white');
  close(contrastVsBlack(oklch(0, 0, 0)), 1, 1e-9, 'black on black');
});

test('contrastWhite * contrastBlack === 21 for every color', () => {
  // The whole on-solid guarantee rests on this identity: because the product
  // is fixed, the better of the two ratios can never fall below sqrt(21).
  for (let l = 0; l <= 1.0001; l += 0.05) {
    for (const h of [0, 60, 140, 220, 300]) {
      const color = oklch(l, 0.1, h);
      const white = contrastVsWhite(color);
      const black = contrastVsBlack(color);
      close(white * black, 21, 1e-9, `L=${l.toFixed(2)} H=${h}`);
      assert.ok(Math.max(white, black) >= Math.sqrt(21) - 1e-9, `L=${l.toFixed(2)} H=${h} floor`);
    }
  }
});

test('relLuminance switches branches at the 0.04045 threshold', () => {
  const below = new Color('srgb', [0.04, 0.04, 0.04]);
  const above = new Color('srgb', [0.05, 0.05, 0.05]);
  close(relLuminance(below), 0.04 / 12.92, 1e-12, 'linear branch');
  close(relLuminance(above), ((0.05 + 0.055) / 1.055) ** 2.4, 1e-12, 'gamma branch');
  assert.ok(relLuminance(below) < relLuminance(above), 'monotonic across the seam');
});

/* ---------- lightness solver --------------------------------------------- */

test('solveLightness round-trips every contrast target in the spec', () => {
  for (const key of Object.keys(spec.steps).filter(k => !k.startsWith('$'))) {
    const target = spec.steps[key].contrastTarget;
    const actual = contrastVsWhite(oklch(solveLightness(target), 0, 0));
    close(actual, target, 1e-6, `step ${key}`);
  }
});

test('solveLightness is monotonic and hits both extremes', () => {
  close(solveLightness(1), 1, 1e-6, 'ratio 1 is white');
  close(solveLightness(21), 0, 1e-6, 'ratio 21 is black');
  let previous = Infinity;
  for (const target of [1.1, 2, 4.5, 7, 12, 21]) {
    const l = solveLightness(target);
    assert.ok(l < previous, `more contrast must mean less lightness (${target})`);
    previous = l;
  }
});

/* ---------- alpha solving ------------------------------------------------ */

test('solveAlpha returns 0 instead of NaN when foreground equals background', () => {
  const alpha = solveAlpha([0.5, 0.5, 0.5], WHITE, WHITE);
  assert.ok(Number.isFinite(alpha), 'must not divide by zero');
  assert.equal(alpha, 0);
});

test('solveAlpha solves the exactly-representable cases', () => {
  assert.equal(solveAlpha([0.5, 0.5, 0.5], WHITE, BLACK), 0.5);
  assert.equal(solveAlpha(BLACK, WHITE, BLACK), 0, 'target is the background');
  assert.equal(solveAlpha(WHITE, WHITE, BLACK), 1, 'target is the foreground');
});

test('solveAlpha clamps rather than extrapolating past the blend range', () => {
  assert.equal(solveAlpha([2, 2, 2], WHITE, BLACK), 1, 'beyond the foreground');
  assert.equal(solveAlpha([-1, -1, -1], WHITE, BLACK), 0, 'beyond the background');
});

test('solveAlpha ignores channels where foreground and background agree', () => {
  // Only the red channel carries information here; a naive per-channel average
  // would be dragged off by green and blue.
  assert.equal(solveAlpha([0.5, 0.9, 0.1], [1, 0, 0], BLACK), 0.5);
});

test('alphaVariant keeps gray families achromatic', () => {
  const target = [0.5, 0.5, 0.5];
  const onWhite = alphaVariant(target, WHITE, { isGray: true, l: 0.5, h: 0, space: 'srgb' });
  const onBlack = alphaVariant(target, BLACK, { isGray: true, l: 0.5, h: 0, space: 'srgb' });
  assert.deepEqual(onWhite.fg, BLACK, 'gray over white composites black');
  assert.deepEqual(onBlack.fg, WHITE, 'gray over black composites white');
  // A two-color blend is exactly solvable, so the composite must reproduce the target.
  for (let i = 0; i < 3; i++) {
    close(onWhite.alpha * onWhite.fg[i] + (1 - onWhite.alpha) * WHITE[i], target[i], 1e-12, `channel ${i}`);
  }
});

/* ---------- CSS serialization -------------------------------------------- */

test('toCssAlphaHex emits 8-digit hex with correct alpha rounding', () => {
  assert.equal(toCssAlphaHex(WHITE, 1), '#ffffffff');
  assert.equal(toCssAlphaHex(BLACK, 0), '#00000000');
  assert.equal(toCssAlphaHex(WHITE, 0.5), '#ffffff80');
  assert.match(toCssAlphaHex([0.2, 0.4, 0.6], 0.333), /^#[0-9a-f]{8}$/);
});

test('toCssAlphaP3 emits parseable display-p3 syntax', () => {
  assert.equal(toCssAlphaP3([1, 1, 1], 0.5), 'color(display-p3 1.000 1.000 1.000 / 0.500)');
  assert.doesNotThrow(() => new Color(toCssAlphaP3([0.2, 0.4, 0.6], 0.25)));
});

/* ---------- gamut mapping ------------------------------------------------ */

test('gamutBoundary stays inside the requested gamut', () => {
  for (const space of ['srgb', 'p3']) {
    for (let l = 0.1; l <= 0.9; l += 0.1) {
      for (const h of [0, 90, 180, 270]) {
        const coords = gamutBoundary(l, h, space);
        assert.equal(coords.length, 3);
        for (const v of coords) {
          assert.ok(Number.isFinite(v), `${space} L=${l.toFixed(1)} H=${h} produced ${v}`);
          assert.ok(v >= 0 && v <= 1, `${space} L=${l.toFixed(1)} H=${h} out of range: ${v}`);
        }
      }
    }
  }
});

test('P3 admits at least as much chroma as sRGB', () => {
  for (const h of [0, 60, 140, 200, 280]) {
    const wide = oklch(0.6, 0.35, h);
    const srgbChroma = toSrgb(wide).to('oklch').coords[1];
    const p3Chroma = toP3(wide).to('oklch').coords[1];
    assert.ok(srgbChroma <= p3Chroma + 1e-9, `hue ${h}: srgb ${srgbChroma} > p3 ${p3Chroma}`);
  }
});

test('toSrgb leaves already-in-gamut colors untouched', () => {
  const inside = oklch(0.6, 0.02, 200);
  assert.deepEqual(toSrgb(inside).to('oklch').coords, inside.to('oklch').coords);
});

/* ---------- APCA ---------------------------------------------------------- */

test('apcaOn returns finite scores at the channel extremes', () => {
  for (const bg of [[0, 0, 0], [255, 255, 255], [0, 255, 0]]) {
    const { onWhite, onBlack } = apcaOn(bg);
    assert.ok(Number.isFinite(onWhite) && Number.isFinite(onBlack), `NaN for ${bg}`);
  }
  assert.ok(apcaOn([255, 255, 255]).onWhite < 1, 'white on white is no contrast');
  assert.ok(apcaOn([0, 0, 0]).onWhite > 100, 'white on black is near maximum');
});

/* ---------- resolve, the integration point -------------------------------- */

test('resolve never emits NaN across the whole OKLCH working range', () => {
  // Regression guard: teal-600 once produced Lc NaN, because gamut mapping
  // returned a channel at -1.2e-14 and apca-w3 raises negatives to 2.4.
  for (let l = 0.05; l <= 0.98; l += 0.07) {
    for (const c of [0, 0.05, 0.15, 0.3]) {
      for (let h = 0; h < 360; h += 45) {
        const r = resolve(l, c, h);
        const label = `L=${l.toFixed(2)} C=${c} H=${h}`;
        assert.match(r.hex, /^#[0-9a-f]{6}$/, `${label} hex`);
        const numbers = [r.l, r.c, r.h, r.contrastWhite, r.contrastBlack,
          r.apca.onWhite, r.apca.onBlack, r.alphaLight.alpha, r.alphaDark.alpha,
          r.p3AlphaLight.alpha, r.p3AlphaDark.alpha];
        for (const n of numbers) assert.ok(Number.isFinite(n), `${label} produced ${n}`);
        close(r.contrastWhite * r.contrastBlack, 21, 0.2, `${label} identity survives rounding`);
      }
    }
  }
});

test('resolve emits CSS that parses back', () => {
  const r = resolve(0.6, 0.15, 250);
  for (const css of [r.oklch, r.p3, r.alphaLight.css, r.alphaDark.css, r.p3AlphaLight.css, r.p3AlphaDark.css]) {
    assert.doesNotThrow(() => new Color(css), `unparseable: ${css}`);
  }
});

/* ---------- harmonies ----------------------------------------------------- */

test('angularDist wraps around the 0/360 seam', () => {
  assert.equal(angularDist(0, 350), 10);
  assert.equal(angularDist(350, 0), 10, 'symmetric');
  assert.equal(angularDist(0, 180), 180);
  assert.equal(angularDist(0, 360), 0);
  assert.equal(angularDist(10, 400), 30, 'angles past one turn');
  assert.equal(angularDist(0, 540), 180, 'angles past 360 stay bounded');
  assert.equal(angularDist(-10, 10), 20, 'negative angles');
});

test('angularDist never exceeds a half turn', () => {
  for (let a = -720; a <= 720; a += 17) {
    for (let b = -720; b <= 720; b += 23) {
      const d = angularDist(a, b);
      assert.ok(d >= 0 && d <= 180, `angularDist(${a}, ${b}) = ${d}`);
    }
  }
});

test('nearestHue picks across the seam, not by raw numeric distance', () => {
  const hues = { crimson: { angle: 355 }, grass: { angle: 100 } };
  const found = nearestHue(hues, 5);
  assert.equal(found.name, 'crimson', '5deg is 10deg from 355, not 350');
  assert.equal(found.delta, 10);
});

test('nearestHue honours the exclusion and skips $comment keys', () => {
  const hues = { $comment: 'ignored', red: { angle: 25 }, blue: { angle: 260 } };
  assert.equal(nearestHue(hues, 25, 'red').name, 'blue', 'excluded hue cannot win');
  assert.equal(nearestHue(hues, 25).name, 'red', 'without exclusion the exact match wins');
});

test('nearestHue returns the true minimum over the real spec', () => {
  for (const [name, cfg] of Object.entries(spec.hues).filter(([k]) => !k.startsWith('$'))) {
    const target = cfg.angle + 180;
    const found = nearestHue(spec.hues, target, name);
    const best = Math.min(...Object.entries(spec.hues)
      .filter(([k]) => !k.startsWith('$') && k !== name)
      .map(([, c]) => angularDist(target, c.angle)));
    close(found.delta, best, 0.05, `complement of ${name}`);
    assert.notEqual(found.name, name, 'a hue is never its own complement');
  }
});
