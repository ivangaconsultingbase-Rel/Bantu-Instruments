import { SynthEngine } from "./audio/SynthEngine.js";
import { Sequencer } from "./sequencer/Sequencer.js";
import { UI } from "./ui/UI.js";

function lcd(msg){
  const el = document.getElementById("kb-hint") || document.getElementById("seq-hint");
  if (el) el.textContent = msg;
}

async function start(){
  try{
    lcd("BOOT…");

    const synth = new SynthEngine();
    await synth.init();
    lcd("AUDIO OK");

    let ui = null;

    const seq = new Sequencer(synth, (step) => ui?.onStepChange(step));
    ui = new UI(synth, seq);

    // unlock audio on first gesture
    window.addEventListener("pointerdown", () => synth.resume(), { once: true });

    ui.init();
    lcd("UI OK · Tap keys / Play");

  }catch(err){
    console.error(err);
    lcd("BOOT ERROR (see console on desktop)");
    // fallback: show error string
    const p = document.createElement("pre");
    p.style.whiteSpace = "pre-wrap";
    p.style.fontSize = "12px";
    p.style.color = "#ff6b6b";
    p.textContent = String(err?.stack || err);
    document.body.prepend(p);
  }
}

start();
