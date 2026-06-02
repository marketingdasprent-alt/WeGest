// Som de notificação gerado no browser (Web Audio API) — sem ficheiros externos.
// `urgent` toca uma sequência mais marcada para o aviso ao supervisor.
export function playNotificationSound(urgent = false): void {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;

    const ctx = new Ctx();

    const beep = (freq: number, start: number, dur: number, volume: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t0 = ctx.currentTime + start;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.start(t0);
      osc.stop(t0 + dur);
    };

    if (urgent) {
      // três toques ascendentes, mais altos
      beep(880, 0, 0.18, 0.35);
      beep(1175, 0.22, 0.18, 0.35);
      beep(880, 0.44, 0.22, 0.35);
    } else {
      // duplo toque suave
      beep(660, 0, 0.15, 0.22);
      beep(880, 0.17, 0.18, 0.22);
    }

    window.setTimeout(() => ctx.close().catch(() => {}), 1500);
  } catch {
    // Som é não-crítico: ignora falhas (ex.: autoplay bloqueado).
  }
}
