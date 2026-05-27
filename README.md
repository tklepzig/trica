# Trica

Offline trigonometry triangle solver. **Math core only at the moment** —
the UI was deliberately stripped and will be rebuilt from scratch later.
What remains is the solver, its tests, and the PWA shell.

## Name

**Trica** = **TRI**gonometry + **CA**lculation.
Same naming pattern as Vicy (VIgenere enCrYption).

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
