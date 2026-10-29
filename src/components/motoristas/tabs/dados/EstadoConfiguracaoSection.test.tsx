import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useForm, FormProvider, type Control } from 'react-hook-form';

import { EstadoConfiguracaoSection } from './EstadoConfiguracaoSection';

interface Valores {
  recibo_verde: boolean;
  retencao_irs: boolean;
  retencao_iva_pct: number | null;
  retencao_irs_pct: number | null;
  is_slot: boolean;
  seguro_valor_semanal: number | null;
  status_ativo: boolean;
}

let formRef: ReturnType<typeof useForm<Valores>> | null = null;

function Montar({ retencao }: { retencao: boolean }) {
  const form = useForm<Valores>({
    defaultValues: {
      recibo_verde: true,
      retencao_irs: retencao,
      retencao_iva_pct: 23,
      retencao_irs_pct: 23,
      is_slot: false,
      seguro_valor_semanal: null,
      status_ativo: true,
    },
  });
  formRef = form;
  return (
    <FormProvider {...form}>
      <EstadoConfiguracaoSection control={form.control as unknown as Control} />
    </FormProvider>
  );
}

describe('EstadoConfiguracaoSection: taxas da Retenção', () => {
  it('sem Retenção não mostra as taxas', () => {
    render(<Montar retencao={false} />);
    expect(screen.queryByLabelText('IVA (%)')).toBeNull();
    expect(screen.queryByLabelText('IRS (%)')).toBeNull();
  });

  it('com Retenção mostra IVA e IRS (23% por omissão) e grava o valor alterado', () => {
    render(<Montar retencao />);
    const iva = screen.getByLabelText('IVA (%)') as HTMLInputElement;
    const irs = screen.getByLabelText('IRS (%)') as HTMLInputElement;
    expect(iva.value).toBe('23');
    expect(irs.value).toBe('23');

    fireEvent.change(irs, { target: { value: '11.5' } });
    expect(formRef?.getValues('retencao_irs_pct')).toBe(11.5);

    fireEvent.change(iva, { target: { value: '' } });
    expect(formRef?.getValues('retencao_iva_pct')).toBeNull();
  });
});
