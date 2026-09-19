# 🌈 Open Color Wheel

242 open-source UI colors in [OKLCH](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/oklch): 22 scales (5 gray families, 17 hues) of 11 steps each, numbered 50 to 950 like Tailwind v4. CI verifies every contrast promise on every commit.

[Live demo](https://slmzayat.github.io/open-color-wheel/)

## Usage

```html
<link rel="stylesheet" href="css/tokens.css">
```

```css
.button {
  background: var(--color-blue-solid);
  color: var(--color-blue-on-solid); /* computed per hue, never assumed white */
}
```

Dark mode needs no extra CSS. Roles use [`light-dark()`](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/light-dark), so setting `color-scheme` switches modes. `tokens.css` also emits a Tailwind v4 `@theme` block.

## Why

Open Color named its scales well but hand-picked its hex values, so contrast drifted from hue to hue. This project keeps the naming and generates the numbers. OKLCH holds perceptual lightness steady, so step 600 reads the same weight in red as in teal. `data/spec.json` holds every hand-authored number; everything else is built from it. Each color also carries P3 values, alpha approximations, [APCA](https://github.com/Myndex/apca-w3) scores, and harmonies snapped to real tokens.

## The contrast guarantee

Step 600 cannot reach 4.5:1 against white for every hue, because sRGB yellow loses its identity long before it gets that dark. So every hue ships an `on-solid` foreground that picks the better of black and white:

$$\text{contrast}_{\text{white}} \times \text{contrast}_{\text{black}} = 21$$

Because the two ratios multiply to 21, the better one never falls below $\sqrt{21} \approx 4.583$. Every `on-solid` pair clears WCAG AA. [`docs/CONTRACT.md`](docs/CONTRACT.md) lists the rest, including what this project deliberately does not promise.

## Development

```bash
npm install
npm run check     # rebuild from spec, then assert the contract
npm test          # unit tests for page logic
npm run fonts     # fetch and subset the web fonts
```

Edit `data/spec.json`, never `css/tokens.css` or `data/palette.js`. CI rebuilds and rejects any drift.

## Credits

[Open Color](https://github.com/yeun/open-color) by Heeyeun Joo (original palette), [Color.js](https://colorjs.io) by Lea Verou and Chris Lilley, [apca-w3](https://github.com/Myndex/apca-w3) by Andrew Somers, [Radix Colors](https://www.radix-ui.com/colors) and [Pantone](https://www.pantone.com) (interface), [Mona Sans, Hubot Sans](https://github.com/github/mona-sans) and [Monaspace](https://monaspace.githubnext.com/) by GitHub, [Material Design Icons](https://github.com/google/material-design-icons) by Google, [Emil Kowalski](https://github.com/emilkowalski/skills) (motion), and Claude Opus 5 by Anthropic (pair programming).

## License

Code and palette MIT. Fonts OFL-1.1. Icons Apache-2.0.
