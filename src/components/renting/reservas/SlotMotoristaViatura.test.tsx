import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useForm, FormProvider } from 'react-hook-form';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SlotMotoristaViatura } from './SlotMotoristaViatura';
import type { ReservaFormValues } from './reservaDialog.schema';
import type { Motorista } from '@/types/motorista';

vi.mock('@/hooks/useMotoristaSlotViaturas', () => ({
  useMotoristaSlotViaturas: () => ({ data: [], refetch: vi.fn() }),
}));

vi.mock('@/hooks/useMotoristas', () => ({
  useMotoristas: () => ({ data: [] }),
}));

beforeAll(() => {
  // jsdom não implementa ResizeObserver nem scrollIntoView; cmdk (usado pelo
  // Command combobox) precisa dos dois.
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = vi.fn();
});

const motoristas: Motorista[] = [
  { id: 'm1', nome: 'Mãe', nif: '111111111', codigo: 1 } as Motorista,
  { id: 'm2', nome: 'Filho', nif: '222222222', codigo: 2 } as Motorista,
];

function Harness() {
  const form = useForm<ReservaFormValues>({
    defaultValues: {
      condutores: [{ cliente_id: null, motorista_id: 'm1', is_principal: true }],
    } as any,
  });
  const queryClient = new QueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <FormProvider {...form}>
        <SlotMotoristaViatura form={form} motoristas={motoristas} onCriarMotorista={vi.fn()} />
      </FormProvider>
    </QueryClientProvider>
  );
}

describe('SlotMotoristaViatura — condutor secundário', () => {
  it('adiciona um segundo condutor (não principal) sem substituir o titular', async () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('combobox', { name: /condutor secundário/i }));
    fireEvent.click(await screen.findByText('Filho'));

    expect(screen.getByTestId('condutores-debug').textContent).toBe(
      JSON.stringify([
        { cliente_id: null, motorista_id: 'm1', is_principal: true },
        { cliente_id: null, motorista_id: 'm2', is_principal: false },
      ])
    );
  });
});
