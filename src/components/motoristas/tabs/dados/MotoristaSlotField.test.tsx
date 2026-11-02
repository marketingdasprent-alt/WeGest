import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useForm, FormProvider, type Control } from 'react-hook-form';

import { MotoristaSlotField, SEMANAS_COBRANCA_SLOT } from './MotoristaSlotField';

interface Valores {
  is_slot: boolean;
  slot_valor_semanal: number | null;
  slot_semana_cobranca: number;
}

function Montar(props: Valores) {
  const form = useForm<Valores>({ defaultValues: props });
  return (
    <FormProvider {...form}>
      <MotoristaSlotField control={form.control as unknown as Control} />
    </FormProvider>
  );
}

describe('MotoristaSlotField: semana da cobrança', () => {
  it('sem slot não mostra valor nem semana', () => {
    render(<Montar is_slot={false} slot_valor_semanal={null} slot_semana_cobranca={1} />);
    expect(screen.queryByText('Valor Mensal (€)')).toBeNull();
    expect(screen.queryByText('Semana da cobrança')).toBeNull();
  });

  it('com slot mostra a semana abaixo do valor, na semana gravada', () => {
    render(<Montar is_slot slot_valor_semanal={125} slot_semana_cobranca={3} />);
    const valor = screen.getByText('Valor Mensal (€)');
    const semana = screen.getByText('Semana da cobrança');
    expect(valor.compareDocumentPosition(semana) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('combobox').textContent).toBe('3ª semana do mês');
    expect(screen.getByText(/resumo da semana da 3ª segunda-feira do mês/)).toBeTruthy();
  });

  it('só oferece da 1ª à 4ª semana (a 5ª segunda não existe todos os meses)', () => {
    expect([...SEMANAS_COBRANCA_SLOT]).toEqual([1, 2, 3, 4]);
  });
});
