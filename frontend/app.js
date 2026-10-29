"use strict";

(() => {
  const $ = (id) => document.getElementById(id);
  const config = window.MATHPHYSICS_CONFIG || { API_BASE_URL: "" };
  const expression = $("expression");
  const calcResult = $("calcResult");
  const calcMessage = $("calcMessage");
  const historyList = $("historyList");
  let lastAnswer = 0;
  const history = [];

  function showResult(message, result, isError = false) {
    calcMessage.textContent = message;
    calcResult.textContent = result;
    calcMessage.style.color = isError ? "var(--danger)" : "var(--muted)";
  }

  function getMath() {
    if (!window.math) throw new Error("Calculator library did not load. Check your internet connection and reload.");
    return window.math;
  }

  function calculate() {
    const raw = expression.value.trim();
    if (!raw) {
      showResult("Enter an expression first", "—", true);
      return;
    }
    try {
      const math = getMath();
      const mode = $("angleMode").value;
      // Math.js evaluates expressions, not arbitrary JavaScript. Keep a narrow allow-list.
      const node = math.parse(raw);
      const allowedFunctions = new Set([
        "sin","cos","tan","asin","acos","atan","sqrt","abs","log","log10",
        "exp","round","floor","ceil","min","max","pow"
      ]);
      node.traverse((part) => {
        if (part.isFunctionNode && !allowedFunctions.has(part.name)) {
          throw new Error(`Function "${part.name}" is not allowed.`);
        }
        if (part.isSymbolNode && !["pi","e","ans","sin","cos","tan","asin","acos","atan","sqrt","abs","log","log10","exp","round","floor","ceil","min","max","pow"].includes(part.name)) {
          throw new Error(`Unknown symbol "${part.name}". Use the supported calculator buttons.`);
        }
      });
      const scope = {
        pi: Math.PI, e: Math.E, ans: lastAnswer,
        sin: (x) => Math.sin(mode === "deg" ? x * Math.PI / 180 : x),
        cos: (x) => Math.cos(mode === "deg" ? x * Math.PI / 180 : x),
        tan: (x) => Math.tan(mode === "deg" ? x * Math.PI / 180 : x),
        asin: (x) => mode === "deg" ? Math.asin(x) * 180 / Math.PI : Math.asin(x),
        acos: (x) => mode === "deg" ? Math.acos(x) * 180 / Math.PI : Math.acos(x),
        atan: (x) => mode === "deg" ? Math.atan(x) * 180 / Math.PI : Math.atan(x),
        sqrt: Math.sqrt, abs: Math.abs, log: Math.log, log10: Math.log10,
        exp: Math.exp, round: Math.round, floor: Math.floor, ceil: Math.ceil,
        min: Math.min, max: Math.max, pow: Math.pow
      };
      const value = node.compile().evaluate(scope);
      if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("The result is not a finite real number.");
      lastAnswer = value;
      const formatted = Number(value.toPrecision(12)).toString();
      showResult("Calculated successfully", formatted);
      history.unshift({ expression: raw, result: formatted });
      if (history.length > 8) history.pop();
      renderHistory();
    } catch (error) {
      showResult("Could not calculate", error.message || "Please check your expression.", true);
    }
  }

  function renderHistory() {
    historyList.replaceChildren();
    if (!history.length) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "Your calculations will appear here.";
      historyList.append(li);
      return;
    }
    history.forEach((item) => {
      const li = document.createElement("li");
      const code = document.createElement("code");
      code.textContent = item.expression;
      li.append(code, document.createTextNode(` = ${item.result}`));
      historyList.append(li);
    });
  }

  $("keypad").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.action === "clear") {
      expression.value = "";
      showResult("Ready to calculate", "0");
      expression.focus();
      return;
    }
    if (button.dataset.action === "calculate") {
      calculate();
      return;
    }
    const insert = button.dataset.insert;
    if (insert) {
      const start = expression.selectionStart ?? expression.value.length;
      const end = expression.selectionEnd ?? expression.value.length;
      expression.setRangeText(insert, start, end, "end");
      expression.focus();
    }
  });
  expression.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); calculate(); }
  });
  $("backspaceBtn").addEventListener("click", () => {
    const start = expression.selectionStart ?? expression.value.length;
    const end = expression.selectionEnd ?? expression.value.length;
    if (start !== end) expression.setRangeText("", start, end, "end");
    else if (start > 0) expression.setRangeText("", start - 1, start, "end");
    expression.focus();
  });
  $("clearHistoryBtn").addEventListener("click", () => { history.length = 0; renderHistory(); });

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("active", item === tab));
      document.querySelectorAll(".panel").forEach((panel) => panel.classList.toggle("hidden", panel.id !== tab.dataset.panel));
    });
  });

  async function postToApi(path, body) {
    if (!config.API_BASE_URL) throw new Error("Python API is not configured yet. Deploy the backend, then set API_BASE_URL in frontend/config.js.");
    const response = await fetch(`${config.API_BASE_URL.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || data.error || `API request failed (${response.status}).`);
    return data;
  }

  $("solverForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const output = $("solverOutput");
    const button = event.submitter;
    output.className = "output-card";
    output.textContent = "Solving equation…";
    if (button) button.disabled = true;
    try {
      const data = await postToApi("/solve", {
        equation: $("equationInput").value.trim(),
        variable: $("variableInput").value.trim()
      });
      output.classList.add("success");
      output.textContent = `Equation: ${data.equation}\nVariable: ${data.variable}\nSolutions: ${data.solutions.length ? data.solutions.join(", ") : "No solutions returned"}\n\nMethod: ${data.method}\n${data.note || ""}`;
    } catch (error) {
      output.classList.add("error");
      output.textContent = error.message;
    } finally {
      if (button) button.disabled = false;
    }
  });

  $("tutorForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const output = $("tutorOutput");
    const button = event.submitter;
    output.className = "output-card tutor-output";
    output.textContent = "Preparing your tutor response…";
    if (button) button.disabled = true;
    try {
      const data = await postToApi("/tutor", {
        question: $("tutorQuestion").value.trim(),
        style: $("tutorStyle").value
      });
      output.classList.add("success");
      output.textContent = data.answer;
    } catch (error) {
      output.classList.add("error");
      output.textContent = error.message;
    } finally {
      if (button) button.disabled = false;
    }
  });
})();
