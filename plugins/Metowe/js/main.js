import { SynthEngine } from "./audio/SynthEngine.js";

const synth = new SynthEngine();

await synth.init();

window.addEventListener("pointerdown", () => synth.resume());

document.addEventListener("keydown", e => {

  const noteMap = {
    a:60,
    s:62,
    d:64,
    f:65,
    g:67,
    h:69,
    j:71,
    k:72
  };

  const note = noteMap[e.key];

  if(note)
    synth.noteOn(note);

});
