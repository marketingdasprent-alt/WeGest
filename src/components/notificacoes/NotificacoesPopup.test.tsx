import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * O canto do ecrã é um aviso de CHEGADA, não um espelho do que está por
 * resolver. Estes testes fixam essa distinção: o backlog vive no sino e em
 * /notificacoes, e o canto só fala quando alguma coisa acontece agora.
 */

vi.mock('@/lib/notificationSound', () => ({
  armNotificationSound: vi.fn(),
  playNotificationSound: vi.fn(),
}));

const contexto = vi.fn();
vi.mock('@/contexts/NotificacoesContext', () => ({
  useNotificacoesContext: () => contexto(),
}));

import { NotificacoesPopup } from './NotificacoesPopup';

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

const dispensarChegada = vi.fn();

function montar({
  chegadas = [] as ReturnType<typeof notif>[],
  notificacoes = [] as ReturnType<typeof notif>[],
} = {}) {
  contexto.mockReturnValue({
    notificacoes,
    chegadas,
    dispensarChegada,
    resolver: vi.fn(),
    enabled: true,
    totalNaoResolvidas: notificacoes.length,
    erro: null,
    aCarregar: false,
  });
  return render(
    <MemoryRouter>
      <NotificacoesPopup />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  dispensarChegada.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('NotificacoesPopup', () => {
  it('não mostra nada quando só existe backlog por resolver', () => {
    // Era este o bug: entrar no sistema ou dar F5 enchia o canto com tudo o
    // que estava por tratar, e o utilizador tinha de o fechar outra vez.
    const { container } = montar({
      chegadas: [],
      notificacoes: [notif('a'), notif('b'), notif('c')],
    });

    // Asserção de DOM em vez de matcher jest-dom: os ficheiros incluídos no
    // tsconfig.strict.json não têm os tipos de @testing-library/jest-dom.
    expect(container.innerHTML).toBe('');
  });

  it('mostra o cartão de um aviso que acabou de chegar', () => {
    montar({ chegadas: [notif('n1')], notificacoes: [notif('n1')] });

    expect(screen.queryByText('Aviso n1')).not.toBeNull();
  });

  it('um aviso normal sai do canto sozinho, sem o utilizador ter de o fechar', () => {
    montar({ chegadas: [notif('n1')], notificacoes: [notif('n1')] });

    act(() => {
      vi.advanceTimersByTime(11_000);
    });

    expect(dispensarChegada).toHaveBeenCalledWith('n1');
  });

  it('um aviso urgente fica no canto até ser fechado', () => {
    // Um escalonamento exige uma decisão humana — não pode evaporar-se
    // enquanto o supervisor está a olhar para outro lado.
    montar({
      chegadas: [notif('u1', { severidade: 'urgente' })],
      notificacoes: [notif('u1', { severidade: 'urgente' })],
    });

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(dispensarChegada).not.toHaveBeenCalled();
    expect(screen.queryByText('Aviso u1')).not.toBeNull();
  });

  it('fechar um aviso dispensa-o sem o resolver', () => {
    const resolver = vi.fn();
    contexto.mockReturnValue({
      notificacoes: [notif('n1')],
      chegadas: [notif('n1')],
      dispensarChegada,
      resolver,
      enabled: true,
      totalNaoResolvidas: 1,
      erro: null,
      aCarregar: false,
    });
    render(
      <MemoryRouter>
        <NotificacoesPopup />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /ocultar aviso/i }));

    expect(dispensarChegada).toHaveBeenCalledWith('n1');
    expect(resolver).not.toHaveBeenCalled();
  });

  it('não mostra nada quando a leitura está desativada', () => {
    contexto.mockReturnValue({
      notificacoes: [notif('n1')],
      chegadas: [notif('n1')],
      dispensarChegada,
      resolver: vi.fn(),
      enabled: false,
      totalNaoResolvidas: 1,
      erro: null,
      aCarregar: false,
    });

    const { container } = render(
      <MemoryRouter>
        <NotificacoesPopup />
      </MemoryRouter>
    );

    // Asserção de DOM em vez de matcher jest-dom: os ficheiros incluídos no
    // tsconfig.strict.json não têm os tipos de @testing-library/jest-dom.
    expect(container.innerHTML).toBe('');
  });
});
