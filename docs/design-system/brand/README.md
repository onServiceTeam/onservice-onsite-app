# onService PH logo

**Decision:** Ken, 2026-10-14. The onService PH logo is the house, the same one the phone app shows in its sign-in brand panel (`apps/mobile/src/components/AuthBrandPanel.tsx`). It replaces every "oS" letter mark, the old slate `#1B3A4B` app icon and splash, and the old favicons. One logo everywhere: customer screens, Service Provider screens, admin, favicons, the Android app icon and anything else.

The files in this folder are the source of truth. Every raster asset in the apps is drawn from them.

## The parts

1. **The house glyph.** The lucide "house" icon (lucide calls it `House`; `Home` is an alias for the same icon). Outline only, stroke width 2 on a 24-unit box, round caps and round joins.
2. **The tile.** A rounded square behind the house.
3. **The wordmark.** The words "onService PH" in one colour.

## Files

| File | What it is | Use it on |
|---|---|---|
| `onservice-mark-blue.svg` | `#003D9B` tile, white house | White or light backgrounds. Also the base for favicons. |
| `onservice-mark-white.svg` | White tile, `#003D9B` house | Brand blue or dark backgrounds: the sign-in brand panel, the splash screen. This is the version in Ken's screenshot. |
| `onservice-house-glyph.svg` | The house paths only, `stroke="currentColor"`, no tile | Places where the house sits on its own: the Android notification icon, and inline uses where the colour comes from the surrounding text. |

Rule of thumb: **the tile always contrasts with what is behind it.** Blue tile on light, white tile on blue or dark. The house is always the other colour.

## Colours

| Name | Hex | Notes |
|---|---|---|
| Brand blue | `#003D9B` | `color.brand.primary` in `../tokens.json`. In code: `BRAND_BLUE` in both apps' `BrandMark.tsx`. |
| White | `#FFFFFF` | In code: `BRAND_WHITE` in both apps' `BrandMark.tsx`. |

The logo colours in code are fixed values, not theme tokens. Today the phone app's `colors.primary` is the same blue, but a later theme change (the D41 plan rethemes the app and keeps `#003D9B` for the logo) must not recolour the logo or the wordmark, so neither reads the theme.

Nothing else goes in the mark. **No orange.** The orange accent (`#FE8A00`) is a UI accent, never part of the logo. **No slate or navy.** `#1B3A4B` was the old "oS" icon colour and is retired.

## Geometry

- Tile: 48 x 48 units, corner radius 6 (12.5% of the tile). In the phone app that is `borderRadius.md` on a 48 px tile.
- House in the SVG masters and the raster files drawn from them: the 24-unit lucide box is scaled 1.12x to 26.88 units (**56% of the tile**) and centred in the tile. Because the lucide drawing sits half a unit high inside its own box, the house reads slightly above centre. That is deliberate: it is optical centring.
- House on screens: the apps draw the house at **28/48 of the tile (58%)**, a 28 px icon in a 48 px tile. That is the size Ken approved in the phone app's sign-in panel, so it is kept on purpose, even though it is 1.12 px larger than the masters at 48 px. For other tile sizes the house is rounded so the gap on each side of it is a whole pixel: 24 px in the 40 px admin sidebar tile, not 23. An odd-sized house in an even-sized tile sits on half pixels and looks soft on a normal (100% scale) screen. `apps/admin/src/components/BrandMark.tsx` does this (UX-1400), and so does the phone app's `apps/mobile/src/components/BrandMark.tsx`, with the same formula.
- Stroke: always the lucide stroke of 2 units, scaled with the house (2.24 in the 48-unit masters, 2.33 for the 28 px house on screens). Never set an absolute stroke width.
- **Favicon cut** (16 to 48 px browser icons only): same tile, path and stroke, with the house box at **75%** of the tile. At that ratio every straight line of the house falls on whole pixels at 16, 32 and 48 px, so the tab icon is sharp instead of a blur. At 56% the 16 px icon was checked by eye and the house turned into a smudge.

## House path (do not redraw)

Copied unchanged from `node_modules/lucide-react/dist/esm/icons/house.js`, **lucide-react 0.456.0** (ISC licence). `lucide-react-native` 0.456.0 has the identical path, so the screens and the static files draw exactly the same house.

```
viewBox 0 0 24 24, fill none, stroke-width 2, round caps, round joins
M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8
M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z
```

In app code, use the `Home` icon from the shared icon module (`@/components/icons` in both apps). Do not paste the path into components, and do not swap in a different house icon. If lucide is upgraded and the path changes, update these SVGs and regenerate the raster assets in the same piece of work.

## Wordmark

- Text: **"onService PH"**. Use "onService" only where space is tight.
- **One colour.** White on blue or dark backgrounds; `#003D9B` on light ones, so the wordmark matches the tile next to it. Never two-tone (no "on" in one colour and "Service" in another), never a separate "PH" pill or badge, never orange. The phone app follows this everywhere (the desktop navigation rail moved from the ink text colour `#051A3E` to `#003D9B`, UX-1430). As of 2026-10-18 the admin sidebar and the admin compact sign-in header still draw it in the ink text colour; they should change to `#003D9B`.
- Bold system sans. The app sets weight 800 at 18 px next to a 48 px tile. The wide onboarding slides use 20 px, which counts as large text under WCAG 2.2, so white still passes on the purple third slide (UX-1431).
- Lockup: tile on the left, wordmark on the right, vertically centred, with a gap of 25% of the tile (12 px at 48 px). The Android splash screen shows the tile alone, with no wordmark (see `splash-icon.png` below).

## Clear space and minimum size

- Keep clear space of at least **25% of the tile size** on every side of the tile (12 px around a 48 px tile). No text, edges or other icons inside it.
- Minimum sizes: **24 px** for the standard tile on a screen, **16 px** for the favicon cut, and a 12 px wordmark. Below 24 px on a screen, use the house glyph on its own, without the tile.

## Raster assets drawn from these masters

All rendered with Playwright Chromium (the admin app's existing `@playwright/test` devDependency) from the path data above, then checked for size, transparency, colours and placement. No new packages.

| File | Size | What it shows |
|---|---|---|
| `apps/mobile/assets/icon.png` | 1024 x 1024, opaque | Full-bleed `#003D9B`, white house at 52%. No rounded corners baked in: launchers apply their own mask. Also the Expo default icon. |
| `apps/mobile/assets/adaptive-icon.png` | 1024 x 1024, transparent | Android adaptive icon foreground: white house at 40%, inside the 66/108 safe circle. The `#003D9B` background colour comes from `app.config.ts`. |
| `apps/mobile/assets/adaptive-icon-monochrome.png` | 1024 x 1024, transparent | Android 13+ themed icons, set in `app.config.ts` as `android.adaptiveIcon.monochromeImage`. It must be one colour on transparent: Android uses only its shape and tints it. As of 2026-10-18 it is a byte-for-byte copy of `adaptive-icon.png`, whose white house on transparent already meets that rule. |
| `apps/mobile/assets/splash-icon.png` | 1024 x 1024, transparent | Square splash image: the white tile with the blue house, filling 62.5% of the width, centred. No wordmark. The configured `#003D9B` splash background shows behind it. It replaced the tall 1284 x 2778 `splash.png`, which is deleted. |
| `apps/mobile/assets/notification-icon.png` | 96 x 96, transparent | White house glyph, no tile. Android notification icons must be one colour on transparent; Android tints it. |
| `apps/mobile/public/favicon.ico` | 16, 32, 48 px frames | Favicon cut for the phone web app's browser tab (app.onservice.ph), PNG frames inside an ICO file. Byte for byte the same file as the admin `favicon.ico`. Expo copies it into the web build as is. |
| `apps/mobile/assets/favicon.png` | 48 x 48 | Favicon cut: the 48 px frame of `apps/mobile/public/favicon.ico`, byte for byte. The legal pages embed it (see below). |
| `apps/admin/src/assets/brand/favicon.svg` | vector | Favicon cut, for the admin browser tab. |
| `apps/admin/src/assets/brand/favicon.ico` | 16, 32, 48 px frames | Favicon cut, PNG frames inside an ICO file. |
| `apps/admin/src/assets/brand/apple-touch-icon.png` | 180 x 180, opaque | Full-bleed `#003D9B`, white house at 56%. iOS adds its own rounded corners and turns transparency black, so it has none. |

The three admin icons live in `apps/admin/src/assets/brand/`, not in a `public/` folder, and `apps/admin/index.html` links them from there. That way Vite gives each one a hashed file name (`assets/favicon-<hash>.svg` and so on). The tester release check (`validateCandidateFiles` in `scripts/server/paired-web-release.mjs`) refuses any admin file that is not `index.html`, `build-audit.json` or a hashed file under `assets/`, and a new hashed name is also what gets browsers past the long icon cache when the art changes. `apps/admin/src/__tests__/bug-ux-1374-admin-brand-icon.real.test.ts` builds the admin and checks both.

Things to know about these files:

- **Android splash size.** With the top-level `splash` setting in `app.config.ts`, Expo SDK 55 draws the splash image inside a 200 dp square. `splash-icon.png` is square and its tile fills 62.5% of it, so on the phone the tile shows at about 125 dp. (The old tall `splash.png` shrank to a strip, with the tile at about 30 dp.) The `expo-splash-screen` plugin's `imageWidth` option could change that size, but the package is not installed. The whole tile also stays inside the 192 dp circle Android 12+ uses for splash icons. `apps/mobile/__tests__/bug-ux-1426-android-splash-house.test.ts` checks the image and the config. The first app screen (`apps/mobile/app/index.tsx`) draws the tile at the same 125 dp, alone at the centre of the screen on the same `#003D9B`, so the logo does not shrink or jump when the app takes over (UX-1432). If `splash-icon.png` is redrawn at another size, change that screen too; its test fails until they match. Not yet checked on a device.
- **Browser caching.** Browsers, and the web server in front of the apps, keep icon files for a long time (the app.onservice.ph server sends `.ico` files with a one-year, immutable cache). When the art changes, change the URL the page links to (a new file name or a `?v=` query), or people keep seeing the old icon. The admin app gets new names from Vite (above). The phone web app links its icon from `apps/mobile/public/index.html` as `/favicon.ico?v=<first 8 hex digits of the SHA-256 of public/favicon.ico>` (UX-1429), and `app.config.ts` deliberately has no `web.favicon`, because Expo would then add a second, unversioned link. The legal pages carry their icons inline.
- **APK builds.** The Android project folder is not in git. After any change to these images or to the icon or splash settings, regenerate it with `npx expo prebuild -p android --clean` before building, or the APK keeps the old icons. Then check the installed app by eye (`apps/mobile/store-listing/ASSET-CHECKLIST.md`).
- When a mark changes, regenerate every file in the table above, and every copy in the table below, in the same piece of work, then check each one by eye.

## Copies of the mark inside pages

The three static pages nginx serves from `legal/` (app.onservice.ph/feedback, /privacy and /terms) carry the mark inside the page itself, so they never fall back to the long-cached `/favicon.ico`. Each copy must be redone by hand when a master or `apps/mobile/assets/favicon.png` changes.

| File | Copies it holds |
|---|---|
| `legal/feedback.html` | Header: `onservice-mark-white.svg` drawn inline (white tile on the blue bar), next to the "onService PH" wordmark. Tab icons: the favicon cut as an inline SVG, and `apps/mobile/assets/favicon.png` as a base64 PNG. |
| `legal/privacy.html` | Header: `onservice-mark-blue.svg` drawn inline, **tile only** (see below). Tab icons: the same two as the feedback page. |
| `legal/terms.html` | Same as `legal/privacy.html`. |

The tests `packages/api/__tests__/bug-ux-1450-*`, `bug-ux-1451-*` and `bug-ux-1452-*` fail when a copy drifts: each inline tile must match its master SVG exactly, and the base64 PNG must be byte for byte the same as `apps/mobile/assets/favicon.png`.

## Where the house does not go (yet)

- **Privacy and Terms pages: tile only, no wordmark.** On the legal pages only a logo image may be added, never words, so the tile stands alone above the heading (it carries the name "onService PH" for screen readers). The unchanged line under the heading already shows the name.
- **Email: text wordmark only, pending Ken (`.ai-coder/decisions/D42-house-logo-in-email.md`).** The sign-in code email (`packages/api/src/services/email-code-message.ts`) shows "onService PH" in bold `#003D9B`, one colour, with no tile. Gmail and Outlook do not show SVG in email, and D37 keeps that email free of images and links so it lands in the inbox. D42 asks Ken whether to add the tile as a small picture inside the email. Until he answers, the text wordmark is the email logo.
- **PDFs: no mark.** The Official Receipt and the BIR 2307 form stay exactly as they are (BIR compliance; any change needs Ken and an accountant). The internal VAT report has no mark either.
