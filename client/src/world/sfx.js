// Retro 8-bit sound effects synthesised with Web Audio: no sound files needed.

// Base pitch (Hz) of a footstep on each ground type.
const STEP_PITCH = { g: 220, d: 165, a: 147, s: 330 };
const STEP_VOLUME = 0.05;

// A short square-wave blip that drops an octave: the classic chiptune footstep.
// Alternating steps (left/right) are pitched slightly differently, and `soft` makes a quieter landing.
export function playStep(context, destination, terrain, alternate, soft = false) {
  const t = context.currentTime;
  const base = (STEP_PITCH[terrain] ?? STEP_PITCH.g) * (alternate ? 0.89 : 1);
  const duration = terrain === 's' ? 0.05 : 0.07;

  const osc = context.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(base * 2, t);
  osc.frequency.exponentialRampToValueAtTime(base, t + duration * 0.6);

  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(STEP_VOLUME * (soft ? 0.5 : 1), t + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

  osc.connect(gain).connect(destination);
  osc.start(t);
  osc.stop(t + duration + 0.01);
}

// Rain ambience: a soft, steady patter of falling rain (looping noise, filtered to a gentle hiss).
// setLevel(0..1) fades it smoothly; muffled (indoors) closes the tone down. Returns { setLevel(level, muffled), stop() }.
const RAIN_VOLUME = 0.16;

function noiseBuffer(context, seconds) {
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * seconds), context.sampleRate);
  const data = buffer.getChannelData(0);
  // Pink-ish noise (Paul Kellet's filter): softer than white noise, more like real rain.
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + white * 0.099046;
    b1 = 0.963 * b1 + white * 0.2965164;
    b2 = 0.57 * b2 + white * 1.0526913;
    data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.2;
  }
  return buffer;
}

export function createRainSound(context, destination) {
  const master = context.createGain();
  master.gain.value = 0;
  // The patter: noise with the low end cut, so it sounds like drops rather than a roar.
  const source = context.createBufferSource();
  source.buffer = noiseBuffer(context, 3);
  source.loop = true;
  const highpass = context.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 1100;
  // Softens the top; closed down further when muffled indoors.
  const tone = context.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 7500;
  source.connect(highpass).connect(tone).connect(master).connect(destination);
  source.start();

  let stopped = false;
  return {
    setLevel(level, muffled = false) {
      if (stopped) return;
      const t = context.currentTime;
      master.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * RAIN_VOLUME * (muffled ? 0.55 : 1), t, 0.4);
      tone.frequency.setTargetAtTime(muffled ? 1600 : 7500, t, 0.3);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      try { source.stop(); } catch { /* already stopped */ }
      master.disconnect();
    },
  };
}
