# Nisaba

Offline trigonometry triangle solver. **Math core only at the moment** —
the UI was deliberately stripped and will be rebuilt from scratch later.
What remains is the solver, its tests, and the PWA shell.

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

## What's in here

- `solver.ts` — pure TypeScript triangle solver: SSS, SAS, ASA, AAS, SSA
  (including the ambiguous two-solution case), AAA underdetermined,
  right-triangle Pythagoras. Returns `unique | ambiguous | underdetermined
  | inconsistent | impossible` and derived quantities (area, perimeter,
  altitudes, inradius, circumradius, equilateral/isoceles/scalene + acute/
  right/obtuse).
- `solver.test.ts` — 33 Jest tests, all green.
- `index.html`, `manifest.webmanifest`, `sw.js`, `favicon.svg` — PWA shell.
  Installable, cache-first; will become useful once a UI is reattached.

## Develop

```
npm install
npm test         # jest (33 tests)
npm run build    # tsc
```

All angles are in degrees externally. The solver has no DOM dependencies —
pure function, suitable for any UI layer.
