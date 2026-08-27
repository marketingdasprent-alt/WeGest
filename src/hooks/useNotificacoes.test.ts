import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

/**
 * O canto do ecrã (NotificacoesPopup) mostrava `notificacoes` — a lista INTEIRA
 * de não-resolvidas. Isso faz do popup um espelho permanente do backlog em vez
 * de um aviso de chegada: tudo o que está por resolver volta ao canto em cada
 * aba nova e em cada arranque do browser, e o agrupamento cria uma linha nova
 * por (tipo, dia), pelo que o backlog engorda sozinho todos os dias.
 *
 * `chegadas` é a lista do que chegou DEPOIS de o hook arrancar. É o que o canto
 * passa a mostrar; o backlog vive no sino e em /notificacoes.
 */

const h = vi.hoisted(() => ({
  resposta: { data: [] as unknown[], error: null as unknown, count: 0 },
  handlers: [] as Array<(payload: unknown) => void>,
  removeChannel: null as unknown,
}));

vi.mock('@/integrations/supabase/client', () => {
  const canal: Record<string, unknown> = {};
  canal.on = vi.fn((_evento: string, _filtro: unknown, cb: (p: unknown) => void) => {
    h.handlers.push(cb);
    return canal;
  });
  canal.subscribe = vi.fn(() => canal);

  const removeChannel = vi.fn();
  h.removeChannel = removeChannel;

  return {
    supabase: {
      from: vi.fn(() => {
        const b: Record<string, unknown> = {};
        b.select = vi.fn(() => b);
        b.eq = vi.fn(() => b);
        b.order = vi.fn(() => b);
        b.limit = vi.fn(() => Promise.resolve(h.resposta));
        return b;
      }),
      rpc: vi.fn(() => Promise.resolve({ error: null })),
      channel: vi.fn(() => canal),
      removeChannel,
    },
  };
});

vi.mock('@/lib/notificationSound', () => ({
  playNotificationSound: vi.fn(),
  armNotificationSound: vi.fn(),
}));

import { useNotificacoes } from './useNotificacoes';

function notif(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    org_id: 'org-1',
    tipo: 'viatura_seguro_expirando',
    titulo: `Aviso ${id}`,
    mensagem: null,
    severidade: 'normal',
    resolvida: false,
    created_at: '2026-08-26T10:00:00.000Z',
    agrupadas: 1,
    itens: null,
    ...extra,
  };
}

function comBacklog(linhas: ReturnType<typeof notif>[]) {
  h.resposta = { data: linhas, error: null, count: linhas.length };
}

async function montar() {
  const vista = renderHook(() => useNotificacoes(true));
  await waitFor(() => expect(vista.result.current.aCarregar).toBe(false));
  return vista;
}

/** Entrega um evento de realtime ao handler subscrito pelo hook. */
function realtime(payload: unknown) {
  act(() => {
    h.handlers.forEach((cb) => cb(payload));
  });
}

beforeEach(() => {
  h.handlers.length = 0;
  comBacklog([]);
});

describe('useNotificacoes — chegadas', () => {
  it('não trata o backlog do primeiro carregamento como chegada', async () => {
    // O bug relatado: entrar no sistema (ou F5) enchia o canto com tudo o que
    // estava por resolver. Um aviso que já lá estava não "chegou" agora.
    comBacklog([notif('a'), notif('b'), notif('c')]);

    const { result } = await montar();

    expect(result.current.notificacoes).toHaveLength(3);
    expect(result.current.chegadas).toEqual([]);
  });

  it('trata como chegada uma notificação recebida por realtime depois de arrancar', async () => {
    const { result } = await montar();

    realtime({ eventType: 'INSERT', new: notif('nova') });

    expect(result.current.chegadas.map((n) => n.id)).toEqual(['nova']);
  });

  it('trata como chegada uma notificação que só aparece no polling', async () => {
    // Rede de segurança para quando o realtime cai: o aviso continua a ter de
    // aparecer uma vez no canto, não a ser engolido em silêncio.
    const { result } = await montar();

    comBacklog([notif('tardia')]);
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() => expect(result.current.chegadas.map((n) => n.id)).toEqual(['tardia']));
  });

  it('não repete a mesma chegada quando o polling volta a devolvê-la', async () => {
    const { result } = await montar();

    comBacklog([notif('x')]);
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(result.current.chegadas).toHaveLength(1));

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(result.current.chegadas).toHaveLength(1);
  });

  it('dispensar uma chegada tira-a do canto mas mantém-na por resolver', async () => {
    // "Ocultar" nunca pode ser confundido com "Resolver": o aviso continua na
    // lista e no sino, só sai do canto.
    const { result } = await montar();
    realtime({ eventType: 'INSERT', new: notif('n1') });

    act(() => {
      result.current.dispensarChegada('n1');
    });

    expect(result.current.chegadas).toEqual([]);
    expect(result.current.notificacoes.map((n) => n.id)).toEqual(['n1']);
  });

  it('resolver uma notificação também a retira do canto', async () => {
    const { result } = await montar();
    realtime({ eventType: 'INSERT', new: notif('n1') });

    realtime({ eventType: 'UPDATE', new: notif('n1', { resolvida: true }) });

    expect(result.current.chegadas).toEqual([]);
    expect(result.current.notificacoes).toEqual([]);
  });

  it('uma notificação apagada desaparece do canto', async () => {
    const { result } = await montar();
    realtime({ eventType: 'INSERT', new: notif('n1') });

    realtime({ eventType: 'DELETE', old: { id: 'n1' } });

    expect(result.current.chegadas).toEqual([]);
  });

  it('esvazia o canto quando a leitura é desativada (rota pública, logout)', async () => {
    comBacklog([]);
    const { result, rerender } = renderHook(({ on }) => useNotificacoes(on), {
      initialProps: { on: true },
    });
    await waitFor(() => expect(result.current.aCarregar).toBe(false));
    realtime({ eventType: 'INSERT', new: notif('n1') });
    expect(result.current.chegadas).toHaveLength(1);

    rerender({ on: false });

    expect(result.current.chegadas).toEqual([]);
  });
});
