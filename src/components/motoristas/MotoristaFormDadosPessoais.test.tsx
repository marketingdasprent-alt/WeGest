import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useForm, FormProvider } from 'react-hook-form';
import { MotoristaFormDadosPessoais } from './MotoristaFormDadosPessoais';
import type { FormValues } from './motoristaDialog.schema';

const { findLeadMatchMock } = vi.hoisted(() => ({ findLeadMatchMock: vi.fn() }));
vi.mock('@/lib/leadMatch', () => ({ findLeadMatch: findLeadMatchMock }));

// Global setup (src/__tests__/setup.ts) already mocks '@/integrations/supabase/client'
// with a bare `from: vi.fn()`. verificarNifDuplicado is not passed in these tests, so
// handleNifBlur's supabase call never fires — no extra override needed here.

function Wrapper({
  children,
}: {
  children: (form: ReturnType<typeof useForm<FormValues>>) => React.ReactNode;
}) {
  const form = useForm<FormValues>({
    defaultValues: {
      nome: '',
      nif: '',
      telefone: '',
      email: '',
      caucao_valor: null,
      lead_id: null,
    } as unknown as FormValues,
  });
  return <FormProvider {...form}>{children(form)}</FormProvider>;
}

describe('MotoristaFormDadosPessoais — match de lead', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ao sair do campo email com match encontrado, mostra dialog de confirmação', async () => {
    findLeadMatchMock.mockResolvedValue({
      id: 'lead-1',
      nome: 'Ana Costa',
      email: 'ana@exemplo.com',
      telefone: null,
      caucao_valor: 300,
    });

    let formRef!: ReturnType<typeof useForm<FormValues>>;
    render(
      <Wrapper>
        {(form) => {
          formRef = form;
          return (
            <MotoristaFormDadosPessoais
              form={form}
              gestores={[]}
              gestorPopoverOpen={false}
              setGestorPopoverOpen={() => {}}
              verificarLead
            />
          );
        }}
      </Wrapper>
    );

    fireEvent.change(screen.getByPlaceholderText('email@exemplo.com'), {
      target: { value: 'ana@exemplo.com' },
    });
    fireEvent.blur(screen.getByPlaceholderText('email@exemplo.com'));

    await waitFor(() => {
      expect(screen.getByText(/Encontrámos um lead correspondente/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /usar estes dados/i }));

    await waitFor(() => {
      expect(formRef.getValues('caucao_valor')).toBe(300);
      expect(formRef.getValues('lead_id')).toBe('lead-1');
    });
  });

  it('cancelar não altera o form nem grava lead_id', async () => {
    findLeadMatchMock.mockResolvedValue({
      id: 'lead-1',
      nome: 'Ana Costa',
      email: 'ana@exemplo.com',
      telefone: null,
      caucao_valor: 300,
    });

    let formRef!: ReturnType<typeof useForm<FormValues>>;
    render(
      <Wrapper>
        {(form) => {
          formRef = form;
          return (
            <MotoristaFormDadosPessoais
              form={form}
              gestores={[]}
              gestorPopoverOpen={false}
              setGestorPopoverOpen={() => {}}
              verificarLead
            />
          );
        }}
      </Wrapper>
    );

    fireEvent.change(screen.getByPlaceholderText('email@exemplo.com'), {
      target: { value: 'ana@exemplo.com' },
    });
    fireEvent.blur(screen.getByPlaceholderText('email@exemplo.com'));

    await waitFor(() => {
      expect(screen.getByText(/Encontrámos um lead correspondente/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));

    await waitFor(() => {
      expect(screen.queryByText(/Encontrámos um lead correspondente/i)).not.toBeInTheDocument();
    });
    expect(formRef.getValues('lead_id')).toBeFalsy();
    expect(formRef.getValues('caucao_valor')).toBeFalsy();
  });

  it('sem verificarLead (modo edição), não faz procura nenhuma', async () => {
    render(
      <Wrapper>
        {(form) => (
          <MotoristaFormDadosPessoais
            form={form}
            gestores={[]}
            gestorPopoverOpen={false}
            setGestorPopoverOpen={() => {}}
          />
        )}
      </Wrapper>
    );

    fireEvent.change(screen.getByPlaceholderText('email@exemplo.com'), {
      target: { value: 'ana@exemplo.com' },
    });
    fireEvent.blur(screen.getByPlaceholderText('email@exemplo.com'));

    await new Promise((r) => setTimeout(r, 0));
    expect(findLeadMatchMock).not.toHaveBeenCalled();
  });
});
