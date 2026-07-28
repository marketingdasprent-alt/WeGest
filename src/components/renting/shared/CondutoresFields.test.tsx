import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useForm, FormProvider } from 'react-hook-form';
import { CondutoresFields } from './CondutoresFields';
import type { Motorista } from '@/types/motorista';

// Regressão do fix a5c928d: 'condutores' é SEMPRE desenhado pelo useFieldArray
// de dentro deste componente — append()/replace() daqui (nunca form.setValue
// isolado) é o que mantém a tabela sincronizada. Cobre os 3 pontos onde isso
// já causou bugs em produção: adicionar, marcar principal, remover o principal.
//
// NOTA DE INVESTIGAÇÃO (não codificada em teste — ver conversa): ao tentar
// reproduzir também a instância-pai de useFieldArray usada em
// useContratoForm.ts/RentingReservaForm.tsx (appendCondutor, para o handler
// "criar novo motorista"), um harness isolado com as duas instâncias no MESMO
// nome de campo não mostrou o append da instância-pai a chegar a esta tabela.
// Não há confiança suficiente de que isto reproduz fielmente a árvore real de
// componentes (vs. artefacto do harness) para o codificar como teste — mas
// vale a pena confirmar manualmente: criar um novo contrato/reserva, usar
// "Novo motorista" a meio do preenchimento, e confirmar que aparece na tabela
// de condutores sem precisar de outra ação.

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          limit: () => Promise.resolve({ data: [] }),
        }),
      }),
    }),
  },
}));

beforeAll(() => {
  // jsdom não implementa ResizeObserver nem scrollIntoView; cmdk precisa dos dois.
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = vi.fn();
});

const motoristas: Motorista[] = [
  { id: 'm1', nome: 'Ana', nif: '111111111', codigo: 1 } as Motorista,
  { id: 'm2', nome: 'Bruno', nif: '222222222', codigo: 2 } as Motorista,
  { id: 'm3', nome: 'Carla', nif: '333333333', codigo: 3 } as Motorista,
];

interface HarnessProps {
  defaultCondutores?: Array<{
    cliente_id: string | null;
    motorista_id: string | null;
    is_principal: boolean;
  }>;
}

function Harness({ defaultCondutores = [] }: HarnessProps) {
  const form = useForm({
    defaultValues: { condutores: defaultCondutores } as any,
  });
  return (
    <FormProvider {...form}>
      <CondutoresFields regime="tvde" clientes={[]} motoristas={motoristas} />
    </FormProvider>
  );
}

function readCondutores() {
  return JSON.parse(screen.getByTestId('condutores-debug').textContent ?? '[]');
}

describe('CondutoresFields — sincronização do useFieldArray', () => {
  it('adicionar o primeiro condutor marca-o principal automaticamente', async () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: /adicionar motorista/i }));
    fireEvent.click(await screen.findByText('Ana'));

    await waitFor(() => {
      expect(readCondutores()).toEqual([
        { cliente_id: null, motorista_id: 'm1', is_principal: true },
      ]);
    });
  });

  it('adicionar um segundo condutor não substitui o principal existente (append, não replace)', async () => {
    render(
      <Harness defaultCondutores={[{ cliente_id: null, motorista_id: 'm1', is_principal: true }]} />
    );

    fireEvent.click(screen.getByRole('button', { name: /adicionar motorista/i }));
    fireEvent.click(await screen.findByText('Bruno'));

    await waitFor(() => {
      expect(readCondutores()).toEqual([
        { cliente_id: null, motorista_id: 'm1', is_principal: true },
        { cliente_id: null, motorista_id: 'm2', is_principal: false },
      ]);
    });
  });

  it('"Marcar" principal troca o titular sem perder os restantes condutores (replace do próprio fieldArray)', async () => {
    render(
      <Harness
        defaultCondutores={[
          { cliente_id: null, motorista_id: 'm1', is_principal: true },
          { cliente_id: null, motorista_id: 'm2', is_principal: false },
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /marcar/i }));

    await waitFor(() => {
      expect(readCondutores()).toEqual([
        { cliente_id: null, motorista_id: 'm1', is_principal: false },
        { cliente_id: null, motorista_id: 'm2', is_principal: true },
      ]);
    });
  });

  it('remover o condutor principal promove automaticamente o primeiro restante', async () => {
    render(
      <Harness
        defaultCondutores={[
          { cliente_id: null, motorista_id: 'm1', is_principal: true },
          { cliente_id: null, motorista_id: 'm2', is_principal: false },
          { cliente_id: null, motorista_id: 'm3', is_principal: false },
        ]}
      />
    );

    fireEvent.click(screen.getAllByTitle('Remover condutor')[0]);

    await waitFor(() => {
      expect(readCondutores()).toEqual([
        { cliente_id: null, motorista_id: 'm2', is_principal: true },
        { cliente_id: null, motorista_id: 'm3', is_principal: false },
      ]);
    });
  });
});
