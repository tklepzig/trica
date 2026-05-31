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

function renderDiagram(triangle: Triangle | null): void {
  diagramEl.innerHTML = triangle ? triangleSvg(triangle) : placeholderSvg();
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
      // Normal in-progress state, NOT an error — keep it quiet.
      resultsPanel.hidden = true;
      renderDiagram(null);
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
  updateSolveButton();
  inputs.get("a")?.focus();
});

themeButton.addEventListener("click", () => {
  const isLight = document.documentElement.classList.toggle("light-theme");
  themeButton.textContent = isLight ? "Dark" : "Light";
});

// --- offline-ready indicator ----------------------------------------------
// Tells the user, honestly, whether the app is fully cached and safe to use
// offline — so installing becomes "wait for the green check" instead of the
// "go offline, see if it works, reinstall, retry" loop. The service worker owns
// the asset list and checks its own live cache (sw.js), so there's no second
// list here to drift, and the answer stays true even after storage eviction.

type OfflineReadyResult = { ready: boolean; missing: string[] };

// Ask the active SW over a one-shot MessageChannel. Resolves null if there's no
// worker yet or it doesn't answer in time (still warming up) — caller treats
// that as the in-progress "Caching…" state rather than a failure.
function askServiceWorker(worker: ServiceWorker): Promise<OfflineReadyResult | null> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => resolve(null), 3000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timeout);
      resolve(event.data as OfflineReadyResult);
    };
    worker.postMessage({ type: "CHECK_OFFLINE_READY" }, [channel.port2]);
  });
}

function setOfflineStatus(
  state: "caching" | "ready" | "incomplete" | "unavailable",
  missing: string[] = [],
): void {
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

let registrationFailed = false;

async function refreshOfflineStatus(): Promise<void> {
  // No SW support (or insecure context) → nothing meaningful to report; hide it
  // rather than show a scary message for something the user can't act on.
  if (!("serviceWorker" in navigator)) {
    offlineStatusEl.hidden = true;
    return;
  }
  // sw.js failed to load/parse: offline genuinely won't work, and
  // navigator.serviceWorker.ready below would never resolve — so report it
  // instead of awaiting a worker that will never arrive.
  if (registrationFailed) {
    setOfflineStatus("unavailable");
    return;
  }
  // Only fall back to "Caching…" when we have no verdict yet. Setting it
  // unconditionally would downgrade a previously-correct "Offline ready" to a
  // stuck "Caching…" whenever a re-check times out below (the cache is fine —
  // only the report would have regressed).
  if (offlineStatusEl.hidden) setOfflineStatus("caching");
  const registration = await navigator.serviceWorker.ready;
  const worker = navigator.serviceWorker.controller ?? registration.active;
  if (!worker) return; // no active worker to query yet — leave the current state
  const result = await askServiceWorker(worker);
  if (!result) return; // no answer in time — leave the current state
  setOfflineStatus(result.ready ? "ready" : "incomplete", result.missing);
}

if ("serviceWorker" in navigator) {
  // Ask the browser to make our storage durable. Cache Storage is best-effort by
  // default — Android can evict it under storage pressure, which is the "worked,
  // then stopped working offline" failure. Best-effort itself: ignored if denied.
  if (navigator.storage?.persist) void navigator.storage.persist();

  // Register the SW on load (lives here, not an inline script, so we can catch a
  // registration failure and surface it via the badge). On failure we flip the
  // flag and re-render, otherwise refreshOfflineStatus would await a worker that
  // never arrives and sit on "Caching…" forever.
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      registrationFailed = true;
      void refreshOfflineStatus();
    });
  });

  // A new build activating (skipWaiting + clients.claim) swaps the controller —
  // re-check so the badge reflects the fresh cache instead of going stale.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    void refreshOfflineStatus();
  });
}

// Help dialog: native <dialog> gives us focus-trap, ESC-to-close and a backdrop
// for free. We add backdrop-click-to-close ourselves — the padding lives on the
// inner .help-inner, so clicks landing on the <dialog> itself are the backdrop.
// Re-check offline readiness each time it opens: it's a live read, so it always
// shows the current truth (and catches a cache evicted since last time).
helpButton.addEventListener("click", () => {
  void refreshOfflineStatus();
  helpDialog.showModal();
});
helpCloseButton.addEventListener("click", () => helpDialog.close());
helpDialog.addEventListener("click", (event) => {
  if (event.target === helpDialog) helpDialog.close();
});

// Initial paint.
showEmptyState();
updateSolveButton();
