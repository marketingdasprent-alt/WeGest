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
