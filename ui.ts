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
  Derived,
  GivenSet,
  Key,
  Triangle,
  TriangleInput,
} from "./solver.js";
import { placeholderSvg, triangleSvg } from "./triangle-svg.js";

const KEYS: Key[] = ["a", "b", "c", "A", "B", "C"];

const inputs = new Map<Key, HTMLInputElement>();
KEYS.forEach((key) => {
  const element = document.querySelector<HTMLInputElement>(
    `.input[data-key="${key}"]`,
  );
  if (element) inputs.set(key, element);
});

const statusEl = document.getElementById("status") as HTMLParagraphElement;
const resultsPanel = document.getElementById("resultsPanel") as HTMLElement;
const resultsEl = document.getElementById("results") as HTMLElement;
const diagramEl = document.getElementById("diagram") as HTMLElement;
const solutionToggle = document.getElementById("solutionToggle") as HTMLElement;
const clearButton = document.getElementById("clear") as HTMLButtonElement;
const themeButton = document.getElementById("theme") as HTMLButtonElement;
const solveButton = document.getElementById("solve") as HTMLButtonElement;

// Holds the two triangles + deriveds for the ambiguous (SSA) case so the
// solution toggle can switch between them without re-solving.
let ambiguous: {
  triangles: [Triangle, Triangle];
  derived: [Derived, Derived];
  given: GivenSet;
} | null = null;
let selectedSolution = 0;

// --- formatting -----------------------------------------------------------

// Trim to 4 decimals, drop trailing zeros (e.g. 5.0000 -> "5", 4.2426 -> "4.2426").
function formatNumber(value: number): string {
  return Number(value.toFixed(4)).toString();
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
    const value = Number(raw);
    if (Number.isFinite(value)) input[key] = value;
  });
  return input;
}

function givenCount(input: TriangleInput): number {
  return KEYS.filter((key) => input[key] !== undefined).length;
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

function shapeLabel(derived: Derived): string {
  const shape = derived.isEquilateral
    ? "equilateral"
    : derived.isIsoceles
      ? "isosceles"
      : "scalene";
  return `${derived.classification} · ${shape}`;
}

function renderResults(derived: Derived): void {
  const cells: Array<[string, string]> = [
    ["Area", formatNumber(derived.area)],
    ["Perimeter", formatNumber(derived.perimeter)],
    ["Type", shapeLabel(derived)],
    ["Height a", formatNumber(derived.altitudes.a)],
    ["Height b", formatNumber(derived.altitudes.b)],
    ["Height c", formatNumber(derived.altitudes.c)],
    ["Inradius", formatNumber(derived.inradius)],
    ["Circumradius", formatNumber(derived.circumradius)],
  ];
  resultsEl.innerHTML = cells
    .map(
      ([label, value]) =>
        `<div class="result-cell"><span class="label">${label}</span><span class="value">${value}</span></div>`,
    )
    .join("");
  resultsPanel.hidden = false;
}

function renderDiagram(triangle: Triangle | null): void {
  diagramEl.innerHTML = triangle ? triangleSvg(triangle) : placeholderSvg();
}

function showEmptyState(): void {
  ambiguous = null;
  solutionToggle.hidden = true;
  resultsPanel.hidden = true;
  setStatus("", false);
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

  switch (result.kind) {
    case "unique": {
      fillComputed(result.triangle, result.given);
      renderDiagram(result.triangle);
      renderResults(result.derived);
      setStatus(`Solved (${result.method}).`, false);
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
      setStatus("Two triangles fit (ambiguous SSA). Pick a solution.", false);
      break;
    }
    case "underdetermined": {
      // Normal in-progress state, NOT an error — keep it quiet.
      resultsPanel.hidden = true;
      renderDiagram(null);
      setStatus(result.reason, false);
      break;
    }
    case "inconsistent": {
      resultsPanel.hidden = true;
      renderDiagram(null);
      if (result.mismatch) {
        const offending = inputs.get(result.mismatch);
        if (offending) offending.classList.add("warn");
      }
      setStatus(result.reason, true);
      break;
    }
    case "impossible": {
      resultsPanel.hidden = true;
      renderDiagram(null);
      setStatus(result.reason, true);
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

  solutionToggle
    .querySelectorAll<HTMLButtonElement>("[data-solution]")
    .forEach((button) => {
      const index = Number(button.dataset.solution);
      button.classList.toggle("outline", index !== selectedSolution);
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
  showEmptyState();
  inputs.get("a")?.focus();
});

themeButton.addEventListener("click", () => {
  const isLight = document.documentElement.classList.toggle("light-theme");
  const nextLabel = isLight ? "Dark" : "Light";
  themeButton.setAttribute("data-label", nextLabel);
  themeButton.setAttribute("data-abbr", nextLabel);
});

// Initial paint.
showEmptyState();
