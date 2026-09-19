/**
 * Assertions about generated output that docs/CONTRACT.md does not promise.
 *
 * scripts/verify.mjs covers the contract. These cover the quality claims that
 * only live in code comments: that css/tokens.css is structurally sound, and
 * that the gamut mapping stays within the drift budget those comments state.
 * Both are the kind of thing a dependency upgrade can move silently, because
 * the contract would still pass.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Color from 'colorjs.io';

import { solveLightness, angularDist } from '../scripts/color.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFileSync(join(ROOT, f), 'utf8');

const css = read('css/tokens.css');
const spec = JSON.parse(read('data/spec.json'));
const paletteSource = read('data/palette.js');
const palette = JSON.parse(
  paletteSource.slice(paletteSource.indexOf('{'), paletteSource.lastIndexOf('}') + 1));

const named = obj => Object.entries(obj).filter(([k]) => !k.startsWith('$'));
const STEPS = Object.keys(spec.steps).filter(k => !k.startsWith('$'));

/** Every `--name: value;` declaration inside the block opened by `header`. */
function declarationsIn(header) {
  const start = css.indexOf(header);
  assert.notEqual(start, -1, `missing block: ${header}`);
  const open = css.indexOf('{', start);
  let depth = 0, end = open;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) { end = i; break; }
  }
  assert.ok(end > open, `unterminated block: ${header}`);
  const body = css.slice(open + 1, end);
  const out = new Map();
  for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out.set(name, value.trim());
  }
  return out;
}

/* ---------- tokens.css is structurally sound ------------------------------ */

test('tokens.css has balanced braces', () => {
  let depth = 0;
  for (const ch of css) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    assert.ok(depth >= 0, 'closing brace with no matching open');
  }
  assert.equal(depth, 0, 'unclosed block');
});

test('tokens.css declares the same tokens in :root and @theme', () => {
  // The @theme block is inert in browsers and :root is inert to Tailwind, so
  // the build emits both. A token reaching only one of them renders as nothing
  // in exactly one consumer, which is how the grid once shipped colorless.
  const root = declarationsIn(':root');
  const theme = declarationsIn('@theme');
  assert.deepEqual([...theme.keys()].sort(), [...root.keys()].sort(),
    'the two blocks must declare identical token names');
  for (const [name, value] of root) {
    assert.equal(theme.get(name), value, `${name} differs between blocks`);
  }
});

test('tokens.css carries one token per generated color', () => {
  const root = declarationsIn(':root');
  const expected = named(palette.scales)
    .flatMap(([scale, s]) => Object.keys(s.steps).map(step => `--color-${scale}-${step}`));
  assert.equal(expected.length, 242, 'the palette should still be 242 colors');
  for (const token of expected) assert.ok(root.has(token), `missing ${token}`);
});

test('tokens.css declares no empty or placeholder values', () => {
  for (const [name, value] of declarationsIn(':root')) {
    assert.notEqual(value, '', `${name} is empty`);
    assert.doesNotMatch(value, /undefined|NaN|null/, `${name} contains a placeholder: ${value}`);
  }
});

test('every oklch() literal in tokens.css parses', () => {
  const literals = css.match(/oklch\([^)]*\)/g) ?? [];
  assert.ok(literals.length >= 484, `expected at least 484 literals, found ${literals.length}`);
  for (const literal of literals) {
    assert.doesNotThrow(() => new Color(literal), `unparseable: ${literal}`);
  }
});

test('tokens.css has no dangling var() references', () => {
  const declared = new Set(declarationsIn(':root').keys());
  for (const [, ref] of css.matchAll(/var\(\s*(--[\w-]+)/g)) {
    assert.ok(declared.has(ref), `var(${ref}) points at a token that is not declared`);
  }
});

/* ---------- gamut mapping stays inside its drift budget -------------------
 * The build asks for an ideal OKLCH color and accepts whatever colorjs can fit
 * into sRGB. Chroma reduction is the intent, but colorjs finishes with a clip
 * pass that also moves hue. These bounds pin how far it may move, so a colorjs
 * upgrade that changes the mapping fails here rather than silently reshaping
 * the palette. dE-OK is reported in its native scale, where a JND is roughly
 * 0.02, not the ~1.0 of CIE Lab metrics.
 * ------------------------------------------------------------------------ */

/** Ideal vs sRGB-mapped, for every chromatic color, under the given method. */
function driftUnder(method) {
  let worstHue = { value: 0, at: null };
  let worstDeltaE = { value: 0, at: null };
  const lightnessByStep = new Map(STEPS.map(s => [s, []]));

  for (const [name, cfg] of named(spec.hues)) {
    for (const step of STEPS) {
      const l = solveLightness(spec.steps[step].contrastTarget);
      const c = spec.chromaEnvelope[step];
      const ideal = new Color('oklch', [l, c, cfg.angle]);
      // toGamut mutates in place, so the ideal needs its own instance.
      const work = new Color('oklch', [l, c, cfg.angle]);
      const mapped = work.inGamut('srgb') ? work : work.toGamut({ space: 'srgb', method });
      const [L, , H] = mapped.to('oklch').coords;

      const hue = angularDist(H || cfg.angle, cfg.angle);
      const deltaE = ideal.deltaE(mapped, 'OK');
      if (hue > worstHue.value) worstHue = { value: hue, at: `${name}-${step}` };
      if (deltaE > worstDeltaE.value) worstDeltaE = { value: deltaE, at: `${name}-${step}` };
      lightnessByStep.get(step).push(L);
    }
  }

  const lightnessSpread = Math.max(
    ...[...lightnessByStep.values()].map(ls => Math.max(...ls) - Math.min(...ls)));
  return { worstHue, worstDeltaE, lightnessSpread };
}

test('sRGB mapping keeps hue drift within budget', () => {
  const { worstHue } = driftUnder('oklch.c');
  assert.ok(worstHue.value <= 22,
    `worst hue drift ${worstHue.value.toFixed(2)}deg at ${worstHue.at}, budget 22`);
  assert.equal(worstHue.at, 'amber-950', 'the worst case should still be amber-950');
});

test('sRGB mapping keeps perceptual error within budget', () => {
  const { worstDeltaE } = driftUnder('oklch.c');
  assert.ok(worstDeltaE.value <= 0.1,
    `worst dE-OK ${worstDeltaE.value.toFixed(3)} at ${worstDeltaE.at}, budget 0.1`);
});

test('a step number means the same lightness across every hue', () => {
  // P6's tolerance, asserted here against the pre-rounding values.
  const { lightnessSpread } = driftUnder('oklch.c');
  assert.ok(lightnessSpread <= 0.012, `lightness spread ${lightnessSpread.toFixed(4)}, budget 0.012`);
});

test('oklch.c remains a better choice than the css mapping method', () => {
  // This is the measurement the method was chosen on. If an upgrade reverses
  // it, that is a decision to revisit, not a silent change.
  assert.ok(driftUnder('oklch.c').worstHue.value < driftUnder('css').worstHue.value,
    'css now drifts hue less than oklch.c');
});

/* ---------- the measured figures CONTRACT.md quotes in its non-promises ---
 * N1, N2 and N3 state ratios in prose. Nothing asserted them, and two of the
 * three had drifted from the data. Pinned here so the document and the
 * palette cannot disagree again. A spec change that moves these should
 * update docs/CONTRACT.md and this file together.
 * ------------------------------------------------------------------------ */

const chromatic = () => named(palette.scales).filter(([, s]) => s.kind === 'chromatic');
const SHORT_OF_AA = ['yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky'];

test('N1: seven hues, yellow through sky, fall short of 4.5:1 at step 600', () => {
  const short = chromatic().filter(([, s]) => s.steps['600'].contrastWhite < 4.5);
  assert.deepEqual(short.map(([n]) => n), SHORT_OF_AA);
  const ratios = short.map(([, s]) => s.steps['600'].contrastWhite);
  assert.equal(Math.min(...ratios), 4.09, 'N1 lower bound');
  assert.equal(Math.max(...ratios), 4.49, 'N1 upper bound');
});

test('N2: seven hues cap below AAA at step 700', () => {
  const short = chromatic().filter(([, s]) => s.steps['700'].contrastWhite < 7);
  assert.deepEqual(short.map(([n]) => n), SHORT_OF_AA);
  const ratios = short.map(([, s]) => s.steps['700'].contrastWhite);
  assert.equal(Math.min(...ratios), 6.42, 'N2 lower bound');
  assert.equal(Math.max(...ratios), 6.98, 'N2 upper bound');
});

test('N3: the decorative border step measures 1.70:1 on white', () => {
  assert.equal(palette.scales.gray.steps['300'].contrastWhite, 1.7);
});

test('no harmony collapses onto a duplicate or self-referential hue', () => {
  // scripts/build.mjs states this as an audited property and skips the
  // exclusion logic that a tighter hue spacing would need. Asserted here so
  // adding or moving a hue in the spec cannot quietly invalidate it.
  for (const [name, scale] of named(palette.scales)) {
    if (scale.kind !== 'chromatic') continue;
    const h = scale.harmonies;
    assert.ok(h, `${name} has no harmonies`);

    const [near, far] = h.analogous;
    const [split1, split2] = h.splitComplementary;
    const [tri1, tri2] = h.triadic;

    assert.notEqual(near.name, far.name, `${name} analogous names one hue twice`);
    assert.notEqual(split1.name, split2.name, `${name} split-complementary names one hue twice`);
    assert.notEqual(tri1.name, tri2.name, `${name} triadic names one hue twice`);
    assert.ok(![split1.name, split2.name].includes(h.complementary.name),
      `${name} split-complementary landed on its own complement, defeating the point`);

    for (const ref of [h.complementary, near, far, split1, split2, tri1, tri2]) {
      assert.notEqual(ref.name, name, `${name} is listed as its own harmony`);
    }
  }
});

test('the five gray families stay perceptually distinct', () => {
  const grays = named(palette.scales).filter(([, s]) => s.kind === 'gray').map(([n]) => n);
  assert.equal(grays.length, 5);
  const distances = [];
  for (let i = 0; i < grays.length; i++) {
    for (let j = i + 1; j < grays.length; j++) {
      distances.push(new Color(palette.scales[grays[i]].steps['600'].hex)
        .deltaE(new Color(palette.scales[grays[j]].steps['600'].hex), 'OK'));
    }
  }
  assert.equal(distances.length, 10, 'ten pairs across five families');
  assert.ok(Math.min(...distances) >= 0.008,
    `closest gray pair at step 600 is dE-OK ${Math.min(...distances).toFixed(4)}`);
});
