import { solve, SolveResult, Triangle, Derived, Key, GivenSet } from "./solver.js";

const ALL_KEYS: Key[] = ["a", "b", "c", "A", "B", "C"];
const ANGLE_KEYS: Key[] = ["A", "B", "C"];

const numberFormatter = new Intl.NumberFormat(navigator.language, {
  maximumFractionDigits: 4,
  useGrouping: false,
});

function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

type State = {
  rightTriangle: boolean;
};

const state: State = {
  rightTriangle: false,
};

function getInputs(): Record<Key, HTMLInputElement> {
  const map = {} as Record<Key, HTMLInputElement>;
  ALL_KEYS.forEach((key) => {
    const element = document.getElementById(`input-${key}`) as HTMLInputElement | null;
    if (!element) throw new Error(`missing input for ${key}`);
    map[key] = element;
  });
  return map;
}

function readInputs(inputs: Record<Key, HTMLInputElement>): {
  values: Partial<Record<Key, number>>;
  filled: Set<Key>;
} {
  const values: Partial<Record<Key, number>> = {};
  const filled = new Set<Key>();
  ALL_KEYS.forEach((key) => {
    const raw = inputs[key].value.trim();
    if (raw === "") return;
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      values[key] = parsed;
      filled.add(key);
    }
  });
  // The right-triangle toggle injects C=90° even if the user didn't type it.
  if (state.rightTriangle && !filled.has("C")) {
    values.C = 90;
  }
  return { values, filled };
}

function setStatusHint(message: string, kind: "info" | "error" | "ambiguous" = "info"): void {
  const hint = document.getElementById("status-hint") as HTMLElement;
  hint.textContent = message;
  hint.classList.toggle("is-error", kind === "error");
  hint.classList.toggle("is-ambiguous", kind === "ambiguous");
}

function setFooterHint(message: string): void {
  const footer = document.getElementById("footer-hint") as HTMLElement;
  footer.textContent = message;
}

function clearResultCards(): void {
  const container = document.getElementById("result-cards") as HTMLElement;
  container.innerHTML = "";
  container.hidden = true;
  container.classList.remove("is-ambiguous");
}

function formatMethodLabel(method: string, given: GivenSet): string {
  // Show "Pythagoras" instead of SAS / SSA when a 90° angle is involved,
  // since that's the recognizable name for the user.
  const has90 =
    document.getElementById("right-toggle")?.matches(":checked") ||
    given.A || given.B || given.C; // (will be refined by checking value)
  // Simpler: if state.rightTriangle is on, label as Pythagoras.
  if (state.rightTriangle) return "Pythagoras";
  return method;
}

function renderTriangleCard(
  triangle: Triangle,
  derived: Derived,
  given: GivenSet,
  method: string,
  title?: string,
): HTMLElement {
  const card = document.createElement("div");
  card.className = "result-card";

  if (title) {
    const heading = document.createElement("h3");
    heading.textContent = title;
    card.appendChild(heading);
  }

  const badge = document.createElement("span");
  badge.className = "method-badge";
  badge.textContent = formatMethodLabel(method, given);
  card.appendChild(badge);

  ALL_KEYS.forEach((key) => {
    const row = document.createElement("div");
    row.className = "result-row";
    const keyEl = document.createElement("span");
    keyEl.className = "key";
    keyEl.textContent = key;
    const valueEl = document.createElement("span");
    valueEl.className = "value";
    const isAngle = ANGLE_KEYS.includes(key);
    const formatted = formatNumber(triangle[key]) + (isAngle ? "°" : "");
    valueEl.textContent = formatted + (given[key] ? "  ✓" : "");
    row.appendChild(keyEl);
    row.appendChild(valueEl);
    card.appendChild(row);
  });

  const derivedBlock = document.createElement("div");
  derivedBlock.className = "derived";
  const derivedRows: Array<[string, string]> = [
    ["Area", formatNumber(derived.area)],
    ["Perimeter", formatNumber(derived.perimeter)],
    ["Type", describeType(derived)],
    ["Altitude from a", formatNumber(derived.altitudes.a)],
    ["Altitude from b", formatNumber(derived.altitudes.b)],
    ["Altitude from c", formatNumber(derived.altitudes.c)],
    ["Inradius", formatNumber(derived.inradius)],
    ["Circumradius", formatNumber(derived.circumradius)],
  ];
  derivedRows.forEach(([label, value]) => {
    const row = document.createElement("div");
    row.className = "derived-row";
    const keyEl = document.createElement("span");
    keyEl.className = "key";
    keyEl.textContent = label;
    const valueEl = document.createElement("span");
    valueEl.className = "value";
    valueEl.textContent = value;
    row.appendChild(keyEl);
    row.appendChild(valueEl);
    derivedBlock.appendChild(row);
  });
  card.appendChild(derivedBlock);

  return card;
}

function describeType(derived: Derived): string {
  const parts: string[] = [];
  if (derived.isEquilateral) parts.push("equilateral");
  else if (derived.isIsoceles) parts.push("isoceles");
  else parts.push("scalene");
  parts.push(derived.classification);
  return parts.join(" / ");
}

function updateInputDisplay(
  inputs: Record<Key, HTMLInputElement>,
  result: SolveResult,
  filled: Set<Key>,
): void {
  ALL_KEYS.forEach((key) => {
    const input = inputs[key];
    input.classList.remove("is-computed", "is-given");

    if (filled.has(key)) {
      input.classList.add("is-given");
      return;
    }

    // Only show computed value in input when we have a unique solution.
    if (result.kind === "unique") {
      const value = result.triangle[key];
      input.value = formatNumber(value);
      input.classList.add("is-computed");
    } else if (result.kind === "ambiguous") {
      // Don't fill ambiguous values into the single input field — the cards show both.
      input.value = "";
    } else {
      input.value = "";
    }
  });
}

function recompute(): void {
  const inputs = getInputs();
  const { values, filled } = readInputs(inputs);
  const result = solve(values);

  clearResultCards();
  const container = document.getElementById("result-cards") as HTMLElement;

  switch (result.kind) {
    case "underdetermined":
      setStatusHint(result.reason);
      setFooterHint("");
      break;
    case "impossible":
      setStatusHint(result.reason, "error");
      setFooterHint("");
      break;
    case "inconsistent":
      setStatusHint(`Inconsistent: ${result.reason}`, "error");
      setFooterHint(result.mismatch ? `Mismatch on: ${result.mismatch}` : "");
      break;
    case "unique": {
      setStatusHint("Solved.");
      setFooterHint(`Method: ${formatMethodLabel(result.method, result.given)}`);
      container.hidden = false;
      container.appendChild(
        renderTriangleCard(result.triangle, result.derived, result.given, result.method),
      );
      break;
    }
    case "ambiguous": {
      setStatusHint(
        "Two valid triangles match these inputs (SSA ambiguous case).",
        "ambiguous",
      );
      setFooterHint("Method: SSA (ambiguous)");
      container.hidden = false;
      container.classList.add("is-ambiguous");
      container.appendChild(
        renderTriangleCard(
          result.triangles[0],
          result.derived[0],
          result.given,
          result.method,
          "Solution 1",
        ),
      );
      container.appendChild(
        renderTriangleCard(
          result.triangles[1],
          result.derived[1],
          result.given,
          result.method,
          "Solution 2",
        ),
      );
      break;
    }
  }

  updateInputDisplay(inputs, result, filled);
}

function attachListeners(): void {
  const inputs = getInputs();
  ALL_KEYS.forEach((key) => {
    inputs[key].addEventListener("input", () => {
      // When the user types in a field, mark it as "given" by removing any computed class.
      inputs[key].classList.remove("is-computed");
      recompute();
    });
  });

  const rightToggle = document.getElementById("right-toggle") as HTMLInputElement;
  rightToggle.addEventListener("change", () => {
    state.rightTriangle = rightToggle.checked;
    if (state.rightTriangle) {
      inputs.C.value = "90";
      inputs.C.classList.add("is-locked");
      inputs.C.disabled = true;
    } else {
      inputs.C.disabled = false;
      inputs.C.classList.remove("is-locked");
      if (inputs.C.value === "90") inputs.C.value = "";
    }
    recompute();
  });

  const clearButton = document.getElementById("clear-btn") as HTMLButtonElement;
  clearButton.addEventListener("click", () => {
    ALL_KEYS.forEach((key) => {
      inputs[key].value = "";
      inputs[key].classList.remove("is-given", "is-computed");
    });
    if (state.rightTriangle) {
      inputs.C.value = "90";
    }
    recompute();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  attachListeners();
  recompute();
});
