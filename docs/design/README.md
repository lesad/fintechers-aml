# Design

Designs from Claude Design, saved as the source of truth for the UI. They supersede `docs/design-brief-v1.md` and `docs/design-brief-detail.md`: the brief changed while iterating in Claude Design.

## aml-review-queue/

Project: https://claude.ai/design/p/6e79f47c-09c2-408b-8bfd-24e2b6cca745 (saved 2026-10-19).

- `AML Review Queue.dc.html`: the current design, review queue (overview) and transaction detail in tabs. Markup, mock data and behaviour in one file.
- `support.js`: the Claude Design runtime that renders `.dc.html` files.
- `_ds/morosystems-design-system-…/`: MoroSystems design system, `colors_and_type.css` (tokens) and `_ds_bundle.js`.

- `_ds/…/fonts/`: Inter Tight and Boldonse, and `assets/aml-spotter-logo-white.png`, the logo in the header.

Open `AML Review Queue.dc.html` in a browser to see it working. The older `AML Review Queue v1.dc.html` and the design system's own README and manifest were not kept.

Vendored as-is: excluded from oxfmt and oxlint.
