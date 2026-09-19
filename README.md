# 🌈 Open Color Wheel

242 open-source UI colors in [OKLCH](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/oklch): 22 scales of 11 steps, numbered 50 to 950 like Tailwind v4. Contrast is checked on every commit.

**[Live demo](https://slmzayat.github.io/open-color-wheel/)**

## Use it

```html
<link rel="stylesheet" href="css/tokens.css">
```

```css
.button {
  background: var(--color-blue-solid);
  color: var(--color-blue-on-solid);
}
```

`on-solid` is black or white, whichever reads better on that hue. The two ratios always multiply to 21, so the better one never drops below √21 ≈ 4.58 and every pair clears WCAG AA.

Dark mode needs no extra CSS. Roles use [`light-dark()`](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/light-dark), so setting `color-scheme` switches them. `tokens.css` also emits a Tailwind v4 `@theme` block.

## How it works

`data/spec.json` holds every hand-written number. The build derives the rest: each color with its P3 value, alpha approximations, [APCA](https://github.com/Myndex/apca-w3) score, and four harmony families snapped to real tokens.

Lightness comes from one shared curve, so a step number means the same lightness in every hue, within ΔL 0.012. [`docs/CONTRACT.md`](docs/CONTRACT.md) lists what is promised and what is not.

## Develop

Requires Node 22.

```bash
npm install
npm run check   # rebuild from spec, assert the contract
npm test        # unit tests
```

Edit `data/spec.json`, never `css/tokens.css` or `data/palette.js`. CI rejects drift.

## Credits

- Palette: [Open Color](https://github.com/yeun/open-color) by Heeyeun Joo
- Color math: [Color.js](https://colorjs.io), [apca-w3](https://github.com/Myndex/apca-w3)
- Type: [Mona Sans, Hubot Sans](https://github.com/github/mona-sans) and [Monaspace](https://monaspace.githubnext.com/) by GitHub
- Icons: [Material Design Icons](https://github.com/google/material-design-icons) by Google
- Interface: [Radix Colors](https://www.radix-ui.com/colors), [Pantone](https://www.pantone.com), motion by [Emil Kowalski](https://github.com/emilkowalski/skills)
- Built with Claude Opus 5 by Anthropic

[MIT](LICENSE) for code and palette, OFL-1.1 for fonts, Apache-2.0 for icons.
