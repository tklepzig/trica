// UI layer for Trica. Plugs into the pure solver in solver.ts.
//
// Input architecture (deliberate, to avoid the v1 reset bug):
//   - Inputs are uncontrolled. We never set .value on a focused field.
//   - Solve runs on blur (desktop) / the Solve button (mobile) / Enter — never
//     on every keystroke.
//   - `result.given` is the single source of truth for "the user typed this".
//     Only NON-given fields get filled with computed values, marked
//     [data-computed]. Computed fields are display-only — they never feed back
//     into the next solve, so the solver can't mistake its own output for input.

import { solve } from "./solver.js";
import type {
  AngleKey,
  Derived,
  GivenSet,
  Key,
  SolveMethod,
  Triangle,
  TriangleInput,
} from "./solver.js";
import { placeholderSvg, triangleSvg } from "./triangle-svg.js";
import { buildPreviewTriangle } from "./preview.js";
import { observeOfflineReadiness } from "@tklepzig/offline-kit";
import type { OfflineStatus } from "@tklepzig/offline-kit";

const KEYS: Key[] = ["a", "b", "c", "A", "B", "C"];

const inputs = new Map<Key, HTMLInputElement>();
KEYS.forEach((key) => {
  const element = document.querySelector<HTMLInputElement>(
    `.input[data-key="${key}"]`,
  );
  if (element) inputs.set(key, element);
});

const statusEl = document.getElementById("status") as HTMLElement;
const resultsPanel = document.getElementById("resultsPanel") as HTMLElement;
const resultsEl = document.getElementById("results") as HTMLElement;
const diagramEl = document.getElementById("diagram") as HTMLElement;
const triangleTypeEl = document.getElementById("triangle-type") as HTMLElement;
const solutionToggle = document.getElementById("solutionToggle") as HTMLElement;
const clearButton = document.getElementById("clear") as HTMLButtonElement;
const themeButton = document.getElementById("theme") as HTMLButtonElement;
const solveButton = document.getElementById("solve") as HTMLButtonElement;
const helpButton = document.getElementById("help") as HTMLButtonElement;
const helpDialog = document.getElementById("helpDialog") as HTMLDialogElement;
const helpCloseButton = document.getElementById("helpClose") as HTMLButtonElement;
const offlineStatusEl = document.getElementById("offlineStatus") as HTMLElement;

// Holds the two triangles + deriveds for the ambiguous (SSA) case so the
// solution toggle can switch between them without re-solving.
let ambiguous: {
  triangles: [Triangle, Triangle];
  derived: [Derived, Derived];
  given: GivenSet;
} | null = null;
let selectedSolution = 0;

// Diagram rotation (degrees, clockwise on screen) — a view setting the user can
// spin to match their real-world orientation. Persists across re-solves; reset
// only on Clear. `currentTriangle` is the figure rotation re-renders against.
const RAD2DEG = 180 / Math.PI;
let rotation = 0;
// Diagram zoom (1 = fitted view) — another view setting, applied as a CSS
// `scale()` on top of the rendered SVG (see paintDiagram). Like rotation it
// persists across re-solves and is reset only on Clear. Clamped so you can't
// zoom out past the fitted figure or in beyond a sensible limit.
const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
let zoom = 1;
let currentTriangle: Triangle | null = null;
// What the current figure is showing — kept so the rotation gesture can repaint
// without recomputing it. `provisional`/`valued` mirror triangleSvg's options.
let currentDiagramOptions: {
  provisional?: boolean;
  valued?: Partial<Record<Key, boolean>>;
} = {};

// --- formatting -----------------------------------------------------------

// Round to 2 decimals, drop trailing zeros (e.g. 5 -> "5", 44.4153 -> "44.42").
function formatNumber(value: number): string {
  return Number(value.toFixed(2)).toString();
}

// --- reading input --------------------------------------------------------

// Build a TriangleInput from user-given fields only: non-empty AND not a
// computed (solver-filled) value. This is what keeps computed output from
// being read back in as if the user had typed it.
function readInput(): TriangleInput {
  const input: TriangleInput = {};
  inputs.forEach((element, key) => {
    if (element.hasAttribute("data-computed")) return;
    const raw = element.value.trim();
    if (raw === "") return;
    const value = Number(raw.replace(",", "."));
    if (Number.isFinite(value)) input[key] = value;
  });
  return input;
}

function givenCount(input: TriangleInput): number {
  return KEYS.filter((key) => input[key] !== undefined).length;
}

// Enable the (mobile) Solve button only once there's enough to solve: at least
// 3 user-given values including at least one side — the same gate the solver
// uses before it stops returning "underdetermined".
function updateSolveButton(): void {
  const input = readInput();
  const hasSide =
    input.a !== undefined || input.b !== undefined || input.c !== undefined;
  solveButton.disabled = !(givenCount(input) >= 3 && hasSide);
}

// --- rendering ------------------------------------------------------------

function clearFieldDecorations(): void {
  inputs.forEach((element) => {
    element.classList.remove("warn");
    if (element.hasAttribute("data-computed")) {
      element.removeAttribute("data-computed");
      element.value = "";
    }
  });
}

// Fill the non-given fields with a triangle's values. We skip the currently
// focused field so we never overwrite text the user is mid-edit on. Note this
// guard relies on blur timing: when tabbing X -> Y, X's blur fires while
// activeElement is still <body>, so an empty Y can get filled an instant before
// focus lands on it. That's harmless — the focus handler selects the value and
// the first keystroke promotes it back to a user-given field.
function fillComputed(triangle: Triangle, given: Record<Key, boolean>): void {
  KEYS.forEach((key) => {
    if (given[key]) return;
    const element = inputs.get(key);
    if (!element || element === document.activeElement) return;
    element.value = formatNumber(triangle[key]);
    element.setAttribute("data-computed", "");
  });
}

function setStatus(message: string, isError: boolean): void {
  statusEl.textContent = message;
  statusEl.classList.toggle("warn", isError);
  statusEl.hidden = message === "";
}

// German labels for the solver's English classification terms.
const CLASSIFICATION_DE: Record<Derived["classification"], string> = {
  acute: "spitzwinklig",
  right: "rechtwinklig",
  obtuse: "stumpfwinklig",
};

// The solver's method codes map to the German congruence-theorem (Kongruenzsatz)
// abbreviations: SAS→SWS, ASA→WSW, AAS→SWW, SSA→SsW.
const METHOD_DE: Record<Exclude<SolveMethod, "right-pythagoras">, string> = {
  SSS: "SSS",
  SAS: "SWS",
  ASA: "WSW",
  AAS: "SWW",
  SSA: "SsW",
};

function methodLabelDe(method: SolveMethod): string {
  if (method === "right-pythagoras") return "Satz des Pythagoras";
  return `Kongruenzsatz ${METHOD_DE[method]}`;
}

function shapeLabel(derived: Derived): string {
  const shape = derived.isEquilateral
    ? "gleichseitig"
    : derived.isIsoceles
      ? "gleichschenklig"
      : "ungleichseitig";
  return `${CLASSIFICATION_DE[derived.classification]} · ${shape}`;
}

// The classification shows in the diagram panel's footer (setTriangleType), not
// as a tile, so the results panel stays all-numbers.
function setTriangleType(derived: Derived | null): void {
  triangleTypeEl.textContent = derived ? shapeLabel(derived) : "";
}

function renderResults(derived: Derived): void {
  const cells: Array<[string, string]> = [
    ["Fläche", formatNumber(derived.area)],
    ["Umfang", formatNumber(derived.perimeter)],
    ["Höhe a", formatNumber(derived.altitudes.a)],
    ["Höhe b", formatNumber(derived.altitudes.b)],
    ["Höhe c", formatNumber(derived.altitudes.c)],
    ["Inkreisradius", formatNumber(derived.inradius)],
    ["Umkreisradius", formatNumber(derived.circumradius)],
  ];
  resultsEl.innerHTML = cells
    .map(
      ([label, value]) =>
        `<div class="result-cell"><span class="label">${label}</span><span class="value">${value}</span></div>`,
    )
    .join("");
  resultsPanel.hidden = false;
}

function renderDiagram(
  triangle: Triangle | null,
  options: typeof currentDiagramOptions = {},
): void {
  currentTriangle = triangle;
  currentDiagramOptions = options;
  paintDiagram();
}

// Paint the current figure at the current rotation. Split from renderDiagram so
// the rotation gesture can repaint without recomputing what to show.
function paintDiagram(): void {
  diagramEl.innerHTML = currentTriangle
    ? triangleSvg(currentTriangle, rotation, currentDiagramOptions)
    : placeholderSvg(rotation);
}

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

// Push the current zoom to the CSS variable that `.tri` reads. It lives on the
// stable #diagram element, not the SVG (which paintDiagram replaces each frame),
// so a re-render never drops the zoom — no SVG rebuild needed to apply it.
function applyZoom(): void {
  diagramEl.style.setProperty("--zoom", String(zoom));
}

// Which keys the user actually entered — only these show numeric labels in a
// preview (the rest are guesses, drawn as bare letters).
function enteredKeys(input: TriangleInput): Partial<Record<Key, boolean>> {
  const valued: Partial<Record<Key, boolean>> = {};
  KEYS.forEach((key) => {
    if (input[key] !== undefined) valued[key] = true;
  });
  return valued;
}

function showEmptyState(): void {
  ambiguous = null;
  solutionToggle.hidden = true;
  resultsPanel.hidden = true;
  setStatus("", false);
  setTriangleType(null);
  renderDiagram(null);
}

// --- the solve cycle ------------------------------------------------------

function run(): void {
  clearFieldDecorations();
  const input = readInput();

  if (givenCount(input) === 0) {
    showEmptyState();
    return;
  }

  const result = solve(input);
  ambiguous = null;
  solutionToggle.hidden = true;
  setTriangleType(null);

  switch (result.kind) {
    case "unique": {
      fillComputed(result.triangle, result.given);
      renderDiagram(result.triangle);
      renderResults(result.derived);
      setTriangleType(result.derived);
      setStatus(methodLabelDe(result.method), false);
      break;
    }
    case "ambiguous": {
      ambiguous = {
        triangles: result.triangles,
        derived: result.derived,
        given: result.given,
      };
      selectedSolution = 0;
      solutionToggle.hidden = false;
      renderSolution();
      setStatus("Zwei Dreiecke möglich – wähle eine Lösung.", false);
      break;
    }
    case "underdetermined": {
      // Normal in-progress state, NOT an error — keep it quiet. Preview a
      // representative triangle that honours what's entered so far; if the
      // partial values already preclude a triangle, fall back to the placeholder.
      resultsPanel.hidden = true;
      const preview = buildPreviewTriangle(input);
      if (preview) {
        renderDiagram(preview, {
          provisional: true,
          valued: enteredKeys(input),
        });
      } else {
        renderDiagram(null);
      }
      const onlyAngles =
        result.given.A &&
        result.given.B &&
        result.given.C &&
        !result.given.a &&
        !result.given.b &&
        !result.given.c;
      setStatus(
        onlyAngles
          ? "Form bekannt, aber keine Größe – gib mindestens eine Seite an."
          : "Bitte mehr Werte eingeben (mindestens 3, davon eine Seite).",
        false,
      );
      break;
    }
    case "inconsistent": {
      resultsPanel.hidden = true;
      renderDiagram(null);
      if (result.mismatch) {
        const offending = inputs.get(result.mismatch);
        if (offending) offending.classList.add("warn");
        setStatus(
          `Wert für ${result.mismatch} passt nicht zu den übrigen Eingaben.`,
          true,
        );
      } else {
        setStatus("Die gegebenen Winkel ergeben in Summe nicht 180°.", true);
      }
      break;
    }
    case "impossible": {
      resultsPanel.hidden = true;
      renderDiagram(null);
      const angleKeys: AngleKey[] = ["A", "B", "C"];
      const givenAngles = angleKeys.filter((key) => input[key] !== undefined);
      const angleSum = givenAngles.reduce(
        (sum, key) => sum + (input[key] as number),
        0,
      );
      const twoBigAngles = givenAngles.length >= 2 && angleSum >= 180;
      setStatus(
        twoBigAngles
          ? "Zwei Winkel ergeben bereits 180° oder mehr."
          : "Mit diesen Werten existiert kein Dreieck.",
        true,
      );
      break;
    }
  }
}

// Render the currently-selected ambiguous solution into fields/diagram/results.
function renderSolution(): void {
  if (!ambiguous) return;
  // Re-fill computed fields for the chosen triangle.
  inputs.forEach((element) => {
    if (element.hasAttribute("data-computed")) {
      element.removeAttribute("data-computed");
      element.value = "";
    }
  });
  fillComputed(ambiguous.triangles[selectedSolution], ambiguous.given);
  renderDiagram(ambiguous.triangles[selectedSolution]);
  renderResults(ambiguous.derived[selectedSolution]);
  setTriangleType(ambiguous.derived[selectedSolution]);

  solutionToggle
    .querySelectorAll<HTMLButtonElement>("[data-solution]")
    .forEach((button) => {
      const index = Number(button.dataset.solution);
      // The active solution is steel (shade3); the others stay default-orange.
      button.classList.toggle("shade3", index === selectedSolution);
    });
}

// --- wiring ---------------------------------------------------------------

inputs.forEach((element) => {
  // Solve when the user leaves a field (desktop primary trigger).
  element.addEventListener("blur", run);

  // Select-all on focusing a computed field so the first keystroke replaces it.
  element.addEventListener("focus", () => {
    if (element.hasAttribute("data-computed")) element.select();
  });

  // First edit promotes a computed field to a user-given one.
  element.addEventListener("input", () => {
    element.removeAttribute("data-computed");
    element.classList.remove("warn");
    updateSolveButton();
  });

  // Enter solves immediately.
  element.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      run();
    }
  });
});

solveButton.addEventListener("click", run);

// --- diagram rotation + zoom gesture --------------------------------------
// Works on both the placeholder and a solved triangle, so the figure can be
// pre-oriented to a real-world object before any value is entered.
// Mouse/pen: a single-pointer drag spins the figure about the diagram centre;
// the wheel zooms (see the wheel handler below).
// Touch: a two-finger gesture both twists (spin) and pinches (zoom) at once — a
// single touch is ignored so the page still scrolls; the gesture only engages
// once a second finger lands. We rotate in screen space and re-render the SVG;
// zoom is a CSS scale layered on top. Capture lives on the stable <article>
// (#diagram), never the <svg> we replace each frame.
//
// Capture rules matter for touch: a lone finger is NOT captured, so the browser
// can scroll the page (touch-action: pan-y); both fingers ARE captured once the
// second lands, so the twist keeps tracking even if a finger leaves the small
// diagram. pointerup/pointercancel are also handled on window so a finger lifted
// off the diagram can't leave a stale pointer behind (which would otherwise let
// a single finger spin the figure, or corrupt the two-finger angle).

type ActivePointer = { x: number; y: number; type: string };
const activePointers = new Map<number, ActivePointer>();
let gestureReference: number | null = null; // previous gesture angle (radians)
let pinchReference: number | null = null; // previous two-finger distance (px)
let renderQueued = false;

function diagramCenter(): { x: number; y: number } {
  const rect = diagramEl.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

// A gesture is live for a mouse with its button down (1 pointer) or for two
// fingers down (a lone finger never rotates).
function gestureActive(): boolean {
  const pointers = [...activePointers.values()];
  const hasTouch = pointers.some((pointer) => pointer.type === "touch");
  return hasTouch ? pointers.length >= 2 : pointers.length >= 1;
}

// Current gesture angle (radians, screen space): the twist between the first
// two touch points, or the angle from the diagram centre to the lone pointer.
function gestureAngle(): number {
  const pointers = [...activePointers.values()];
  if (pointers.length >= 2) {
    return Math.atan2(
      pointers[1].y - pointers[0].y,
      pointers[1].x - pointers[0].x,
    );
  }
  const center = diagramCenter();
  return Math.atan2(pointers[0].y - center.y, pointers[0].x - center.x);
}

// Distance between the first two pointers (px), or null with fewer than two —
// the basis for pinch zoom. A lone pointer (mouse drag, single finger) never
// zooms, so only a genuine two-finger pinch drives it.
function gestureDistance(): number | null {
  const pointers = [...activePointers.values()];
  if (pointers.length < 2) return null;
  return Math.hypot(
    pointers[1].x - pointers[0].x,
    pointers[1].y - pointers[0].y,
  );
}

function queueDiagramRender(): void {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    paintDiagram();
  });
}

diagramEl.addEventListener("pointerdown", (event) => {
  activePointers.set(event.pointerId, {
    x: event.clientX,
    y: event.clientY,
    type: event.pointerType,
  });
  if (event.pointerType !== "touch") {
    // Mouse/pen: a single-pointer drag is the gesture — capture so it keeps
    // tracking outside the element.
    diagramEl.setPointerCapture(event.pointerId);
  } else if (gestureActive()) {
    // Touch is a gesture only with a second finger down: capture BOTH now (so the
    // twist tracks even if a finger drifts off the diagram). A lone finger is
    // never captured, leaving it free to scroll the page (touch-action: pan-y).
    for (const id of activePointers.keys()) {
      try {
        diagramEl.setPointerCapture(id);
      } catch {
        // Pointer already released — nothing to capture.
      }
    }
  }
  gestureReference = gestureActive() ? gestureAngle() : null;
  pinchReference = gestureActive() ? gestureDistance() : null;
});

diagramEl.addEventListener("pointermove", (event) => {
  const pointer = activePointers.get(event.pointerId);
  if (!pointer) return;
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  if (!gestureActive()) return;
  event.preventDefault();
  const angle = gestureAngle();
  if (gestureReference === null) {
    gestureReference = angle;
    return;
  }
  // Shortest-arc delta, so crossing the ±π seam doesn't snap the figure.
  const delta = Math.atan2(
    Math.sin(angle - gestureReference),
    Math.cos(angle - gestureReference),
  );
  gestureReference = angle;
  rotation += delta * RAD2DEG;
  queueDiagramRender();

  // Pinch zoom runs alongside the twist: two fingers spreading/closing scale the
  // figure by the change in their separation. Delta-ratio against the previous
  // distance (not the gesture's start) so lifting and re-adding a finger doesn't
  // snap the zoom. CSS-only, so no SVG rebuild — set the variable directly.
  const distance = gestureDistance();
  if (distance !== null && distance > 0) {
    if (pinchReference === null || pinchReference === 0) {
      pinchReference = distance;
    } else {
      zoom = clampZoom(zoom * (distance / pinchReference));
      pinchReference = distance;
      applyZoom();
    }
  }
});

function endPointer(event: PointerEvent): void {
  if (!activePointers.has(event.pointerId)) return;
  activePointers.delete(event.pointerId);
  if (diagramEl.hasPointerCapture(event.pointerId)) {
    diagramEl.releasePointerCapture(event.pointerId);
  }
  // Re-seat the references for any remaining pointer (e.g. lifting one of two
  // fingers) so the next move measures a fresh delta rather than a jump.
  gestureReference = gestureActive() ? gestureAngle() : null;
  pinchReference = gestureActive() ? gestureDistance() : null;
}

diagramEl.addEventListener("pointerup", endPointer);
diagramEl.addEventListener("pointercancel", endPointer);
// Safety net: a finger lifted/cancelled off the diagram (it's small on mobile)
// still gets cleaned up, so no pointer goes stale. endPointer ignores ids it
// isn't tracking, so these are harmless duplicates for on-diagram lifts.
window.addEventListener("pointerup", endPointer);
window.addEventListener("pointercancel", endPointer);

// Desktop zoom: the mouse wheel scales the figure about its centre. Exponential
// in deltaY so each notch is a constant multiplicative step regardless of the
// reported magnitude; wheel up (negative deltaY) zooms in. Non-passive + a
// preventDefault so the page doesn't scroll while zooming over the diagram.
diagramEl.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    zoom = clampZoom(zoom * Math.exp(-event.deltaY * 0.0015));
    applyZoom();
  },
  { passive: false },
);

solutionToggle
  .querySelectorAll<HTMLButtonElement>("[data-solution]")
  .forEach((button) => {
    button.addEventListener("click", () => {
      selectedSolution = Number(button.dataset.solution);
      renderSolution();
    });
  });

clearButton.addEventListener("click", () => {
  inputs.forEach((element) => {
    element.value = "";
    element.removeAttribute("data-computed");
    element.classList.remove("warn");
  });
  rotation = 0;
  zoom = 1;
  applyZoom();
  showEmptyState();
  updateSolveButton();
  inputs.get("a")?.focus();
});

themeButton.addEventListener("click", () => {
  const isLight = document.documentElement.classList.toggle("light-theme");
  themeButton.textContent = isLight ? "Dark" : "Light";
});

// --- offline-ready indicator ----------------------------------------------
// The lifecycle (registration, readiness query, state machine) lives in
// offline-kit; here we only render the emitted state. Strings stay English
// on purpose (infrastructure status) while the rest of the UI is German.

function renderOfflineStatus({ state, missing }: OfflineStatus): void {
  offlineStatusEl.classList.toggle("ready", state === "ready");
  offlineStatusEl.classList.toggle(
    "warn",
    state === "incomplete" || state === "unavailable",
  );
  offlineStatusEl.hidden = false;
  if (state === "ready") {
    offlineStatusEl.textContent = "✓ Offline ready";
  } else if (state === "incomplete") {
    const names = missing.map((url) => url.replace(/^\.\//, "")).join(", ");
    offlineStatusEl.textContent = `Offline cache incomplete — missing: ${names}`;
  } else if (state === "unavailable") {
    offlineStatusEl.textContent = "Service worker failed — offline unavailable";
  } else {
    offlineStatusEl.textContent = "Caching…";
  }
}

const offlineReadiness = observeOfflineReadiness({
  onStatus: renderOfflineStatus,
});

// Help dialog: native <dialog> gives us focus-trap, ESC-to-close and a backdrop
// for free. We add backdrop-click-to-close ourselves — the padding lives on the
// inner .help-inner, so clicks landing on the <dialog> itself are the backdrop.
// Re-check offline readiness each time it opens: it's a live read, so it always
// shows the current truth (and catches a cache evicted since last time).
helpButton.addEventListener("click", () => {
  offlineReadiness.refresh();
  helpDialog.showModal();
});
helpCloseButton.addEventListener("click", () => helpDialog.close());
helpDialog.addEventListener("click", (event) => {
  if (event.target === helpDialog) helpDialog.close();
});

// Initial paint.
showEmptyState();
updateSolveButton();
