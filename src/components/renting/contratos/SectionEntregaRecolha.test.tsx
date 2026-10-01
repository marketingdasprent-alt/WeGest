import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';

import { Form } from '@/components/ui/form';

import type { ContratoFormValues } from './contratoForm.schema';
import { SectionEntregaRecolha } from './SectionEntregaRecolha';

// O selector de estação não interessa aqui e puxa Radix/queries.
vi.mock('./EstacaoSelectField', () => ({ EstacaoSelectField: () => null }));

function Harness({
  valores,
  proximaRenovacaoEm,
}: {
  valores: Partial<ContratoFormValues>;
  proximaRenovacaoEm?: string | null;
}) {
  const form = useForm<ContratoFormValues>({ defaultValues: valores as ContratoFormValues });
  return (
    <Form {...form}>
      <SectionEntregaRecolha form={form} estacoes={[]} proximaRenovacaoEm={proximaRenovacaoEm} />
    </Form>
  );
}

const tvde: Partial<ContratoFormValues> = {
  regime: 'tvde',
  is_longa_duracao: true,
  data_inicio: '2026-08-24T13:15',
  renovacao_opcao: 'mesmo_dia_cada_mes',
};

describe('SectionEntregaRecolha — TVDE', () => {
  it('mostra a próxima renovação gravada no contrato em vez do texto explicativo', () => {
    render(<Harness valores={tvde} proximaRenovacaoEm="2026-10-21T12:15:00Z" />);
    const campo = screen.getByLabelText('Próxima renovação') as HTMLInputElement;
    expect(campo.value.startsWith('2026-10-21')).toBe(true);
    expect(campo).toBeDisabled();
    expect(screen.queryByText(/não têm data de fim — ficam abertos/)).not.toBeInTheDocument();
  });

  it('num contrato novo calcula-a da Data Início e do ciclo', () => {
    render(<Harness valores={tvde} />);
    const campo = screen.getByLabelText('Próxima renovação') as HTMLInputElement;
    expect(campo.value).toBe('2026-09-24T13:15');
    expect(campo.title).toMatch(/Calculada a partir da Data Início/);
  });

  it('TVDE sem longa duração mostra o campo, sem renovação', () => {
    render(<Harness valores={{ ...tvde, is_longa_duracao: false }} />);
    const campo = screen.getByLabelText('Próxima renovação') as HTMLInputElement;
    expect(campo.value).toBe('— Sem renovação —');
    expect(campo).toBeDisabled();
  });

  it('a estação de recolha tem o mesmo formato dos campos da Entrega', () => {
    render(<Harness valores={tvde} />);
    const campo = screen.getByLabelText('Estação Fim') as HTMLInputElement;
    expect(campo.value).toBe('— Qualquer estação —');
    expect(campo).toBeDisabled();
    expect(screen.queryByText(/não definem estação de recolha fixa/)).not.toBeInTheDocument();
  });
});
