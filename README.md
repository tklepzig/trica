# Nisaba

Offline trigonometry triangle solver. Enter any three values of a triangle
(sides `a, b, c` and angles `A, B, C`, where side `a` is opposite angle `A`)
and Nisaba fills in the rest — area, perimeter, altitudes, inradius,
circumradius, and triangle type included.

## Why "Nisaba"?

Nisaba (𒀭𒉀) is one of the oldest documented deities of the Sumerian
pantheon, dating back to at least the early third millennium BCE. Originally
a goddess of grain, she became the patron of writing, accounting, surveying,
and mathematics — depicted holding the measuring rod and the lapis-lazuli
tablet on which the proportions of fields and temples were inscribed.

Every Sumerian scribal exercise tablet ended with the doxology *"praise to
Nisaba."* For more than two thousand years she was, in effect, the goddess
of applied geometry — the patron of every person who measured a field,
calculated an area, or laid out the foundation of a building.

This app is a small modern continuation of her domain.

## Features

- **Five solving cases** — SSS, SAS, ASA, AAS, SSA (with full handling of the
  ambiguous two-solution case).
- **Right-triangle mode** — toggle locks `C = 90°` and labels the method as
  Pythagoras.
- **Live recompute** — every keystroke recalculates; user-given values are
  bolded, computed values are italic/dimmed so the source of each number is
  obvious at a glance.
- **SVG visualization** — every solution renders as a scaled, labeled triangle
  diagram. For ambiguous SSA, both candidate triangles render in side-by-side
  cards.
- **Derived quantities** — area, perimeter, altitudes from each vertex,
  inradius, circumradius, equilateral/isoceles/scalene + acute/right/obtuse.
- **Click-to-copy** — click any computed value to copy the full-precision raw
  number to the clipboard.
- **Configurable precision** — 2–6 decimal places of display precision.
- **Fully offline** — installable PWA with a cache-first service worker.

## Solving outcomes

The solver returns one of:

| Kind              | Meaning                                                      |
| ----------------- | ------------------------------------------------------------ |
| `unique`          | Exactly one triangle matches.                                |
| `ambiguous`       | SSA produced two valid triangles; both are returned.         |
| `underdetermined` | Fewer than three values, or three values without a side.     |
| `inconsistent`    | More than three values given, and they disagree.             |
| `impossible`      | Triangle inequality violated, angle sum ≥ 180°, or similar.  |

## Develop

```
npm install
npm run dev      # tsc -w + sass -w + live-server
npm test         # jest (33 tests)
npm run build    # tsc + sass compressed
```

All angles are in degrees externally. The solver is in `solver.ts` and has
no DOM dependencies — it's a pure function suitable for unit testing.
