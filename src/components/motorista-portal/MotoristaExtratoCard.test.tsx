import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MotoristaExtratoCard } from './MotoristaExtratoCard';
import type { ExtratoMotorista } from '@/hooks/useMotoristaExtratoPeriodo';

const INICIO = new Date(2026, 7, 17);
const FIM = new Date(2026, 7, 23);

function extrato(over: Partial<ExtratoMotorista> = {}): ExtratoMotorista {
  return {
    periodoInicio: '2026-08-17',
    periodoFim: '2026-08-23',
    receitaBolt: 1000,
    receitaUber: 0,
    gorjetas: 0,
    extras: 0,
    receita: 1000,
    viagensBolt: 80,
    combustivel: 50,
    portagens: 10,
    aluguer: 300,
    reparacoes: 0,
    outros: 0,
    totalCustos: 360,
    liquido: 640,
    temDadosReceita: true,
    temCustosLancados: true,
    acertoLiquido: null,
    temAcerto: false,
    mediaPorDia: 142.86,
    diasDecorridos: 7,
    ...over,
  };
}

function ver(e: ExtratoMotorista | null, opts: { isLoading?: boolean; error?: unknown } = {}) {
  return render(
    <MotoristaExtratoCard
      extrato={e}
      isLoading={opts.isLoading ?? false}
      error={opts.error ?? null}
      inicio={INICIO}
      fim={FIM}
    />
  );
}

describe('MotoristaExtratoCard', () => {
  it('mostra o líquido e cada desconto que existe', () => {
    ver(extrato());
    expect(screen.getByText(/640,00/)).toBeTruthy();
    expect(screen.getByText('Aluguer da viatura')).toBeTruthy();
    expect(screen.getByText('Combustível')).toBeTruthy();
    expect(screen.getByText('Líquido a receber')).toBeTruthy();
  });

  it('esconde as rubricas de desconto que estão a zero', () => {
    ver(extrato());
    // Reparações e Outros vêm a zero neste extrato — não devem ocupar linha.
    expect(screen.queryByText('Reparações')).toBeNull();
    expect(screen.queryByText('Outros')).toBeNull();
  });

  it('sem dados importados NÃO mostra valores, diz que ainda não chegaram', () => {
    ver(extrato({ temDadosReceita: false, receita: 0, liquido: 0, viagensBolt: 0 }));
    expect(screen.getByText(/ainda não foram importados/i)).toBeTruthy();
    // Um 0 € aqui seria afirmar que ganhou zero, o que não sabemos.
    expect(screen.queryByText(/Líquido a receber/)).toBeNull();
  });

  it('sem custos lançados avisa que o líquido ainda não os desconta', () => {
    ver(
      extrato({
        temCustosLancados: false,
        combustivel: 0,
        portagens: 0,
        aluguer: 0,
        totalCustos: 0,
        liquido: 1000,
      })
    );
    expect(screen.getByText(/ainda não os desconta/i)).toBeTruthy();
  });

  it('líquido negativo aparece como dívida, sem sinal a confundir', () => {
    ver(extrato({ liquido: -120 }));
    expect(screen.getByText('Em dívida')).toBeTruthy();
    expect(screen.getByText(/120,00/)).toBeTruthy();
  });

  it('quando o acerto difere, explica qual vale para pagamento', () => {
    ver(extrato({ temAcerto: true, acertoLiquido: 767.84, liquido: 764 }));
    expect(screen.getByText(/conta para pagamento/i)).toBeTruthy();
    expect(screen.getByText(/767,84/)).toBeTruthy();
  });

  it('acerto igual ao calculado não incomoda o motorista com avisos', () => {
    ver(extrato({ temAcerto: true, acertoLiquido: 640, liquido: 640 }));
    expect(screen.queryByText(/conta para pagamento/i)).toBeNull();
  });

  it('erro mostra erro e nunca zeros disfarçados', () => {
    ver(null, { error: new Error('falhou') });
    expect(screen.getByText(/não foi possível carregar/i)).toBeTruthy();
    expect(screen.queryByText(/0,00/)).toBeNull();
  });
});
