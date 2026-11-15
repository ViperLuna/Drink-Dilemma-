# Drink Dilemma: Design Doc (v0.1, starting point)

Mobile-first browser game. Everything here is a first draft and is expected to change.
Tunable numbers live in the `CONFIG` object at the top of `site/game.js`.

## Core loop
- Three vats on the ground, left to right: **Red, Yellow, Blue**. Each holds **10 units**.
- **Vials** ride across a ceiling track at random speeds and leave the other side if ignored.
  Sizes 1 to 6 units (small slightly more common).
- **Tap a vial** to release it. It keeps its horizontal speed and falls. Ignoring a vial is free.
- Spawn side is opposite its vat, so there's time to react: red from the right, blue from the left,
  yellow from either side.
- 1 to 3 **customers** wait at the conveyor with talk-bubble orders (bars + numbers per color).
  They never get impatient.
- Orders **auto-serve** as soon as the vats can cover them. Vats drain by the order amount, the drink slides
  down the belt, the customer ducks out, points awarded.
  Customers are served in arrival order, unless the vats satisfy a later customer and not an earlier one.

## Overflow gauge (6 = game over)
+1 for each of: wrong-color vat, vial that doesn't fully fit (the part that fits still goes in, any size = +1),
vial hitting the ground. Rainbow vial on the ground = +2. The gauge persists across levels; the mop reduces it.

## Levels
- One timer per level (**2 minutes**, same every level). Timer hits zero = game over.
- Level ends when N customers are served. Level end gives a break screen and the player taps to continue.
- Vats and gauge **carry over** between levels.
- Difficulty: customers per level and order size grow together. Level 1 is only 3-unit single-color drinks.
- A drink needs at most **6 of any color** (max recipe 666). Minimum total 3 units
  (multi-color colors may be as low as 1 each).
- Draft ladder: `N = 3 + level`; single-color size 3 up to `3 + floor((level-1)/2)` capped at 6;
  two colors from level 5; three colors from level 10; vial speed creeps up each level.

## Drinks
Recipe code is `R Y B` digits (e.g. 3 red = `300`, 2 red + 1 yellow = `210`, max `666`; 333 recipes).
The code deterministically picks container shape and a spread-out color (not physically accurate mixing, on purpose,
for visual variety). Numbers and patterns on the order bubble are the exact answer.

## Power-ups (rare, random, never guaranteed; no cap on count)
- **Mop**: tap, it does a quick animation and vanishes. -3 overflow.
- **Rainbow vial** (cycles red/yellow/blue): drops like a vial, fills **any** vat to full, no overflow.

## VIP customers (draft)
Later levels. Big order (each color 4 to 6), pays 3x. Bonus only: doesn't count toward N.
Marked with a crown, not just a color.

## Coins
- 10 coins per level completed. Rare coin icon rides the ceiling: tap for 10.
- **100 coins** to continue after game over from the start of that level (vats as they were, **overflow gauge reset to 0**).
  Otherwise restart from level 1. Coins are permanent and can be stockpiled.

## Saving and menus
- Saves after each completed level (browser localStorage). Menu: Continue, New Game, Sound toggle.
- Splash screen later.

## Accessibility
Red, blue, and yellow each have a **pattern** (stripes, dots, waves) everywhere they appear, plus numbers.
Color is never the only signal.

## Visuals
TBD. Current build uses placeholder shapes.

## Ideas parked
- Continue cost that rises per use.
- Performance-based coin rewards.
- Splash screen, real art, music.
