import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { ContratosTerminamHojeDialog } from './ContratosTerminamHojeDialog';
import type { ContratoRenting } from '@/types/contratoRenting';

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

// O dia de referência é fixo: o componente recebe-o por prop, para o teste não
// depender do relógio de quem o corre.
const HOJE = new Date('2026-09-11T14:30:00');

function contrato(overrides: Partial<ContratoRenting>): ContratoRenting {
  return {
    id: overrides.id ?? 'c1',
    codigo: 7,
    matricula: 'AA-00-AA',
    cliente_id: 'cli-1',
    regime: 'rent_a_car',
    is_longa_duracao: true,
    estado_operacional: 'em_curso',
    data_inicio: '2026-08-11T10:00:00',
    data_fim: '2026-09-11T10:00:00',
    substituido_em: null,
    deleted_at: null,
    ...overrides,
  } as ContratoRenting;
}

function renderizar(contratos: ContratoRenting[]) {
  return render(
    <MemoryRouter>
      <ContratosTerminamHojeDialog
        contratos={contratos}
        hoje={HOJE}
        getClienteNome={() => 'Cliente Teste'}
        getCondutorNome={(id) => (id === 'c1' ? 'Ana Costa' : '—')}
      />
    </MemoryRouter>
  );
}

describe('ContratosTerminamHojeDialog', () => {
  it('sem contratos a terminar hoje não desenha botão nenhum', () => {
    const { container } = renderizar([contrato({ data_fim: '2026-09-12T10:00:00' })]);
    expect(container).toBeEmptyDOMElement();
  });

  it('o botão mostra a contagem certa', () => {
    renderizar([
      contrato({ id: 'c1' }),
      contrato({ id: 'c2', codigo: 8 }),
      // Termina amanhã: não conta.
      contrato({ id: 'c3', codigo: 9, data_fim: '2026-09-12T10:00:00' }),
    ]);
    expect(screen.getByRole('button', { name: /Terminam hoje \(2\)/ })).toBeInTheDocument();
  });

  it('no singular diz "Termina hoje (1)"', () => {
    renderizar([contrato({ id: 'c1' })]);
    expect(screen.getByRole('button', { name: /Termina hoje \(1\)/ })).toBeInTheDocument();
  });

  it('clicar no botão abre o diálogo com um contrato por linha', () => {
    renderizar([contrato({ id: 'c1' }), contrato({ id: 'c2', codigo: 8, matricula: 'BB-11-BB' })]);
    fireEvent.click(screen.getByRole('button', { name: /Terminam hoje/ }));

    const dialogo = within(screen.getByRole('dialog'));
    expect(dialogo.getByText(/Contrato #0007/)).toBeInTheDocument();
    expect(dialogo.getByText(/Contrato #0008/)).toBeInTheDocument();
    expect(dialogo.getByText(/BB-11-BB/)).toBeInTheDocument();
  });

  // Quem conduz é quem se contacta; o cliente só aparece quando não há condutor.
  it('cada linha mostra o condutor, ou o cliente quando não há condutor', () => {
    renderizar([contrato({ id: 'c1' }), contrato({ id: 'c2', codigo: 8 })]);
    fireEvent.click(screen.getByRole('button', { name: /Terminam hoje/ }));

    const dialogo = within(screen.getByRole('dialog'));
    expect(dialogo.getByText('Ana Costa')).toBeInTheDocument();
    expect(dialogo.getByText('Cliente Teste')).toBeInTheDocument();
  });

  it('clicar numa linha abre esse contrato e fecha o diálogo', () => {
    renderizar([contrato({ id: 'c1' }), contrato({ id: 'c2', codigo: 8 })]);
    fireEvent.click(screen.getByRole('button', { name: /Terminam hoje/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /#0008/ }));

    expect(navigate).toHaveBeenCalledWith('/renting/contratos/c2');
  });
});
