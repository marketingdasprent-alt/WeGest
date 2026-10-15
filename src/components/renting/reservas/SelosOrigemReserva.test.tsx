import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReservasTabela } from './ReservasTabela';
import { selosDaReserva } from './selosReserva';
import type { Reserva } from '@/types/reserva';

function reserva(over: Partial<Reserva>): Reserva {
  return {
    id: 'r1',
    codigo: 101,
    matricula: 'AA-00-BB',
    regime: 'rent_a_car',
    estado: 'pendente',
    data_inicio: '2026-10-20T10:00:00Z',
    data_fim: '2026-10-25T10:00:00Z',
    origem: 'app',
    modelo_id: null,
    dados_site: null,
    ...over,
  } as Reserva;
}

function renderTabela(reservas: Reserva[]) {
  return render(
    <ReservasTabela
      reservas={reservas}
      isLoading={false}
      totalSemFiltros={reservas.length}
      sortColumn="data_inicio"
      sortDir="asc"
      onSort={vi.fn()}
      onRowClick={vi.fn()}
      getEstacaoNome={() => '—'}
      getCondutorNome={() => '—'}
    />
  );
}

describe('selosDaReserva', () => {
  it('reserva sem origem (ex.: devolvida por outra query) conta como app', () => {
    expect(selosDaReserva({ dados_site: null })).toEqual([]);
  });

  it('reserva da app não tem selos', () => {
    expect(selosDaReserva({ origem: 'app', dados_site: { cliente_divergente: true } })).toEqual([]);
  });

  it('reserva do site tem o selo Site', () => {
    const selos = selosDaReserva({ origem: 'site', dados_site: { cliente_divergente: false } });
    expect(selos.map((s) => s.chave)).toEqual(['site']);
  });

  it('cliente divergente acrescenta "Confirmar identidade"', () => {
    const selos = selosDaReserva({ origem: 'site', dados_site: { cliente_divergente: true } });
    expect(selos.map((s) => s.chave)).toEqual(['site', 'confirmar_identidade']);
  });
});

describe('ReservasTabela — selos de origem', () => {
  it('mostra o selo Site, com o aviso no title, só na reserva do site', () => {
    renderTabela([
      reserva({ id: 'a', codigo: 1, origem: 'app' }),
      reserva({ id: 's', codigo: 2, origem: 'site' }),
    ]);
    const selos = screen.getAllByText('Site');
    expect(selos).toHaveLength(1);
    expect(selos[0].closest('[title]')?.getAttribute('title')).toBe(
      'Reserva feita no site da Década: confirmar e, se preciso, trocar a viatura'
    );
    expect(screen.queryByText('Confirmar identidade')).toBeNull();
  });

  it('reserva da app não mostra selo nenhum', () => {
    renderTabela([reserva({ origem: 'app' })]);
    expect(screen.queryByText('Site')).toBeNull();
  });

  it('mostra "Confirmar identidade" quando o cliente diverge', () => {
    renderTabela([reserva({ origem: 'site', dados_site: { cliente_divergente: true } })]);
    expect(screen.getByText('Confirmar identidade')).toBeTruthy();
  });
});
