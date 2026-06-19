const SOUND_PREF_KEY = "pmcs_alarm_sound";

export function isAlarmSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const v = localStorage.getItem(SOUND_PREF_KEY);
  return v !== "off";
}

export function setAlarmSoundEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SOUND_PREF_KEY, enabled ? "on" : "off");
}

/** Short control-room beep via Web Audio (no asset file). */
export function playAlarmBeep(): void {
  if (typeof window === "undefined" || !isAlarmSoundEnabled()) return;
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.26);
    osc.onended = () => void ctx.close();
  } catch {
    // autoplay policy or unsupported environment
  }
}
