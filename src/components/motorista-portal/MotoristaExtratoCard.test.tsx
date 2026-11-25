import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('./ResumoSemanaDialog', () => ({
  ResumoSemanaDialog: ({ acertoId }: { acertoId: string | null }) =>
    acertoId ? <div data-testid="resumo-aberto">{acertoId}</div> : null,
}));

import { MotoristaExtratoCard } from './MotoristaExtratoCard';
import { despesasDoResumo } from '@/lib/resumoSemanalDetalhe';
import type { AcertoSemanalDetalhado } from '@/hooks/useAcertoSemanal';
import type { DetalheResumoSemanal } from '@/lib/resumoSemanalDetalhe';

const INICIO = new Date(2026, 10, 16);
const FIM = new Date(2026, 10, 22);

// Caso real (Rodrigo, 16–22/11): o documento do escritório tem portagens 1,75 €.
function detalhe(over: Partial<DetalheResumoSemanal> = {}): DetalheResumoSemanal {
  return {
    versao: 1,
    receitas: { bolt: 0, uber: 218.54, outras: 0 },
    totalReceitas: 218.54,
    despesas: {
      aluguer: 175,
      combustivel: 50.07,
      portagens: 1.75,
      outros_custos: 6.4,
      slot: 0,
      caucao: 0,
      seguros: 0,
      reparacoes: 0,
    },
    totalDespesas: 233.22,
    retencao: null,
    liquido: -14.68,
    ...over,
  };
}

function acerto(d: DetalheResumoSemanal | null = detalhe()): AcertoSemanalDetalhado {
  return {
    id: 'a1',
    semanaInicio: '2026-11-16',
    semanaFim: '2026-11-22',
    liquido: d ? d.liquido : 320,
    detalhe: d,
  };
}

function ver(
  a: AcertoSemanalDetalhado | null | undefined,
  opts: {
    isLoading?: boolean;
    error?: unknown;
    semanasAtras?: number;
    podeSeguinte?: boolean;
    onAnterior?: () => void;
    onSeguinte?: () => void;
  } = {}
) {
  return render(
    <MotoristaExtratoCard
      acerto={a}
      isLoading={opts.isLoading ?? false}
      error={opts.error ?? null}
      inicio={INICIO}
      fim={FIM}
      semanasAtras={opts.semanasAtras ?? 1}
      podeSeguinte={opts.podeSeguinte}
      onAnterior={opts.onAnterior ?? (() => {})}
      onSeguinte={opts.onSeguinte ?? (() => {})}
    />
  );
}

describe('MotoristaExtratoCard', () => {
  it('mostra as despesas do resumo do escritório, com as portagens', () => {
    ver(acerto());
    expect(screen.getByText('Portagens')).toBeInTheDocument();
    expect(screen.getByText('−1,75 €')).toBeInTheDocument();
    expect(screen.getByText('−233,22 €')).toBeInTheDocument();
    expect(screen.getByText('218,54 €')).toBeInTheDocument();
  });

  it('líquido negativo aparece como dívida, no valor do escritório', () => {
    ver(acerto());
    expect(screen.getByText('Em dívida')).toBeInTheDocument();
    expect(screen.getByText('14,68 €')).toBeInTheDocument();
  });

  it('não mostra linhas de despesa a zero', () => {
    ver(acerto());
    expect(screen.queryByText('Slot')).not.toBeInTheDocument();
    expect(screen.queryByText('Reparações')).not.toBeInTheDocument();
  });

  it('semana ainda não enviada: avisa que está a ser preparada', () => {
    ver(null);
    expect(screen.getByRole('status')).toHaveTextContent('a ser preparadas');
  });

  it('erro não se disfarça de zeros', () => {
    ver(undefined, { error: new Error('x') });
    expect(screen.getByText(/Não foi possível carregar/)).toBeInTheDocument();
    expect(screen.queryByText('Líquido a receber')).not.toBeInTheDocument();
  });

  it('sem detalhe gravado: mostra o valor que conta para pagamento', () => {
    ver(acerto(null));
    expect(screen.getByText(/detalhe desta semana não está disponível/)).toBeInTheDocument();
    expect(screen.getByText('Líquido a receber')).toBeInTheDocument();
    expect(screen.getByText('320,00 €')).toBeInTheDocument();
  });

  it('abre o resumo completo da semana', () => {
    ver(acerto());
    fireEvent.click(screen.getByRole('button', { name: /Ver resumo completo/ }));
    expect(screen.getByTestId('resumo-aberto')).toHaveTextContent('a1');
  });

  it('com Retenção mostra IVA e IRS, para as contas fecharem à vista', () => {
    const retencao = {
      totalLiquido: 266.78,
      taxaIva: 0.23,
      iva: 61.36,
      totalDocumento: 328.14,
      taxaIrs: 0.25,
      irs: 66.7,
      totalAReceber: 261.44,
    };
    ver(acerto(detalhe({ totalReceitas: 500, retencao, liquido: 261.44 })));
    expect(screen.getByText('IVA (23%)')).toBeInTheDocument();
    expect(screen.getByText('61,36 €')).toBeInTheDocument();
    expect(screen.getByText('Total documento')).toBeInTheDocument();
    expect(screen.getByText('IRS retido (25%)')).toBeInTheDocument();
    expect(screen.getByText('−66,70 €')).toBeInTheDocument();
    expect(screen.getByText('261,44 €')).toBeInTheDocument();
  });

  it('sem Retenção não mostra linhas de IVA e IRS', () => {
    ver(acerto());
    expect(screen.queryByText(/IVA/)).not.toBeInTheDocument();
  });

  it('mostra viagens quando o resumo as tem', () => {
    ver(acerto(detalhe({ viagens: 42 })));
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Viagens')).toBeInTheDocument();
  });

  it('na semana passada não deixa avançar para a semana em curso', () => {
    ver(acerto(), { podeSeguinte: false });
    expect(screen.getByRole('button', { name: 'Semana seguinte' })).toBeDisabled();
  });

  it('setas chamam a navegação', () => {
    const onAnterior = vi.fn();
    const onSeguinte = vi.fn();
    ver(acerto(), { podeSeguinte: true, semanasAtras: 2, onAnterior, onSeguinte });
    fireEvent.click(screen.getByRole('button', { name: 'Semana anterior' }));
    fireEvent.click(screen.getByRole('button', { name: 'Semana seguinte' }));
    expect(onAnterior).toHaveBeenCalledOnce();
    expect(onSeguinte).toHaveBeenCalledOnce();
  });
});

describe('despesasDoResumo', () => {
  it('segue a ordem do documento do escritório', () => {
    expect(despesasDoResumo(detalhe()).map((l) => l.rotulo)).toEqual([
      'Aluguer',
      'Combustível',
      'Portagens',
      'Outros custos',
    ]);
  });
});
