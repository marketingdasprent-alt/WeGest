import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { gsap } from '@/lib/motion/gsapConfig';

// jsdom não implementa requestAnimationFrame; o gsap.ticker usado por
// useMagneticHover precisa de um. Guardamos cada timeout que o nosso
// próprio polyfill cria para os poder limpar todos no afterEach — evita
// qualquer callback pendente disparar depois do jsdom deste ficheiro
// desmontar.
const pendingRafTimeouts = new Set<ReturnType<typeof setTimeout>>();

if (typeof window !== 'undefined') {
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    const id = setTimeout(() => {
      pendingRafTimeouts.delete(id);
      cb(performance.now());
    }, 16);
    pendingRafTimeouts.add(id);
    return id as unknown as number;
  }) as typeof window.requestAnimationFrame;

  window.cancelAnimationFrame = ((id: number) => {
    pendingRafTimeouts.delete(id as unknown as ReturnType<typeof setTimeout>);
    clearTimeout(id);
  }) as typeof window.cancelAnimationFrame;
}

// jsdom não implementa matchMedia; useReducedMotion (framer-motion) e
// useSimplifiedMotion chamam-no em vários componentes da landing.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    media: '',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  gsap.ticker.sleep();
  pendingRafTimeouts.forEach((id) => clearTimeout(id));
  pendingRafTimeouts.clear();
});

// Mock do client Supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: {
      getSession: vi.fn(),
    },
    functions: {
      invoke: vi.fn(),
    },
  },
}));
