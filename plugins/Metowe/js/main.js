// js/main.js (debug-safe, iPhone friendly)
// - No static imports (so the file still runs even if a module path is wrong)
// - Shows a small overlay with status + any import errors
// - Tries multiple path variants (case-sensitive GitHub Pages fix)

function overlay() {
  let el = document.getElementById("boot-overlay");
  if (!el) {
    el = document.createElement("div");
    el.id = "boot-overlay";
    el.style.position = "fixed";
    el.style.left = "8px";
    el.style.right = "8px";
    el.style.top = "8px";
    el.style.zIndex = "999999";
    el.style.padding = "10px";
    el.style.borderRadius = "10px";
    el.style.background = "rgba(0,0,0,.85)";
    el.style.color = "white";
    el.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    el.style.fontSize = "12px";
    el.style.whiteSpace = "pre-wrap";
    el.style.lineHeight = "1.25";
    document.body.appendChild(el);
  }
  return el;
}

function logLine(s) {
  const el = overlay();
  el.textContent += (el.textContent ? "\n" : "") + s;
}

function setOverlay(s) {
  overlay().textContent = s;
}

function fmtErr(err) {
  if (!err) return "Unknown error";
  return err.stack || err.message || String(err);
}

window.addEventListener("error", (e) => {
  logLine("window.error: " + (e.message || "unknown"));
});

window.addEventListener("unhandledrejection", (e) => {
  logLine("unhandledrejection: " + fmtErr(e.reason));
});

// Try-import helper: tests multiple paths in order
async function importTry(paths) {
  let lastErr = null;
  for (const p of paths) {
    try {
      const mod = await import(p);
      return { mod, path: p };
    } catch (err) {
      lastErr = err;
      logLine(`import FAIL ${p}\n  ↳ ${String(err?.message || err)}`);
    }
  }
  throw lastErr || new Error("All import paths failed");
}

(async () => {
  setOverlay("BOOT: main.js running ✅\nChecking DOM…");

  // DOM sanity
  const ids = ["keyboard", "sequencer-grid", "seq-header", "play-btn", "bpm", "cutoff"];
  for (const id of ids) {
    const ok = !!document.getElementById(id);
    logLine(`DOM #${id}: ${ok ? "OK" : "MISSING"}`);
  }

  try {
    logLine("\nLoading modules…");

    // SynthEngine (usually stable)
    const synthImp = await importTry([
      "./audio/SynthEngine.js",
      "./Audio/SynthEngine.js",
    ]);
    logLine(`SynthEngine OK from: ${synthImp.path}`);

    // Sequencer (case-sensitive folder issues are common)
    const seqImp = await importTry([
      "./sequencer/Sequencer.js",
      "./Sequencer/Sequencer.js",
      "../sequencer/Sequencer.js",
      "../Sequencer/Sequencer.js",
    ]);
    logLine(`Sequencer OK from: ${seqImp.path}`);

    // UI (case-sensitive folder issues are common)
    const uiImp = await importTry([
      "./ui/UI.js",
      "./UI/UI.js",
      "./Ui/UI.js",
      "../ui/UI.js",
      "../UI/UI.js",
    ]);
    logLine(`UI OK from: ${uiImp.path}`);

    const { SynthEngine } = synthImp.mod;
    const { Sequencer } = seqImp.mod;
    const { UI } = uiImp.mod;

    logLine("\nInit audio + UI…");

    const synth = new SynthEngine();
    await synth.init();

    let ui = null;
    const seq = new Sequencer(synth, (step) => ui?.onStepChange?.(step));
    ui = new UI(synth, seq);

    // Important sur mobile : unlock audio au premier geste
    window.addEventListener("pointerdown", () => synth.resume(), { once: true });

    ui.init();

    // Post-check: did UI render keys/steps?
    const keyCount = document.querySelectorAll("#keyboard .kkey").length;
    const stepCount = document.querySelectorAll("#sequencer-grid .seq-step").length;
    logLine(`\nRendered keys: ${keyCount}`);
    logLine(`Rendered steps: ${stepCount}`);

    logLine("\nDONE ✅ (tu peux ignorer cet overlay, on l’enlèvera après)");
  } catch (err) {
    logLine("\nFATAL ❌");
    logLine(fmtErr(err));
  }
})();
