# DOAC design system

Extracted from the official site (stevenbartlett.com/doac — archived snapshot 2026-07-01, `css/main.css` + Adobe Fonts kit `erm4jbe`), the podcast cover art, and YouTube thumbnail packaging.

## The brand in one paragraph

DOAC's core identity is **monochrome**: a pure-black studio, stark white, and very heavy condensed uppercase type (the logo is black letters in a white box). Accent colors are contextual layers on top of that core — **volt yellow `#DBFF00`** is the digital-brand accent (dominant on stevenbartlett.com: buttons, hovers, banners, nav arrows), while **red `#FF2E29`** is the YouTube-packaging accent ("New" badges, highlight boxes behind key words). Guest photography is naturally lit against the black studio; type does the shouting, not the colors.

## Color tokens

| Token | Value | Source & role |
|---|---|---|
| `--black` | `#000000` | Site `body` background. The default surface — panels are black too, separated by hairlines, not tints. |
| `--white` | `#FFFFFF` | Primary text, and the logo box fill. |
| `--volt` | `#DBFF00` | Primary accent (69 uses in main.css). Interactive things: CTAs, links, hover fills, nav discs, citations, focus rings, selection. |
| `--volt-soft` | `rgba(219,255,0,.12)` | Volt tint for subtle fills (site uses `rgba(219,255,0,.7)` overlays at full strength). |
| `--red` | `#FF2E29` | Sampled from thumbnail "New" badge. Reserved for *live* semantics only: ON AIR lamp, recording, errors. Never a generic accent. |
| `--line` | `#333333` | Hairline borders/dividers (site's `#333`). |
| `--muted` | `#919191` | Secondary text (site's `rgb(145,145,145)`). |
| `--faint` | `#666666` | Tertiary text (site's `#666`). |
| `--panel` | `#111111` | Slightly-lifted surface (site's `#111`); use sparingly — DOAC surfaces are mostly flat black + hairline. |
| `--panel-2` | `#1A1A1A` | Hover/nested surface. |

Scrims: black at 0.6 opacity (`rgba(0,0,0,.6)`) is the site's standard overlay.

## Typography

| Role | DOAC (Adobe Fonts) | Free stand-in (bundled) | Usage |
|---|---|---|---|
| Display | **Zuume** 700 / 400 | **Anton** (400) | ALL-CAPS, huge (site scale runs 22–220px), line-height ~1.0. Headlines, buttons, questions, the wordmark. |
| Body | **Paralucent** 300 / 500 | **Barlow** 300–600 | Sentence case, light-leaning weights, generous line-height. |
| Utility | — (none on site) | Spline Sans Mono | Our addition: timestamps, citation numbers, status readouts. |

Type rules from the site:
- Display type is always `text-transform: uppercase`.
- Small caps labels get `letter-spacing: 2px` (`--track-caps: 0.12em`).
- The site's `body` is literally `font-family: zuume` on black — display type *is* the design.

## Shape & radius

The site mixes pills and rounded cards: `999px` pills for small buttons/badges, `20–30px` cards, `60px` nav discs, `0` on modals. Rule of thumb here: **pill for controls, 20px for cards, 0 for full-bleed bands**.

## Signature motifs

1. **The logo box** — white rectangle, black condensed caps (`DOAC`). Reused as the app wordmark (`ASK DOAC`).
2. **The highlight box** — a key word set on a filled box (volt on web, red on YouTube), black text. Used on the hero headline.
3. **The volt invert** — hover fills with volt and flips text to black (`.btn2:hover { background:#DBFF00; color:#000 }`).
4. **Volt disc + black arrow** — 38px volt circle with a black arrow (site's swiper nav). Used as the composer send button.
5. **CTA with arrow** — uppercase Zuume/Anton text in volt with a leading/trailing arrow glyph, no box until hover.
6. **Yellow band** (`inner-banner`) — full-width volt strip with black display type, for page-level banners.
7. **ON AIR red** — our mapping of the YouTube red: live/recording/error states only.

## Voice

Uppercase display copy is short and declarative (thumbnail grammar: "It's time to QUIT your job"). Body copy is plain and direct. Buttons say what they do.
