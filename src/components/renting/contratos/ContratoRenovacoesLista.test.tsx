import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { RenovacaoRegisto } from '@/hooks/useContratoRenovacoes';

import { ContratoRenovacoesLista } from './ContratoRenovacoesLista';

const renovacao = (over: Partial<RenovacaoRegisto>): RenovacaoRegisto => ({
  id: 'r1',
  contratoId: 'c1',
  criadoEm: '2026-09-24T16:15:00Z',
  proxima: '24/10/2026',
  ...over,
});

describe('ContratoRenovacoesLista', () => {
  it('lista cada renovação sem versão com a próxima data', () => {
    render(
      <ContratoRenovacoesLista
        renovacoes={[
          renovacao({ id: 'r2', proxima: '24/10/2026' }),
          renovacao({ id: 'r1', proxima: '17/10/2026', criadoEm: '2026-09-17T10:27:00Z' }),
        ]}
        isLoading={false}
        error={null}
      />
    );
    expect(screen.getByText('Renovações sem versão')).toBeInTheDocument();
    expect(screen.getByText('próxima renovação 24/10/2026')).toBeInTheDocument();
    expect(screen.getByText('próxima renovação 17/10/2026')).toBeInTheDocument();
    expect(screen.getAllByText(/Renovado em/)).toHaveLength(2);
  });

  it('estado vazio', () => {
    render(<ContratoRenovacoesLista renovacoes={[]} isLoading={false} error={null} />);
    expect(screen.getByText(/Sem renovações sem versão/)).toBeInTheDocument();
  });

  it('mostra o erro em vez de uma lista vazia enganadora', () => {
    render(
      <ContratoRenovacoesLista renovacoes={[]} isLoading={false} error={new Error('sem rede')} />
    );
    expect(screen.getByText(/sem rede/)).toBeInTheDocument();
  });
});
