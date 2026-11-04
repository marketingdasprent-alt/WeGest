import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/hooks/useMotoristaTab', () => ({ useMotoristaTab: () => ({ irPara: vi.fn() }) }));
vi.mock('@/hooks/useMotoristaDashboardStats', () => ({
  useMotoristaDashboardStats: () => ({
    data: {
      saldoPendente: -1.99,
      recibosEmValidacao: [],
      semanasEmFalta: [{ value: '2026-10-26', label: '26 out' }],
      docsExpirando: [],
    },
    isLoading: false,
    error: null,
  }),
}));
vi.mock('@/hooks/useMotoristaViaturaAtual', () => ({
  useMotoristaViaturaAtual: () => ({
    data: { matricula: 'BV-75-DG', marca: 'Fiat', modelo: 'Grande Panda', kmAtual: 37932 },
    isLoading: false,
  }),
}));
vi.mock('@/hooks/useKmDaSemana', () => ({ useKmDaSemana: () => ({ data: { entregue: false } }) }));
vi.mock('@/hooks/useAcordoVistaDevedor', () => ({ useMeusAcordosAtivos: () => ({ data: [] }) }));
vi.mock('@/hooks/useExtratoSemanal', () => ({
  useExtratoSemanal: () => ({
    extrato: null,
    isLoading: false,
    error: null,
    inicio: new Date(2026, 10, 2),
    fim: new Date(2026, 10, 8),
    semanasAtras: 0,
    podeAnterior: true,
    anterior: vi.fn(),
    seguinte: vi.fn(),
  }),
}));
vi.mock('../MotoristaRegistarKmCard', () => ({
  MotoristaRegistarKmCard: () => <div data-testid="pedir-km" />,
}));
vi.mock('../MotoristaExtratoCard', () => ({ MotoristaExtratoCard: () => null }));

import { InicioTab } from './InicioTab';
import type { MotoristaAtivo } from '@/hooks/useMotoristaAtivo';

const motorista = { id: 'm1', nome: 'Marcos Alves da Cruz' } as MotoristaAtivo;

describe('InicioTab — ficha ativa ou inativa', () => {
  it('ficha ativa: pede os km e mostra o carro atual', () => {
    render(<InicioTab motorista={motorista} usaRecibos fichaAtiva />);
    expect(screen.getByTestId('pedir-km')).toBeTruthy();
    expect(screen.getByText('BV-75-DG')).toBeTruthy();
  });

  it('ficha inativa: não pede km nem mostra o carro, avisa que é só histórico', () => {
    render(<InicioTab motorista={motorista} usaRecibos={false} fichaAtiva={false} />);
    expect(screen.queryByTestId('pedir-km')).toBeNull();
    expect(screen.queryByText('BV-75-DG')).toBeNull();
    expect(screen.getByText(/Já não está a trabalhar com esta empresa/)).toBeTruthy();
  });

  it('ficha inativa: o saldo continua visível', () => {
    render(<InicioTab motorista={motorista} usaRecibos={false} fichaAtiva={false} />);
    expect(screen.getAllByText(/1,99/).length).toBeGreaterThan(0);
  });
});
