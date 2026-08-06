import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useForm, FormProvider, type UseFormReturn } from 'react-hook-form';

import { ReservaResumoSidebar } from './ReservaResumoSidebar';
import type { ReservaFormValues } from './reservaDialog.schema';

// 15 dias exactos — o mesmo cenário do bug reportado (85 €/dia × 15 = 1275 €).
const DATA_INICIO = '2026-08-01T10:00';
const DATA_FIM = '2026-08-16T10:00';

/** Valor automático da tarifa (100 €/dia × 15) — o que o recálculo escreve. */
const AUTO = 1500;
/** Preço escrito à mão no card de Preço (85 €/dia × 15). */
const MANUAL = 1275;

let formRef: UseFormReturn<ReservaFormValues>;

function Harness({ manual }: { manual: number | null }) {
  const form = useForm<ReservaFormValues>({
    defaultValues: {
      regime: 'rent_a_car',
      data_inicio: DATA_INICIO,
      data_fim: DATA_FIM,
      valor_total: AUTO,
      valor_total_manual: manual,
      coberturas: [],
      extras: [],
      taxas: [],
    } as unknown as ReservaFormValues,
  });
  formRef = form;
  return (
    <FormProvider {...form}>
      <ReservaResumoSidebar form={form} estacoes={[]} viaturas={[]} isEdit={false} />
    </FormProvider>
  );
}

const precoDiaInput = () => screen.getByTitle(/Preço por dia/i) as HTMLInputElement;

describe('ReservaResumoSidebar — preço manual vs. automático da tarifa', () => {
  it('sem preço manual, mostra o valor automático da tarifa', () => {
    render(<Harness manual={null} />);
    // 1500 / 15 dias = 100,00 €/dia
    expect(precoDiaInput().value).toBe('100.00');
  });

  it('com preço manual, é ele que manda no preço/dia e no sub-total', () => {
    render(<Harness manual={MANUAL} />);
    expect(precoDiaInput().value).toBe('85.00');
    expect(screen.getByText('€1275,00')).toBeInTheDocument();
  });

  it('editar o preço/dia escreve no override e NÃO no valor automático', () => {
    render(<Harness manual={null} />);

    fireEvent.change(precoDiaInput(), { target: { value: '85' } });

    expect(formRef.getValues('valor_total_manual')).toBe(MANUAL);
    // O valor automático fica intacto — é o que permite voltar atrás.
    expect(formRef.getValues('valor_total')).toBe(AUTO);
  });

  it('o recálculo automático da tarifa não apaga o preço escrito à mão', () => {
    // Regressão: o efeito de faturação em ReservaTabGeral reescreve
    // `valor_total` sempre que as tarifas/preços chegam do servidor. Antes,
    // como o input escrevia nesse mesmo campo, isso apagava o valor digitado
    // e a reserva "voltava ao original" logo após ser criada.
    render(<Harness manual={MANUAL} />);
    expect(precoDiaInput().value).toBe('85.00');

    fireEvent.change(precoDiaInput(), { target: { value: '90' } });
    // Simula o recálculo automático a disparar depois da edição.
    act(() => {
      formRef.setValue('valor_total', 2000);
    });

    expect(formRef.getValues('valor_total_manual')).toBe(90 * 15);
  });

  it('preço a 0 é um valor válido e não volta ao da tarifa', () => {
    // Um aluguer oferecido escreve-se como 0. Antes, o 0 era lido como
    // "sem valor" e o preço da tarifa voltava sozinho.
    render(<Harness manual={0} />);

    expect(precoDiaInput().value).toBe('0.00');
  });

  it('escrever 0 grava 0 no override, em vez de o tratar como vazio', () => {
    render(<Harness manual={null} />);

    fireEvent.change(precoDiaInput(), { target: { value: '0' } });

    expect(formRef.getValues('valor_total_manual')).toBe(0);
  });

  it('apagar o preço devolve o controlo à tarifa', () => {
    render(<Harness manual={MANUAL} />);

    fireEvent.change(precoDiaInput(), { target: { value: '' } });

    expect(formRef.getValues('valor_total_manual')).toBeNull();
    expect(formRef.getValues('valor_total')).toBe(AUTO);
  });
});
