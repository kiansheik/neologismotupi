type SfxType = "correct" | "incorrect" | "combo" | "finish" | "streak";

let audioContext: AudioContext | null = null;

const getAudioContext = (): AudioContext | null => {
  if (typeof window === "undefined") {
    return null;
  }

  if (!audioContext) {
    audioContext = new AudioContext();
  }

  return audioContext;
};

const beep = (
  frequency: number,
  durationMs: number,
  gainValue: number,
  offsetSec = 0,
): void => {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "triangle";
  oscillator.frequency.value = frequency;

  const start = context.currentTime + offsetSec;
  const end = start + durationMs / 1000;

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  oscillator.connect(gain);
  gain.connect(context.destination);

  oscillator.start(start);
  oscillator.stop(end);
};

export const playSfx = (type: SfxType): void => {
  switch (type) {
    case "correct":
      beep(600, 80, 0.2);
      beep(820, 100, 0.16, 0.06);
      return;
    case "incorrect":
      beep(220, 120, 0.2);
      beep(170, 140, 0.15, 0.08);
      return;
    case "combo":
      beep(660, 70, 0.2);
      beep(930, 80, 0.16, 0.06);
      beep(1240, 90, 0.15, 0.12);
      return;
    case "finish":
      beep(520, 90, 0.2);
      beep(700, 90, 0.18, 0.08);
      beep(920, 120, 0.16, 0.16);
      return;
    case "streak":
      beep(480, 80, 0.2);
      beep(700, 100, 0.17, 0.07);
      beep(980, 120, 0.16, 0.16);
      beep(1320, 130, 0.13, 0.26);
      return;
    default:
      return;
  }
};
