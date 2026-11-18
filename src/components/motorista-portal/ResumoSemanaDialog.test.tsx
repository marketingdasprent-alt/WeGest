import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const useAcertoSemanal = vi.fn();
vi.mock('@/hooks/useAcertoSemanal', () => ({
  useAcertoSemanal: (...a: unknown[]) => useAcertoSemanal(...a),
}));

import { ResumoSemanaDialog } from './ResumoSemanaDialog';

const despesas = {
  aluguer: 120,
  combustivel: 0,
  portagens: 0,
  outros_custos: 0,
  slot: 0,
  caucao: 0,
  seguros: 0,
  reparacoes: 0,
};

const acertoCompleto = {
  id: 'a1',
  semanaInicio: '2026-11-02',
  semanaFim: '2026-11-08',
  liquido: 270.92,
  detalhe: {
    versao: 1 as const,
    receitas: { bolt: 52.68, uber: 360.7, outras: 0 },
    totalReceitas: 390.92,
    despesas,
    totalDespesas: 120,
    retencao: null,
    liquido: 270.92,
  },
};

describe('ResumoSemanaDialog', () => {
  beforeEach(() => useAcertoSemanal.mockReset());

  it('mostra receitas, despesas e líquido da semana', () => {
    useAcertoSemanal.mockReturnValue({ data: acertoCompleto, isLoading: false, error: null });
    render(<ResumoSemanaDialog acertoId="a1" onClose={() => {}} />);

    expect(screen.getByText('Resumo da semana')).toBeInTheDocument();
    expect(screen.getByText(/2 nov a 8 nov 2026/)).toBeInTheDocument();
    expect(screen.getByText('Bolt')).toBeInTheDocument();
    expect(screen.getByText('Uber')).toBeInTheDocument();
    expect(screen.getByText('Aluguer')).toBeInTheDocument();
    expect(screen.getAllByText(/390,92/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/270,92/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Valor líquido a receber/i)).toBeInTheDocument();
  });

  it('mostra as linhas de IVA e IRS quando o motorista tem Retenção', () => {
    useAcertoSemanal.mockReturnValue({
      data: {
        ...acertoCompleto,
        liquido: 200,
        detalhe: {
          ...acertoCompleto.detalhe,
          liquido: 200,
          retencao: {
            totalLiquido: 270.92,
            taxaIva: 0.23,
            iva: 62.31,
            totalDocumento: 333.23,
            taxaIrs: 0.23,
            irs: 62.31,
            totalAReceber: 270.92,
          },
        },
      },
      isLoading: false,
      error: null,
    });
    render(<ResumoSemanaDialog acertoId="a1" onClose={() => {}} />);
    expect(screen.getByText(/IVA \(23%\)/)).toBeInTheDocument();
    expect(screen.getByText(/IRS retido \(23%\)/)).toBeInTheDocument();
  });

  it('sem detalhe guardado, diz a verdade e mostra só o valor', () => {
    useAcertoSemanal.mockReturnValue({
      data: { ...acertoCompleto, detalhe: null },
      isLoading: false,
      error: null,
    });
    render(<ResumoSemanaDialog acertoId="a1" onClose={() => {}} />);
    expect(screen.getByText(/ainda não está disponível/i)).toBeInTheDocument();
    expect(screen.queryByText('Bolt')).toBeNull();
    expect(screen.getAllByText(/270,92/).length).toBeGreaterThan(0);
  });

  it('mostra erro claro se não conseguir carregar', () => {
    useAcertoSemanal.mockReturnValue({ data: undefined, isLoading: false, error: new Error('x') });
    render(<ResumoSemanaDialog acertoId="a1" onClose={() => {}} />);
    expect(screen.getByText(/Não foi possível carregar o resumo/i)).toBeInTheDocument();
  });

  it('no erro não mostra "A carregar…" por baixo do título', () => {
    useAcertoSemanal.mockReturnValue({ data: undefined, isLoading: false, error: new Error('x') });
    render(<ResumoSemanaDialog acertoId="a1" onClose={() => {}} />);
    expect(screen.queryByText(/A carregar/)).toBeNull();
  });

  it('ao fechar, o conteúdo não muda enquanto o diálogo desaparece', () => {
    useAcertoSemanal.mockReturnValue({ data: acertoCompleto, isLoading: false, error: null });
    const { rerender } = render(<ResumoSemanaDialog acertoId="a1" onClose={() => {}} />);
    rerender(<ResumoSemanaDialog acertoId={null} onClose={() => {}} />);
    // O hook continua a ser pedido com o último id: não passa a "sem dados".
    expect(useAcertoSemanal).toHaveBeenLastCalledWith('a1');
  });

  it('semana que já não existe (ou de outro motorista) não mostra dados', () => {
    useAcertoSemanal.mockReturnValue({ data: null, isLoading: false, error: null });
    render(<ResumoSemanaDialog acertoId="a1" onClose={() => {}} />);
    expect(screen.getByText(/já não está disponível/i)).toBeInTheDocument();
  });

  it('fechado (sem id) não desenha nada', () => {
    useAcertoSemanal.mockReturnValue({ data: undefined, isLoading: false, error: null });
    render(<ResumoSemanaDialog acertoId={null} onClose={() => {}} />);
    expect(screen.queryByText('Resumo da semana')).toBeNull();
  });
});
