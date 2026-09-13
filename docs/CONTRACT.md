# The Open Color Wheel Contract

This document defines what Open Color Wheel guarantees, what it explicitly omits, and what constitutes a breaking change. All promises are validated by `scripts/verify.mjs` on every commit.

## Promises

* **P1 - Solid Pairing:** Every chromatic hue's `solid` step (600) achieves $\ge 4.5:1$ contrast against its hue-specific `on-solid` foreground.
* **P2 - Accent Text Contrast:** Every hue's step 700 achieves $\ge 4.5:1$ contrast against its step 50 background.
* **P3 - Gray AAA Compliance:** Every gray scale step 700 achieves $\ge 7:1$ contrast against white.
* **P4 - Chromatic AA Compliance:** Every chromatic hue step 700 achieves $\ge 4.5:1$ contrast against white.
* **P5 - Component Border Contrast:** `border-strong` achieves $\ge 3:1$ contrast (WCAG 1.4.11) in light and dark modes.
* **P6 - Portable Lightness Steps:** A step number represents identical lightness across all scales, within an OKLCH L tolerance of $\pm 0.012$.
* **P7 - Monotonic Progression:** Every scale darkens continuously from step 50 to step 950.

## Non-Promises

Explicit omissions prevent hidden design trade-offs and invalid assumptions.

* **N1 - Universal Step 600 Legibility on White:** Step 600 is not universally readable on white. Seven hues in the yellow-to-cyan range achieve $4.09\text{--}4.48:1$ against white due to sRGB boundaries. P1 resolves this by selecting the optimal calculated foreground per hue.
* **N2 - Chromatic AAA Standards:** Chromatic hues do not guarantee $7:1$ contrast. Six hues (lime, green, emerald, teal, cyan, sky) cap out at $6.4\text{--}6.7:1$ at step 700. Forcing AAA compliance on these hues would distort the shared lightness curve and violate P6.
* **N3 - Interactive Standard Borders:** Step 300 (`border`) yields a $1.70:1$ ratio and is strictly decorative (for dividers and grid lines). Interactive components must use `border-strong` (P5).
* **N4 - APCA Threshold Guarantees:** `apca.onWhite` and `apca.onBlack` scores use the reference `apca-w3` algorithm but carry no pass/fail assertions while W3C/AGWG APCA conformance criteria remain unfinalized.
* **N5 - Shipped P3 CSS Tokens:** Display P3 values exist in `data/palette.json` for tooling, but `css/tokens.css` exports sRGB-bounded `oklch()` values. Dynamic P3 custom properties are designated for the `vivid` mode release.
* **N6 - Mathematical Precision for Derived Alpha & Harmonies:** Alpha pairs (`alphaLight`, `alphaDark`) use least-squares approximations to match opaque steps over light/dark surfaces. Harmonies use nearest-neighbor angular matching across the 17 hue angles without enforcing tolerance caps.

## Stability & Versioning

Step numbers represent structural use cases (e.g., step 600 defines "solid fill"), allowing underlying color values to improve without breaking UI implementations.

### Major Changes (Breaking)

* Removing a scale or step.
* Reassigning a step's functional intent (`use` property in `spec.json`).
* Altering or deleting a role definition.
* Softening or removing any assertion listed in P1-P7.

### Minor/Patch Changes (Non-Breaking)

* Shifting Hex or OKLCH values resulting from generator refinements.
* Updating gamut-mapping algorithms.
* Introducing new scales, steps, roles, or export formats.
* Adding P3 or APCA data fields.
* Converting a non-promise into an enforced promise.

## Verification

Execute verification prior to CI merge:

```bash
npm run check

```

The process returns a non-zero exit code if any promise check fails.
