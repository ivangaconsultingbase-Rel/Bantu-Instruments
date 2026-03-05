import { SynthEngine } from "./audio/SynthEngine.js";
import { Sequencer } from "./sequencer/Sequencer.js";
import { UI } from "./ui/UI.js";

function showError(err) {
  const msg = (err && (err.stack || err.message)) ? (err.stack || err.message) : String(err);
  console.error(err);

  let box = document.getElementById("fatal-error");
  if (!box) {
    box = document.createElement("pre");
    box.id = "fatal-error";
    box.style.position = "fixed";
    box.style.left = "8px";
    box.style.right = "8px";
    box.style.bottom = "8px";
    box.style.maxHeight = "45vh";
    box.style.overflow = "auto";
    box.style.padding = "10px";
    box.style.margin = "0";
    box.style.background = "rgba(180,0,0,.92)";
    box.style.color = "white";
    box.style.zIndex = "999999";
    box.style.fontSize = "12px";
    box.style.borderRadius = "10px";
    box.style.whiteSpace = "pre-wrap";
    document.body.appendChild(box);
  }
  box.textContent = "JS ERROR:\n" + msg;
}

window.addEventListener("error", (e) => showError(e.error || e.message));
window.addEventListener("unhandledrejection", (e) => showError(e.reason));

(async () => {
  try {
    const synth = new SynthEngine();
    await synth.init();

    // ⚠️ ui est utilisé dans le callback du Sequencer, donc on le déclare avant
    let ui = null;

    const seq = new Sequencer(synth, (step) => ui?.onStepChange?.(step));
    ui = new UI(synth, seq);

    // Important sur mobile : unlock audio au premier geste
    window.addEventListener("pointerdown", () => synth.resume(), { once: true });

    ui.init();

    console.log("UI init OK");
  } catch (err) {
    showError(err);
  }
})();
