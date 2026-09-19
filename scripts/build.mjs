/**
 * Open Color Wheel — build
 *
 * Reads data/spec.json (the only hand-authored numbers in the repo) and emits:
 *   data/palette.js     — every resolved color with its measured contrast,
 *                         as a global that index.html and verify.mjs both read
 *   css/tokens.css      — the shippable custom properties
 *
 * Run: node scripts/build.mjs
 *
 * Nothing here is hand-tuned. If a color looks wrong, fix the spec, not the output.
 */

import Color from 'colorjs.io';
import { APCAcontrast, sRGBtoY } from 'apca-w3';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const spec = JSON.parse(readFileSync(join(ROOT, 'data/spec.json'), 'utf8'));

const STEPS = Object.keys(spec.steps).filter(k => !k.startsWith('$')).map(Number);

/* ---------- contrast helpers ---------------------------------------------
 * WCAG 2.x relative luminance. Deliberately hand-written rather than pulled
 * from a library: this is the number the whole project's promise rests on,
 * so it should be readable and auditable in place.
 * ------------------------------------------------------------------------ */

function relLuminance(color) {
  const [r, g, b] = color.to('srgb').coords;
  const lin = v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

const contrastVsWhite = c => 1.05 / (relLuminance(c) + 0.05);
const contrastVsBlack = c => (relLuminance(c) + 0.05) / 0.05;

/**
 * Solve for the OKLCH lightness whose achromatic color hits an exact WCAG
 * ratio against white. Binary search — monotonic, so it always converges.
 * Every hue reuses these lightness values, which is what makes a step number
 * mean the same thing across the whole palette.
 */
function solveLightness(targetRatio) {
  let lo = 0, hi = 1, mid = 0.5;
  for (let i = 0; i < 60; i++) {
    mid = (lo + hi) / 2;
    const ratio = contrastVsWhite(new Color('oklch', [mid, 0, 0]));
    if (ratio > targetRatio) lo = mid; else hi = mid;
  }
  return mid;
}

/**
 * Map into sRGB by reducing chroma, rather than clipping channels. Naive
 * clipping would move hue and lightness together and quietly break the "same
 * step means the same lightness everywhere" guarantee.
 *
 * "Reducing chroma only" is the intent, not quite the outcome: colorjs
 * finishes with a clip pass when chroma reduction alone leaves a colour a
 * hair outside the gamut, and that pass does move hue. Audited across all 187
 * chromatic colours, the worst drift is 20.97deg at amber-950 and 17.8deg at
 * blue-50 -- always at the ends of the ramp where chroma is lowest, so the
 * worst perceptual error it causes is dE-OK 1.44, barely above one JND.
 * CSS Color 4's own gamut mapping ("css") was measured as worse here: 26.65deg
 * drift and dE 1.68. Lightness is unaffected either way; the spread across
 * scales stays at 0.0102, inside the 0.012 that P6 promises.
 */
function toSrgb(color) {
  return color.inGamut('srgb')
    ? color
    : color.toGamut({ space: 'srgb', method: 'oklch.c' });
}

/** Same idea as toSrgb, mapping into the wider Display P3 gamut instead. */
function toP3(color) {
  return color.inGamut('p3')
    ? color
    : color.toGamut({ space: 'p3', method: 'oklch.c' });
}

/**
 * APCA (via apca-w3, the reference implementation licensed to W3C/AGWG — not
 * a hand-rolled approximation). Lc is signed by text-over-background polarity;
 * this project only ever asks "how well does white/black text read on this
 * swatch used as a background", so the sign is discarded and the magnitude is
 * reported. This is informational data, not a CONTRACT.md promise: WCAG 2.x
 * stays the sole basis for every promise until APCA's WCAG3 conformance
 * thresholds are finalized (see docs/CONTRACT.md, N4).
 */
function apcaOn(bgRgb255) {
  const bgY = sRGBtoY(bgRgb255);
  return {
    onWhite: +Math.abs(APCAcontrast(sRGBtoY([255, 255, 255]), bgY)).toFixed(1),
    onBlack: +Math.abs(APCAcontrast(sRGBtoY([0, 0, 0]), bgY)).toFixed(1),
  };
}

/**
 * Most saturated in-gamut color at a given OKLCH lightness/hue, in the given
 * space — i.e. the gamut boundary. Requesting an unreachably high chroma and
 * letting toGamut's binary search find the edge is simpler than deriving the
 * boundary analytically, and converges the same way regardless of the
 * starting chroma (tested at 0.5, far beyond any real gamut).
 */
function gamutBoundary(l, h, space) {
  const pushed = new Color('oklch', [l, 0.5, h]);
  const mapped = pushed.inGamut(space) ? pushed : pushed.toGamut({ space, method: 'oklch.c' });
  return mapped.to(space).coords.map(v => Math.min(1, Math.max(0, v)));
}

/**
 * Solve scalar alpha so that alpha*F + (1-alpha)*B best matches T across all
 * three channels (least squares — one alpha rarely satisfies R, G and B
 * exactly at once, which is why every alpha-scale approach, this one
 * included, is an approximation of the target color, not a reconstruction of
 * it).
 */
function solveAlpha(target, fg, bg) {
  let num = 0, den = 0;
  for (let i = 0; i < 3; i++) {
    const d = fg[i] - bg[i];
    num += d * (target[i] - bg[i]);
    den += d * d;
  }
  return den === 0 ? 0 : Math.min(1, Math.max(0, num / den));
}

const WHITE = [1, 1, 1];
const BLACK = [0, 0, 0];
const toHex255 = v => Math.round(v * 255).toString(16).padStart(2, '0');

/**
 * Alpha representation of a color: an {alpha, foreground} pair such that
 * compositing foreground-at-alpha over `bg` approximates `target`.
 *
 * Gray families are true achromatic (spec.json: "chroma 0 at every step") —
 * pushing them toward a saturated hue boundary would put color into a scale
 * that's promised to have none. For grays the foreground degenerates to pure
 * black/white, which makes the blend exact (a 2-color mix, solvable exactly)
 * rather than an approximation.
 */
function alphaVariant(target, bg, { isGray, l, h, space }) {
  const fg = isGray ? (bg === WHITE ? BLACK : WHITE) : gamutBoundary(l, h, space);
  const alpha = solveAlpha(target, fg, bg);
  return { alpha, fg };
}

function toCssAlphaHex(fg, alpha) {
  return `#${fg.map(toHex255).join('')}${toHex255(alpha)}`;
}

function toCssAlphaP3(fg, alpha) {
  return `color(display-p3 ${fg.map(v => v.toFixed(3)).join(' ')} / ${alpha.toFixed(3)})`;
}

function resolve(l, c, h, isGray = false) {
  const mapped = toSrgb(new Color('oklch', [l, c, h]));
  const [L, C, H] = mapped.to('oklch').coords;
  // A channel that belongs exactly on the gamut boundary (0 or 1) can come back
  // as e.g. -1.2e-14 from floating-point noise in the gamut mapping. WCAG's
  // luminance formula tolerates that silently (it falls into the linear branch
  // for small values), but apca-w3 does Math.pow(negative, 2.4) = NaN with no
  // such branch -- confirmed via teal-600, which otherwise resolved to a
  // nonsensical Lc 0 on both white and black. Clamping here fixes it at the
  // one place every downstream consumer (apca, alpha) reads from.
  const srgbCoords = mapped.to('srgb').coords.map(v => Math.min(1, Math.max(0, v)));
  const p3Color = toP3(new Color('oklch', [l, c, h])).to('p3');
  const p3Coords = p3Color.coords;

  const alphaLight = alphaVariant(srgbCoords, WHITE, { isGray, l, h, space: 'srgb' });
  const alphaDark = alphaVariant(srgbCoords, BLACK, { isGray, l, h, space: 'srgb' });
  const p3AlphaLight = alphaVariant(p3Coords, WHITE, { isGray, l, h, space: 'p3' });
  const p3AlphaDark = alphaVariant(p3Coords, BLACK, { isGray, l, h, space: 'p3' });

  return {
    oklch: `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${(H || 0).toFixed(1)})`,
    hex: mapped.to('srgb').toString({ format: 'hex' }),
    l: +L.toFixed(4), c: +C.toFixed(4), h: +(H || 0).toFixed(2),
    contrastWhite: +contrastVsWhite(mapped).toFixed(2),
    contrastBlack: +contrastVsBlack(mapped).toFixed(2),
    apca: apcaOn(srgbCoords.map(v => v * 255)),
    p3: p3Color.toString({ precision: 3 }),
    alphaLight: { alpha: +alphaLight.alpha.toFixed(3), css: toCssAlphaHex(alphaLight.fg, alphaLight.alpha) },
    alphaDark: { alpha: +alphaDark.alpha.toFixed(3), css: toCssAlphaHex(alphaDark.fg, alphaDark.alpha) },
    p3AlphaLight: { alpha: +p3AlphaLight.alpha.toFixed(3), css: toCssAlphaP3(p3AlphaLight.fg, p3AlphaLight.alpha) },
    p3AlphaDark: { alpha: +p3AlphaDark.alpha.toFixed(3), css: toCssAlphaP3(p3AlphaDark.fg, p3AlphaDark.alpha) },
  };
}

/* ---------- generate ----------------------------------------------------- */

const lightness = Object.fromEntries(
  STEPS.map(s => [s, solveLightness(spec.steps[String(s)].contrastTarget)])
);

const envelope = spec.chromaEnvelope;
const peakEnvelope = Math.max(...STEPS.map(s => envelope[String(s)]));

const scales = {};

// Gray families: same lightness curve, chroma scaled by the envelope shape
// so the tint peaks mid-ramp and fades at both ends.
for (const [name, cfg] of Object.entries(spec.grayFamilies)) {
  if (name.startsWith('$')) continue;
  scales[name] = { kind: 'gray', note: cfg.note, hue: cfg.hue, steps: {} };
  for (const s of STEPS) {
    const c = (envelope[String(s)] / peakEnvelope) * cfg.peakChroma;
    scales[name].steps[s] = resolve(lightness[s], c, cfg.hue, true);
  }
}

// Chromatic hues: full envelope, gamut-mapped per hue.
for (const [name, cfg] of Object.entries(spec.hues)) {
  if (name.startsWith('$')) continue;
  scales[name] = { kind: 'chromatic', angle: cfg.angle, origin: cfg.origin, steps: {} };
  for (const s of STEPS) {
    scales[name].steps[s] = resolve(lightness[s], envelope[String(s)], cfg.angle);
  }
}

/* ---------- the contract -------------------------------------------------
 * onSolid is COMPUTED, never authored. For any color, contrast-vs-white
 * multiplied by contrast-vs-black always equals 21, so the worse of the two
 * can never drop below sqrt(21) = 4.583. Picking the better foreground
 * therefore clears 4.5:1 for every hue, with no exceptions and no asterisks.
 * This is why the palette's promise is stated as a PAIRING, not as
 * "step 600 is readable on white" — which is false for 7 hues.
 * ------------------------------------------------------------------------ */

const solidStep = spec.roles.accent.solid.light;
for (const [name, scale] of Object.entries(scales)) {
  if (scale.kind !== 'chromatic') continue;
  const s = scale.steps[solidStep];
  scale.onSolid = s.contrastWhite >= s.contrastBlack ? 'white' : 'black';
  scale.onSolidContrast = Math.max(s.contrastWhite, s.contrastBlack);
}

/* ---------- harmonies -----------------------------------------------------
 * Snapped to existing palette hues, not floated free: a computed complement
 * is just a hex value, but one that resolves to an existing named scale
 * (e.g. "orange") is a token someone can actually ship, with a known
 * contrast story. Gray families have no hue, so they have no harmonies.
 * ------------------------------------------------------------------------ */

function angularDist(a, b) {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

function nearestHue(targetAngle, excludeName) {
  let best = null, bestDist = Infinity;
  for (const [name, cfg] of Object.entries(spec.hues)) {
    if (name.startsWith('$') || name === excludeName) continue;
    const dist = angularDist(targetAngle, cfg.angle);
    if (dist < bestDist) { bestDist = dist; best = name; }
  }
  return { name: best, delta: +bestDist.toFixed(1) };
}

for (const [name, scale] of Object.entries(scales)) {
  if (scale.kind !== 'chromatic') continue;
  scale.harmonies = {
    complementary: nearestHue(scale.angle + 180, name),
    analogous: [nearestHue(scale.angle + 30, name), nearestHue(scale.angle - 30, name)],
  };
}

/* No build timestamp here on purpose. The same spec has to produce a
 * byte-identical palette, because CI asserts exactly that with a
 * git diff --exit-code; a date field fails that check on any day after
 * the commit. Provenance lives in the git history, not in the artifact. */
const palette = {
  version: spec.version,
  steps: spec.steps,
  scales,
};

/* One data artifact, not two copies of the same numbers. It is a plain global
 * rather than JSON because index.html loads it with a classic <script src> and
 * js/app.js reads window.OCW_PALETTE synchronously -- fetch()-ing a local file
 * is blocked as cross-origin in every major browser, so a JSON-plus-fetch page
 * breaks the instant someone opens it with a double-click instead of a server.
 * scripts/verify.mjs parses this same file. It stays minified: it is the only
 * data payload the page downloads, and nothing reads it by hand. */
writeFileSync(join(ROOT, 'data/palette.js'), `window.OCW_PALETTE = ${JSON.stringify(palette)};\n`);

/* ---------- emit CSS ----------------------------------------------------- */

const grayNames = Object.keys(spec.grayFamilies).filter(k => !k.startsWith('$'));
const hueNames = Object.keys(spec.hues).filter(k => !k.startsWith('$'));
const bind = spec.roles.familyBinding;

const ref = (family, token) =>
  token === 'white' || token === 'black' ? token : `var(--color-${family}-${token})`;

let tokens = '';

for (const name of [...grayNames, ...hueNames]) {
  tokens += `\n  /* ${name} */\n`;
  for (const s of STEPS) {
    tokens += `  --color-${name}-${s}: ${scales[name].steps[s].oklch};\n`;
  }
}

tokens += `\n  /* ---- neutral roles (bound to "${bind}") ---- */\n`;
for (const [role, pair] of Object.entries(spec.roles.neutral)) {
  tokens += `  --color-${role}: light-dark(${ref(bind, pair.light)}, ${ref(bind, pair.dark)});\n`;
}

tokens += `\n  /* ---- accent roles ----\n`;
tokens += `   * on-solid is computed per hue: whichever of white/black actually\n`;
tokens += `   * clears 4.5:1 against that hue's solid step. Never assume white.\n`;
tokens += `   */\n`;
for (const name of hueNames) {
  const a = spec.roles.accent;
  tokens += `\n  --color-${name}-solid: var(--color-${name}-${a.solid.light});\n`;
  tokens += `  --color-${name}-on-solid: ${scales[name].onSolid}; /* ${scales[name].onSolidContrast.toFixed(2)}:1 */\n`;
  tokens += `  --color-${name}-text: light-dark(var(--color-${name}-${a.text.light}), var(--color-${name}-${a.text.dark}));\n`;
  tokens += `  --color-${name}-border: light-dark(var(--color-${name}-${a.border.light}), var(--color-${name}-${a.border.dark}));\n`;
}

/* ---------- the same tokens, twice ---------------------------------------
 * :root makes this plain, working CSS with no build step -- what the README
 * promises with a bare <link rel="stylesheet">. @theme is Tailwind v4's own
 * token syntax: inert in a browser on its own, but picked up by Tailwind's
 * build to also generate matching utility classes (bg-red-600 and so on) --
 * what "drop into a Tailwind v4 project with no class renaming" promises.
 * Shipping only @theme (as an earlier version of this file did) satisfies
 * neither claim in a plain browser: unknown at-rule bodies without a
 * selector are never applied as custom properties.
 * ------------------------------------------------------------------------ */
const css = `/* Open Color Wheel v${spec.version} — GENERATED by scripts/build.mjs. Do not edit.
 * Regenerate with: node scripts/build.mjs
 * Contract and stability policy: docs/CONTRACT.md
 */

:root {
  color-scheme: light dark;
${tokens}}

@theme {
${tokens}}
`;

writeFileSync(join(ROOT, 'css/tokens.css'), css);

const total = Object.keys(scales).length * STEPS.length;
console.log(`built ${Object.keys(scales).length} scales x ${STEPS.length} steps = ${total} colors`);
console.log(`  data/palette.js`);
console.log(`  css/tokens.css`);
