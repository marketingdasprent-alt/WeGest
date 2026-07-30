import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NotificationCenter, type NotificationFilter } from './notification-center';
import type { Tables } from '@/integrations/supabase/types';

type Notificacao = Tables<'notificacoes'>;

function notif(overrides: Partial<Notificacao>): Notificacao {
  return {
    id: 'n-1',
    org_id: 'org-1',
    tipo: 'contrato_renting_renovacao_proxima',
    candidatura_id: null,
    link: '/renting/contratos/c-1',
    destinatario_id: null,
    destinatario_user_id: null,
    evento_id: null,
    viatura_id: null,
    titulo: 'Contrato a renovar',
    mensagem: null,
    severidade: 'normal',
    resolvida: false,
    resolvida_por: null,
    resolvida_por_nome: null,
    resolvida_em: null,
    created_at: '2026-07-27T16:00:00.000Z',
    ...overrides,
  } as Notificacao;
}

function renderCenter(notificacoes: Notificacao[], onMarkAsRead = vi.fn()) {
  const onFiltroChange = vi.fn();
  render(
    <MemoryRouter>
      <NotificationCenter
        notificacoes={notificacoes}
        isLoading={false}
        error={null}
        filtro={'unread' as NotificationFilter}
        onFiltroChange={onFiltroChange}
        onMarkAsRead={onMarkAsRead}
        onLoadMore={() => {}}
        hasMore={false}
        isLoadingMore={false}
        unreadCount={0}
      />
    </MemoryRouter>
  );
  return { onMarkAsRead, onFiltroChange };
}

describe('NotificationCenter', () => {
  it('mostra notificações com títulos distintos normalmente, uma a uma', () => {
    renderCenter([
      notif({ id: 'n-1', titulo: 'Seguro de viatura a expirar', link: '/viaturas/v-1' }),
      notif({ id: 'n-2', titulo: 'Contrato a renovar', link: '/renting/contratos/c-1' }),
    ]);

    expect(screen.getByText('Seguro de viatura a expirar')).toBeTruthy();
    expect(screen.getByText('Contrato a renovar')).toBeTruthy();
  });

  it('agrupa várias notificações com o mesmo título numa única linha com contador', () => {
    renderCenter([
      notif({ id: 'n-1', titulo: 'Contrato a renovar', link: '/renting/contratos/c-1' }),
      notif({ id: 'n-2', titulo: 'Contrato a renovar', link: '/renting/contratos/c-2' }),
      notif({ id: 'n-3', titulo: 'Contrato a renovar', link: '/renting/contratos/c-3' }),
    ]);

    // Só uma linha de "Contrato a renovar" (o grupo), não três.
    expect(screen.getAllByText('Contrato a renovar').length).toBe(1);
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('expande o grupo ao clicar e mostra as entradas individuais com os seus próprios links', () => {
    renderCenter([
      notif({ id: 'n-1', titulo: 'Contrato a renovar', link: '/renting/contratos/c-1' }),
      notif({ id: 'n-2', titulo: 'Contrato a renovar', link: '/renting/contratos/c-2' }),
    ]);

    fireEvent.click(screen.getByText('Contrato a renovar'));

    const linksVer = screen.getAllByRole('button', { name: /Ver contrato/i });
    expect(linksVer.length).toBe(2);
  });

  it('não agrupa quando só existe uma notificação com aquele título', () => {
    renderCenter([notif({ id: 'n-1', titulo: 'Contrato a renovar' })]);

    expect(screen.queryByText('1')).toBeNull();
    expect(screen.getAllByRole('button', { name: /Ver contrato/i }).length).toBe(1);
  });

  it('botão "Resolver todas" aparece com 2+ não resolvidas e resolve cada uma', () => {
    const { onMarkAsRead } = renderCenter([
      notif({ id: 'n-1', titulo: 'Contrato a renovar' }),
      notif({ id: 'n-2', titulo: 'Seguro de viatura a expirar', link: '/viaturas/v-1' }),
    ]);

    fireEvent.click(screen.getByRole('button', { name: /Resolver todas/i }));

    expect(onMarkAsRead).toHaveBeenCalledWith('n-1');
    expect(onMarkAsRead).toHaveBeenCalledWith('n-2');
    expect(onMarkAsRead).toHaveBeenCalledTimes(2);
  });

  it('não mostra "Resolver todas" com só 1 notificação', () => {
    renderCenter([notif({ id: 'n-1' })]);
    expect(screen.queryByRole('button', { name: /Resolver todas/i })).toBeNull();
  });

  it('mantém o estado vazio quando não há notificações', () => {
    renderCenter([]);
    expect(screen.getByText('Sem notificações')).toBeTruthy();
  });
});

// ── Regressões de layout e legibilidade ─────────────────────────────────────
// O painel aparecia com o título quebrado uma palavra por linha, barra de
// scroll horizontal, botões cortados a meio ("Resol...") e, ao expandir um
// grupo, uma lista de URLs em cru.
describe('NotificationCenter — legibilidade do painel', () => {
  function comItens(total: number) {
    return notif({
      id: 'n-grp',
      tipo: 'assistencia_ticket_aberto_demasiado_tempo',
      titulo: 'Ticket aberto há demasiado tempo',
      link: '/assistencia',
      agrupadas: total,
      // Prefixos distintos, como em uuids reais: a referência curta usa os
      // primeiros 8 caracteres, e é isso que distingue as entradas na lista.
      itens: Array.from({ length: total }, (_, i) => ({
        link: `/assistencia/${String(i + 1).repeat(8)}-5499-402a-b744-ae7ff8713c22`,
      })),
    } as Partial<Notificacao>);
  }

  it('a lista expandida nunca mostra o URL em cru', () => {
    renderCenter([comItens(3)]);
    fireEvent.click(screen.getByRole('button', { name: /Ver 3/ }));

    // Nenhum texto visível pode ser um caminho da aplicação.
    const comBarra = screen
      .getAllByRole('button')
      .filter((b) => (b.textContent ?? '').includes('/assistencia/'));
    expect(comBarra).toEqual([]);

    // E cada entrada é identificável e distinta das outras.
    expect(screen.getByText('Ticket #11111111')).toBeTruthy();
    expect(screen.getByText('Ticket #22222222')).toBeTruthy();
    expect(screen.getByText('Ticket #33333333')).toBeTruthy();
  });

  it('a fila de ações dobra em vez de transbordar o painel', () => {
    // Três botões (Ver ticket / Ver 3 / Resolver) não cabem lado a lado num
    // popover estreito; sem `flex-wrap` empurravam a largura do painel.
    renderCenter([comItens(3)]);
    const acoes = document.querySelector('[class*="flex-wrap"]');
    expect(acoes).toBeTruthy();
    expect(acoes?.className).toContain('flex-wrap');
  });

  it('há um só controlo por ação — sem o chevron duplicado', () => {
    renderCenter([notif({ id: 'n-1', titulo: 'Contrato a renovar' })]);

    // Existia um botão extra com aria-label "Abrir" que navegava para o mesmo
    // destino do botão "Ver contrato" ao lado.
    expect(screen.queryByRole('button', { name: 'Abrir' })).toBeNull();
    expect(screen.getAllByRole('button', { name: /Ver contrato/ })).toHaveLength(1);
  });

  it('uma notificação sem título não renderiza um cartão em branco', () => {
    renderCenter([notif({ id: 'n-vazio', titulo: '' as never })]);
    expect(screen.getByText('Aviso do sistema')).toBeTruthy();
  });

  it('não usa emoji nem cores fixas de tema no cartão', () => {
    const { container } = { container: document.body };
    renderCenter([notif({ id: 'n-urg', severidade: 'urgente', titulo: 'Escalonamento' })]);
    expect(container.textContent).not.toContain('🔴');
    expect(container.innerHTML).not.toMatch(/\b(text|bg|border)-red-\d/);
  });
});
