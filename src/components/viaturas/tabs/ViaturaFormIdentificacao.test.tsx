import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useForm, FormProvider } from 'react-hook-form';
import { ViaturaFormIdentificacao } from './ViaturaFormIdentificacao';
import type { ViaturaFormData } from './viaturaTabDados.types';

function Wrapper({
  status,
  children,
}: {
  status: string;
  children: (form: ReturnType<typeof useForm<ViaturaFormData>>) => React.ReactNode;
}) {
  const form = useForm<ViaturaFormData>({
    defaultValues: { matricula: 'AA-00-BB', status } as unknown as ViaturaFormData,
  });
  return <FormProvider {...form}>{children(form)}</FormProvider>;
}

function renderCampo(estadoDerivedado: string, podeAlterarEstadoInativo: boolean) {
  return render(
    <Wrapper status={estadoDerivedado}>
      {(form) => (
        <ViaturaFormIdentificacao
          form={form}
          estadoDerivedado={estadoDerivedado}
          podeAlterarEstadoInativo={podeAlterarEstadoInativo}
        />
      )}
    </Wrapper>
  );
}

describe('ViaturaFormIdentificacao — campo Estado', () => {
  it('inativo sem permissão: mostra badge bloqueado, não mostra select', () => {
    renderCampo('inativo', false);
    expect(screen.getByText('gerido automaticamente')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('inativo com permissão: mostra select editável, não mostra badge', () => {
    renderCampo('inativo', true);
    expect(screen.queryByText('gerido automaticamente')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it.each(['em_contrato', 'em_reserva', 'em_movimentacao', 'manutencao'])(
    '%s com permissão continua bloqueado (a permissão só se aplica a inativo)',
    (estado) => {
      renderCampo(estado, true);
      expect(screen.getByText('gerido automaticamente')).toBeInTheDocument();
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    }
  );

  it('disponivel: mostra sempre o select, com ou sem a permissão', () => {
    renderCampo('disponivel', false);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.queryByText('gerido automaticamente')).not.toBeInTheDocument();
  });
});
