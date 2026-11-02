import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useForm, FormProvider, type Control } from 'react-hook-form';

import { CorteSemReciboField } from './CorteSemReciboField';

interface Valores {
  recibo_verde: boolean;
  retencao_irs: boolean;
  corte_sem_recibo_pct: number;
}

function Montar(valores: Valores) {
  const form = useForm<Valores>({ defaultValues: valores });
  return (
    <FormProvider {...form}>
      <CorteSemReciboField control={form.control as unknown as Control} />
    </FormProvider>
  );
}

describe('CorteSemReciboField', () => {
  it('quem passa recibo verde não leva corte: o campo não aparece', () => {
    render(<Montar recibo_verde retencao_irs={false} corte_sem_recibo_pct={6} />);
    expect(screen.queryByText('Corte sem recibo')).toBeNull();
  });

  it('sem recibo mostra a taxa da ficha (Açores 4%)', () => {
    render(<Montar recibo_verde={false} retencao_irs={false} corte_sem_recibo_pct={4} />);
    expect(screen.getByRole('combobox', { name: 'Corte sem recibo' }).textContent).toContain(
      '4% — Açores'
    );
  });

  it('com Retenção também leva corte, por isso o campo aparece', () => {
    render(<Montar recibo_verde retencao_irs corte_sem_recibo_pct={6} />);
    expect(screen.getByRole('combobox', { name: 'Corte sem recibo' }).textContent).toContain(
      '6% — Continente'
    );
  });
});
