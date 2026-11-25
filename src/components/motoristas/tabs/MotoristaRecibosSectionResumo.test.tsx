// A ficha não tem conta própria: mostra e passa à janela a mesma linha da
// lista de Contas/Resumo (tela 1). Caso real: Rodrigo, 16–22/11, portagens 1,75 €.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { supabase } from '@/integrations/supabase/client';
import type { MotoristaResumo } from '@/components/administrativo/contasResumoExports';

const permissoes = { isAdmin: true, hasAccessToResource: (_r: string) => true };
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => permissoes }));

const useResumoSemanalMotorista = vi.fn();
vi.mock('@/hooks/useResumoSemanalMotorista', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useResumoSemanalMotorista')>()),
  useResumoSemanalMotorista: (...a: unknown[]) => useResumoSemanalMotorista(...a),
}));

vi.mock('@/components/administrativo/MotoristaResumoDialog', () => ({
  MotoristaResumoDialog: ({ motorista }: { motorista: unknown }) => (
    <div data-testid="resumo-dialog">{JSON.stringify(motorista)}</div>
  ),
}));

import { MotoristaRecibosSection } from './MotoristaRecibosSection';

const linhaTela1: MotoristaResumo = {
  driver_name: 'Rodrigo José Alves de Miranda',
  driver_uuid: '',
  motorista_id: 'm1',
  total_faturado: 218.54,
  faturado_bolt: 0,
  faturado_uber: 218.54,
  gorjeta_bolt: 0,
  gorjeta_uber: 0,
  total_viagens: 30,
  viagens_bolt: 0,
  viagens_uber: 30,
  recibo_verde: true,
  liquido: -14.68,
  combustivel: 50.07,
  portagens: 1.75,
  reparacoes: 0,
  outros_custos: 6.4,
  slot: 0,
  aluguer: 175,
};

function builderVazio() {
  const b: any = new Proxy(
    {},
    {
      get(_a, prop) {
        if (prop === 'then') return (r: (v: unknown) => void) => r({ data: [], error: null });
        return () => b;
      },
    }
  );
  return b;
}

const renderizar = () =>
  render(
    <MotoristaRecibosSection
      motoristaId="m1"
      selectedWeek={new Date('2026-11-18T12:00:00Z')}
      motorista={{ id: 'm1', nome: 'Rodrigo José Alves de Miranda', recibo_verde: true }}
    />
  );

describe('MotoristaRecibosSection — resumo igual à tela 1', () => {
  beforeEach(() => {
    permissoes.isAdmin = true;
    permissoes.hasAccessToResource = () => true;
    (supabase.from as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => builderVazio());
    useResumoSemanalMotorista.mockReturnValue({
      periodoFechado: true,
      loading: false,
      resumo: linhaTela1,
    });
  });

  it('passa à janela exatamente a linha da lista de Contas/Resumo (com portagens)', () => {
    renderizar();
    const passado = JSON.parse(screen.getByTestId('resumo-dialog').textContent || 'null');
    expect(passado).toEqual(linhaTela1);
    expect(passado.portagens).toBe(1.75);
  });

  it('os cartões somam as portagens nos custos e mostram o líquido da tela 1', () => {
    renderizar();
    // 175 + 50,07 + 1,75 + 6,40 = 233,22
    expect(screen.getByText(/233,22/)).toBeInTheDocument();
    expect(screen.getByText(/-14,68/)).toBeInTheDocument();
    expect(screen.getByText('Igual a Administrativo → Resumos')).toBeInTheDocument();
  });

  it('semana por fechar: avisa, como a tela 1, em vez de inventar valores', () => {
    useResumoSemanalMotorista.mockReturnValue({
      periodoFechado: false,
      loading: false,
      resumo: null,
    });
    renderizar();
    expect(screen.getByText('Período por fechar')).toBeInTheDocument();
    expect(screen.queryByText('Faturação Total')).not.toBeInTheDocument();
  });

  it('sem valores nesta semana: diz isso e não abre um resumo vazio', () => {
    useResumoSemanalMotorista.mockReturnValue({
      periodoFechado: true,
      loading: false,
      resumo: null,
    });
    renderizar();
    expect(screen.getByText('Sem valores nesta semana')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ver Resumo/ })).toBeDisabled();
  });

  it('sem acesso ao Financeiro: não calcula valores incompletos', () => {
    permissoes.isAdmin = false;
    permissoes.hasAccessToResource = () => false;
    renderizar();
    expect(screen.getByText('Resumo da semana sem acesso')).toBeInTheDocument();
    expect(useResumoSemanalMotorista).toHaveBeenLastCalledWith(
      'm1',
      expect.any(Date),
      expect.any(Date),
      false
    );
  });
});
