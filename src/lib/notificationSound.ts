// Som de notificação gerado no browser (Web Audio API) — sem ficheiros externos.
// `urgent` toca uma sequência mais marcada para o aviso ao supervisor.

let sharedCtx: AudioContext | null = null;
let armed = false;

function getAudioContext(): AudioContext | null {
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedCtx) {
    try {
      sharedCtx = new Ctx();
    } catch {
      return null;
    }
  }
  return sharedCtx;
}

/**
 * "Desbloqueia" o áudio. Os browsers só deixam tocar som depois de uma
 * interação do utilizador; se o aviso urgente chegar antes de qualquer
 * clique, o som sairia em silêncio. Ao chamar isto cedo (ex.: quando o
 * popup de notificações monta), o primeiro clique/tecla/toque resume o
 * AudioContext, garantindo que o aviso ao supervisor toca depois disso.
 */
export function armNotificationSound(): void {
  if (armed || typeof window === 'undefined') return;
  armed = true;

  const opts: AddEventListenerOptions = { passive: true };
  const resume = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    ['pointerdown', 'keydown', 'touchstart'].forEach((ev) =>
      window.removeEventListener(ev, resume, opts)
    );
  };

  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) =>
    window.addEventListener(ev, resume, opts)
  );
}

export function playNotificationSound(urgent = false): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    // Se ainda estiver suspenso, tenta resumir (pode já ter havido interação).
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

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

    // NÃO fechamos o AudioContext: é partilhado e reutilizado nos próximos avisos.
  } catch {
    // Som é não-crítico: ignora falhas (ex.: autoplay bloqueado).
  }
}
