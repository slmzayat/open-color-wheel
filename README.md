# 🌈 Open Color Wheel

Open Color Wheel provides 242 open-source UI colors across 22 scales (5 gray families, 17 chromatic hues) authored in [OKLCH](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/oklch). Each scale contains 11 steps (50 to 950, aligning with Tailwind v4). The build pipeline verifies WCAG contrast targets on every commit.

[Live Demo](https://slmzayat.github.io/open-color-wheel/)

## Usage

```html
<link rel="stylesheet" href="css/tokens.css">
```

```css
.button {
  background: var(--color-blue-solid);
  color: var(--color-blue-on-solid); /* Computed per hue; never assumes white */
}
```

Dark mode requires no additional CSS. Color roles use [`light-dark()`](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/light-dark), so changing `color-scheme` toggles modes automatically. `tokens.css` also includes a Tailwind v4 `@theme` block for direct integration.

## Architecture

The original Open Color palette established effective naming conventions but relied on static, hand-picked hex values with unverified contrast targets. This project replaces static values with programmatic generation:

* **OKLCH Color Space:** Standardizes perceptual lightness across all hues for every step.
* **Automated Verification:** Build scripts validate contrast rules on every commit and exit non-zero on regression.
* **Single Source of Truth:** `data/spec.json` stores all hand-written parameters. A build script derives all generated files.

Each token includes P3 values, alpha masks for light and dark backgrounds, [APCA](https://github.com/Myndex/apca-w3) ratings, and dynamic color harmonies snapped to existing palette tokens.

## Contrast Guarantee

Step 600 cannot guarantee 4.5:1 contrast against white across all hues, because sRGB yellow loses its hue identity when darkened to that threshold.

Instead, every hue provides an `on-solid` foreground token that calculates the optimal contrast pairing between black and white:

$$\text{contrast}_{\text{white}} \times \text{contrast}_{\text{black}} = 21$$

Because the product equals 21, the lower-contrast option never drops below $\sqrt{21} \approx 4.583$, guaranteeing WCAG AA compliance for every `on-solid` pair.

Full promises, non-promises, and the stability policy are documented in [`docs/CONTRACT.md`](docs/CONTRACT.md).

## Development

```bash
npm install
npm run check     # Rebuilds from spec and verifies contrast rules
npm test          # Runs unit tests for page logic
npm run fonts     # Fetches and subsets web fonts
```

Do not edit `css/tokens.css`, `data/palette.json`, or `data/palette.js` directly. Modify `data/spec.json` and execute the build script. CI pipeline checks reject commits containing file drift.

## Repository Structure

| Path | Description |
| --- | --- |
| `data/spec.json` | Source of truth containing all input parameters |
| `data/palette.*` | Generated palette datasets with measured contrast values |
| `css/tokens.css` | Generated CSS custom properties |
| `css/site.css` | Documentation site styles |
| `index.html` | Documentation site markup |
| `scripts/` | Build, verification, and font pipeline scripts |
| `js/` | Modular application logic |
| `test/` | Unit tests for `js/lib.js` |
| `fonts/` | Generated Latin-subset WOFF2 font files and license text |
| `docs/CONTRACT.md` | Promises, non-promises, and stability policy |
| `.github/workflows/` | CI pipeline enforcing the contract |

## Credits

* [Open Color](https://github.com/yeun/open-color) by Heeyeun Joo (original palette structure)
* [Color.js](https://colorjs.io) by Lea Verou and Chris Lilley (color space transformations)
* [apca-w3](https://github.com/Myndex/apca-w3) by Andrew Somers (APCA contrast calculation)
* [Radix Colors](https://www.radix-ui.com/colors) (detail card architecture)
* [Pantone](https://www.pantone.com) (swatch layout design)
* [Mona Sans, Hubot Sans](https://github.com/github/mona-sans), and [Monaspace](https://monaspace.githubnext.com/) by GitHub (typography)
* [Material Design Icons](https://github.com/google/material-design-icons) by Google (iconography)
* [Emil Kowalski](https://github.com/emilkowalski/skills) (motion design standards)

## License

* Code and Palette: MIT
* Fonts: OFL-1.1
* Icons: Apache-2.0
