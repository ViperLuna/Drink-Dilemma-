# Drink Dilemma

A mobile-first browser game: tap falling vials into the right vats, fill customers' orders before the clock runs out,
and don't overflow. See [DESIGN.md](DESIGN.md) for the rules.

The game lives in `site/` (plain HTML/CSS/JS, no build step) and is deployed with GitHub Pages via GitHub Actions on every push to `main`.

Run locally: `cd site && python3 -m http.server`
