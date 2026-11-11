const MUTE_KEY = "sweaties:sound-muted";

export function isSoundMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

const listeners = new Set<() => void>();

export function subscribeSoundMuted(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setSoundMuted(muted: boolean) {
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // Private mode — the preference just won't persist this session.
  }
  listeners.forEach((listener) => listener());
}

let context: AudioContext | null = null;

function tone(ctx: AudioContext, frequency: number, start: number, duration: number) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.05);
}

/** A short two-note chime, synthesized — no audio asset to ship or cache. */
export function playKudosSound() {
  if (isSoundMuted()) return;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    context ??= new Ctor();
    void context.resume();
    const now = context.currentTime;
    tone(context, 784, now, 0.18); // G5
    tone(context, 1175, now + 0.09, 0.28); // D6
  } catch {
    // Audio is a nicety; never let it break kudos.
  }
}
