// Spoken prompts. Each manoeuvre is announced once at 400 m, 100 m and 20 m.
// The speaker is injected so the logic runs in Node tests; the browser default
// uses the built-in speech synthesis, which the Android WebView provides.

const PROMPT_DISTANCES_M = [400, 100, 20];

function createVoice(options) {
  const speak = options && options.speak ? options.speak : defaultSpeak;
  let stepIndex = -1;
  let spoken = new Set();

  // Called with each navigator update. Speaks at most one prompt per call,
  // the closest threshold the device has crossed, so a jump past several
  // thresholds does not read out a stack of stale prompts.
  function onUpdate(state) {
    if (state.stepIndex !== stepIndex) {
      stepIndex = state.stepIndex;
      spoken = new Set();
    }
    if (state.arrived) {
      if (!spoken.has('arrived')) {
        spoken.add('arrived');
        speak('You have arrived');
      }
      return;
    }
    const crossed = PROMPT_DISTANCES_M.filter(
      (t) => state.distanceToNextM <= t && !spoken.has(t)
    );
    if (crossed.length === 0) return;
    const closest = Math.min(...crossed);
    // Every threshold at or above the closest one is now covered, so a later
    // update cannot repeat the larger prompts.
    for (const t of PROMPT_DISTANCES_M) if (t >= closest) spoken.add(t);
    speak(closest === PROMPT_DISTANCES_M[2] ? state.instruction : `In ${closest} metres, ${lowerFirst(state.instruction)}`);
  }

  return { onUpdate };
}

function lowerFirst(s) {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

function defaultSpeak(text) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  window.speechSynthesis.speak(u);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createVoice, PROMPT_DISTANCES_M };
}
