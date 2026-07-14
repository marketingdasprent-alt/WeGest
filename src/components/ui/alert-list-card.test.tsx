import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AlertListCard, type AlertItem } from './alert-list-card';

const mockItems: AlertItem[] = [
  { id: '1', label: 'Extintor AB-12-34', valor: '15 dias', severity: 'high' },
  { id: '2', label: 'Contrato CT-0042', valor: 'Expirado', severity: 'critical' },
  { id: '3', label: 'Seguro CD-56-78', valor: '30 dias', severity: 'low' },
];

describe('AlertListCard', () => {
  it('renderiza título e items', () => {
    render(<AlertListCard titulo="Alertas Ativos" items={mockItems} emptyMessage="Sem alertas" />);
    expect(screen.getByText('Alertas Ativos')).toBeTruthy();
    expect(screen.getByText('Extintor AB-12-34')).toBeTruthy();
    expect(screen.getByText('Expirado')).toBeTruthy();
    expect(screen.getByText('30 dias')).toBeTruthy();
  });

  it('mostra emptyMessage quando items está vazio', () => {
    render(<AlertListCard titulo="Alertas" items={[]} emptyMessage="Sem alertas pendentes" />);
    expect(screen.getByText('Sem alertas pendentes')).toBeTruthy();
  });

  it('chama onItemClick ao clicar num item', () => {
    const onItemClick = vi.fn();
    render(
      <AlertListCard
        titulo="Alertas"
        items={mockItems}
        emptyMessage="Vazio"
        onItemClick={onItemClick}
      />
    );
    const item = screen.getByText('Extintor AB-12-34').closest('[role="button"]');
    expect(item).toBeTruthy();
    fireEvent.click(item!);
    expect(onItemClick).toHaveBeenCalledTimes(1);
    expect(onItemClick).toHaveBeenCalledWith(mockItems[0]);
  });

  it('renderiza severity critical com cor destaque', () => {
    const { container } = render(
      <AlertListCard
        titulo="Críticos"
        items={[{ id: '1', label: 'Item crítico', valor: 'Urgente', severity: 'critical' }]}
        emptyMessage="Vazio"
      />
    );
    const valorEl = screen.getByText('Urgente');
    // critical severity deve ter classe text-destructive
    expect(valorEl.className).toContain('text-destructive');
  });

  it('abre link quando clica em item com link (sem onItemClick)', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const itemsComLink: AlertItem[] = [
      { id: '1', label: 'Ver contrato', valor: 'CT-001', link: '/contratos/1' },
    ];
    render(<AlertListCard titulo="Contratos" items={itemsComLink} emptyMessage="Vazio" />);
    const item = screen.getByText('Ver contrato').closest('[role="button"]');
    expect(item).toBeTruthy();
    fireEvent.click(item!);
    expect(openSpy).toHaveBeenCalledWith('/contratos/1', '_blank', 'noopener');
    openSpy.mockRestore();
  });

  it('não abre link quando onItemClick está presente (sobrepõe-se)', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const onItemClick = vi.fn();
    const itemsComLink: AlertItem[] = [
      { id: '1', label: 'Item', valor: 'Valor', link: '/ignorado' },
    ];
    render(
      <AlertListCard
        titulo="Teste"
        items={itemsComLink}
        emptyMessage="Vazio"
        onItemClick={onItemClick}
      />
    );
    const item = screen.getByText('Item').closest('[role="button"]');
    fireEvent.click(item!);
    expect(onItemClick).toHaveBeenCalledTimes(1);
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });
});
