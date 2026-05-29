# Trica UI Plan

A plan for the next UI attempt. The first one was stripped (`240daf6`) because
the look/feel/UX wasn't right. This plan is built to counter each of the five
confirmed complaints directly, and to use **Ada** (`ada-ui`, Thomas's own
sci-fi CSS framework) as the visual layer.

> Scope: this is a **plan**, not implementation. The solver (`solve()` in
> `solver.ts`) is stable and untouched — the UI plugs into it.

---

## 1. What Ada gives us (the building blocks)

Ada is **CSS-only** (no JS components). We compose plain DOM with these classes:

| Primitive | What it is | Notes |
|---|---|---|
| `.panel` | translucent container with `<header>/<article>/<footer>` | stackable — bg darkens per nesting level |
| `.tile` | small panel, supports `.scaled` (`--scale`) | good for result key/value cells |
| `.command` | button (or `<a>`) | modifiers: `.outline`, `.flash`, `.shade1/2/3`, `.warn`, `disabled` |
| `.compound-commands` | button group | `.vertical`, `.spacer`, `.text` items |
| `.input` | text input | focus/disabled states built in |
| `.spinner` | loading indicator | not needed (solve is synchronous) |
| typography | `--text-xs … --text-3xl` | |
| tokens | `--padding*` (responsive), `--spacing*` (fixed px), `--color100…950`, `--fg-body`, `--border-radius`, `--box-shadow` | |
| theming | `html.light-theme` toggles dark/light; themes: default / `blue` / `green`; `.scaled` + `--scale` | dark is the default sci-fi look |

**Ada conventions to honor**

- **Mobile breakpoint is 640px.** Below it, `.command` supports an abbreviation:
  empty text node + `data-label` + `data-abbr` (shows abbr on small screens).
- **No tooltips.** Ada's own docs call them "not mobile friendly and not in the
  sense of the Ada look and feel." All feedback must be inline.
- **App-shell layout** is opt-in via `html.height-100` + a top-most `.panel`
  whose `<article>` scrolls. (See the keyboard caveat in §6.)
- Offline-pure: vendor the CSS, don't CDN it (see §7).

---

## 2. Counter each prior complaint

| # | Prior complaint | This plan's fix |
|---|---|---|
| 1 | Aesthetics didn't look good | Lean fully into Ada panels + dark sci-fi theme — the look comes "for free" and is consistent |
| 2 | Input UX awkward (2-col grid, live recompute) | Grouped vertical form (Sides / Angles); **blur/explicit-trigger** solve, not live-on-keystroke |
| 3 | Output display | Dedicated results panel as a clean tile grid; computed vs given values visually distinct |
| 4 | Triangle diagram (SVG/labeling) | Separate, well-rendered SVG with collision-aware labels + right-angle marker; **not** an input surface |
| 5 | Input reset bug | Uncontrolled inputs + never overwrite a non-empty/focused field (see §4) |

---

## 3. Layout

**Recommended direction: grouped form + separate diagram** (not inputs-on-the-triangle).

Rationale: putting inputs *onto* the triangle would double down on two of the
five confirmed complaints at once (the 2-col input grid #2 and the SVG/labeling
#4). The grouped form is the robust, low-risk direction. This is the one real
fork — see §8.

### Regions (each an Ada `.panel`)

1. **App frame** — top `.panel`; `<header>` = "Trica" wordmark + controls
   (`.compound-commands`: Clear, theme toggle). `<article>` scrolls.
2. **Inputs** — six `.input`s, grouped **Sides (a, b, c)** and **Angles
   (A, B, C)**. Each: label + input + unit (`°` for angles). Convention reminder
   in footer: *side a is opposite angle A*.
3. **Diagram** — SVG triangle. Updates on solve. Empty state = faint outline.
4. **Results** — derived metrics as a `.tile` grid: area, perimeter, type
   (acute/right/obtuse + equilateral/isosceles/scalene), the three altitudes,
   inradius, circumradius. Hidden until a `unique`/`ambiguous` solve.
5. **Status line** — inline message area for the non-unique result kinds (§5).

### Desktop (≥ 640px) — two columns

```
┌──────────────────────────────────────────────────────┐
│  TRICA                              [Clear] [☾ Theme]  │  app header
├───────────────────────────┬──────────────────────────┤
│  SIDES                     │                          │
│  a [ 5      ]              │            B             │
│  b [ 7      ]              │           /\             │
│  c [        ] auto         │          /  \  a         │
│                            │       c /    \           │
│  ANGLES                    │        /______\          │
│  A [        ]°  auto       │       A    b    C        │
│  B [ 60     ]°             │   (live SVG diagram)     │
│  C [        ]°  auto       │                          │
│  ─ side a is opposite ∠A ─ ├──────────────────────────┤
│                            │  Area 16.4   Perim 18.2  │
│                            │  Type  acute / scalene   │
│                            │  h_a 4.8  r 1.8  R 4.0   │
└───────────────────────────┴──────────────────────────┘
```

### Mobile (< 640px) — single column stack

```
┌────────────────────────┐
│ TRICA      [Clr] [☾]    │   commands use data-abbr
├────────────────────────┤
│ SIDES                   │
│ a [ 5        ]          │
│ b [ 7        ]          │
│ c [          ] auto     │
│ ANGLES                  │
│ A [          ]° auto    │
│ B [ 60       ]°         │
│ C [          ]° auto    │
│        [ = Solve ]      │   explicit trigger on mobile (see §6)
├────────────────────────┤
│      (SVG diagram)      │
├────────────────────────┤
│ Area 16.4  Perim 18.2   │
│ Type acute / scalene    │
│ h_a 4.8  r 1.8  R 4.0   │
└────────────────────────┘
```

Implementation: a single CSS grid that is one column by default and switches to
two columns at the 640px breakpoint (`grid-template-columns`). Per Thomas's CSS
preference, layout is grid throughout; flex only where two-axis centering is
genuinely needed (the diagram).

---

## 4. Input architecture (fixes the reset bug)

Root cause last time: live recompute re-rendered the focused field mid-type,
losing the cursor and the partial value.

- **Uncontrolled inputs.** Never programmatically set `.value` on a field that
  currently has focus.
- **Solve trigger:** on field `blur` (desktop) and/or an explicit Solve command
  (mobile) — never on every keystroke. (Trigger choice = §6.)
- **`given` is the single source of truth.** Every `SolveResult` returns
  `given: GivenSet`. Drive the computed-vs-given distinction off `result.given`,
  **not** a parallel Set we maintain — it's authoritative for "the user typed
  this" and ties the visual state directly to the reset-bug fix.
- **Never overwrite a given field.** Only fields the user left **empty** receive
  a computed value. Computed values exist only on `unique` (`triangle`) and
  `ambiguous` (`triangles`).
- **Computed styling:** computed fields get a dimmed/italic look + a small `auto`
  tag (the mockups show it). Focusing a computed field and typing **promotes** it
  to a given field (clear the auto value on first keystroke).

---

## 5. Mapping the 5 result kinds to UI

`solve()` returns one of five kinds. Each gets a distinct, *non-alarming-where-
appropriate* treatment:

| Kind | UI treatment |
|---|---|
| `unique` | Fill computed fields, draw diagram, show results panel. |
| `ambiguous` (SSA) | Two solutions. Show a **toggle** (`Solution 1 / 2` as two `.command`s) that switches **both** diagram and results. *Not* side-by-side cards — that was tried and rejected. |
| `underdetermined` | **Quiet "keep going" state, NOT an error.** This is the normal in-progress state as the user types up from empty (and the permanent state for AAA). Reserve red/`warn` styling for real errors — otherwise the app feels broken *while typing*. |
| `inconsistent` | Inline `.warn`. Use the `mismatch?: Key` field to **highlight the specific offending input** (`.warn` border on that `.input`) + a short message. |
| `impossible` | Inline `.warn` message (e.g. triangle inequality violated). No field highlight unless a key is implicated. |

All feedback is inline (no tooltips). The status line lives below the inputs.

---

## 6. Mobile + keyboard caveats (decide explicitly)

Two things that plausibly fed the v1 "awkward" feeling:

1. **Solve trigger on mobile.** "Solve on blur" is clean on desktop, but on
   mobile *when does blur fire?* The keyboard may still be up and the user wants
   to see the result. Options: (a) per-field blur only, or (b) an explicit
   `=` / **Solve** command as the clear trigger on mobile (recommended, shown in
   the mockup). This is part of fork §8.
2. **Fixed-height app-shell vs on-screen keyboard.** Ada's `html.height-100`
   shell + a focused input can scroll the input *under* the keyboard. Either
   avoid `height-100` on mobile (let the body scroll) or ensure the focused
   field scrolls into view. Flagged so it's a conscious choice, not a surprise.

---

## 7. PWA / infrastructure

- **Vendor Ada's CSS, don't CDN it.** A CDN link breaks offline-first. Copy
  `ada.css` + the chosen theme (`ada.blue.css` *or* `ada.green.css`, theme file
  first) into e.g. `vendor/` at build time, and precache them.
- **Fonts:** Ada's demo uses Open Sans from Google Fonts — that's an online
  dependency. Either self-host the font files (precache them) or use a system
  font stack to stay fully offline. Recommend self-host or system stack.
- **Service worker (`sw.js`):** add `ui.js` (compiled from `ui.ts`),
  `style.css`, `vendor/ada*.css`, and any font files to the precache list, and
  **bump the cache version**.
- **No bundler** (matches current setup): native ESM in the browser; `ui.ts`
  imports `solve` from `./solver.js`. `moduleResolution: "bundler"` stays.

---

## 8. Decisions (resolved)

1. **Layout direction** — ✅ **Grouped form + separate diagram.** (Inputs-on-the-
   triangle rejected: it would re-trigger complaints #2 and #4.)
2. **Mobile solve trigger** — ✅ **Explicit `= / Solve` command on mobile**
   (desktop stays field-blur). Removes the "when does blur fire" ambiguity.
3. **Theme** — ✅ **Blue, dark default** (`ada.blue.css` + `ada.css`) with a
   light toggle (`html.light-theme`).

## 9. Explicitly NOT carried forward by default

Per the rebuild notes, these were in v1 — **re-examine, don't assume wanted**:

- precision / decimal-places selector
- click-to-copy on results
- SSA side-by-side cards (replaced here by a toggle)
- the 2-column input grid (replaced by grouped vertical form)
```
