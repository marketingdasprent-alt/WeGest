// src/components/admin/integracoes/BoltApiCredenciais.test.tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { supabase } from '@/integrations/supabase/client';
import { BoltApiCredenciais } from './BoltApiCredenciais';
import { type EstadoCredenciaisBolt } from './boltIntegracao';

const invoke = supabase.functions.invoke as unknown as ReturnType<typeof vi.fn>;

/** Resposta do bolt-test-connection: sem company_id devolve a lista de empresas. */
const respostaLista = (ids: number[]) => ({
  data: { success: true, message: 'Credenciais válidas', company_ids: ids },
  error: null,
});

/** Resposta do segundo passo: confirmação da empresa escolhida (com nome). */
const respostaEmpresa = (nome: string) => ({
  data: {
    success: true,
    message: `Ligado a ${nome} — 12 viagem(ns) nos últimos 7 dias.`,
    company: { company_name: nome },
  },
  error: null,
});

const preencherCredenciais = () => {
  fireEvent.change(screen.getByLabelText('Client ID *'), { target: { value: 'cli_123' } });
  fireEvent.change(screen.getByLabelText('Client Secret *'), { target: { value: 'sec_456' } });
};

const ultimoEstado = (onEstado: ReturnType<typeof vi.fn>): EstadoCredenciaisBolt =>
  onEstado.mock.calls[onEstado.mock.calls.length - 1][0];

describe('BoltApiCredenciais', () => {
  beforeEach(() => vi.clearAllMocks());

  it('não deixa testar sem os dois campos preenchidos', () => {
    render(<BoltApiCredenciais contexto="criar" modoGravado="password" onEstado={vi.fn()} />);

    const botao = screen.getByRole('button', { name: /testar ligação/i });
    expect(botao).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Client ID *'), { target: { value: 'cli_123' } });
    expect(botao).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Client Secret *'), { target: { value: 'sec_456' } });
    expect(botao).toBeEnabled();
  });

  it('credenciais por testar nunca ficam completas', () => {
    const onEstado = vi.fn();
    render(<BoltApiCredenciais contexto="criar" modoGravado="password" onEstado={onEstado} />);

    preencherCredenciais();

    const estado = ultimoEstado(onEstado);
    expect(estado.preenchido).toBe(true);
    expect(estado.completo).toBe(false);
    expect(estado.motivo).toBe('Teste a ligação antes de gravar as credenciais.');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('com uma só empresa, o teste escolhe-a e confirma-a sozinho', async () => {
    invoke
      .mockResolvedValueOnce(respostaLista([42]))
      .mockResolvedValueOnce(respostaEmpresa('Lara'));
    const onEstado = vi.fn();
    render(<BoltApiCredenciais contexto="criar" modoGravado="password" onEstado={onEstado} />);

    preencherCredenciais();
    fireEvent.click(screen.getByRole('button', { name: /testar ligação/i }));

    await waitFor(() => expect(ultimoEstado(onEstado).completo).toBe(true));

    const estado = ultimoEstado(onEstado);
    expect(estado).toMatchObject({
      clientId: 'cli_123',
      clientSecret: 'sec_456',
      companyId: '42',
      companyName: 'Lara',
      motivo: null,
    });

    // Primeiro pedido sem company_id (lista), segundo com (confirmação).
    expect(invoke).toHaveBeenNthCalledWith(1, 'bolt-test-connection', {
      body: { client_id: 'cli_123', client_secret: 'sec_456' },
    });
    expect(invoke).toHaveBeenNthCalledWith(2, 'bolt-test-connection', {
      body: { client_id: 'cli_123', client_secret: 'sec_456', company_id: '42' },
    });
    expect(screen.getByTestId('bolt-empresa-escolhida')).toHaveTextContent('Lara (42)');
  });

  it('com várias empresas fica à espera da escolha e não grava nada', async () => {
    invoke.mockResolvedValueOnce(respostaLista([10, 11]));
    const onEstado = vi.fn();
    render(<BoltApiCredenciais contexto="criar" modoGravado="password" onEstado={onEstado} />);

    preencherCredenciais();
    fireEvent.click(screen.getByRole('button', { name: /testar ligação/i }));

    await waitFor(() => expect(screen.getByText(/2 empresas acessíveis/)).toBeInTheDocument());

    const estado = ultimoEstado(onEstado);
    expect(estado.completo).toBe(false);
    expect(estado.motivo).toBe('Escolha a empresa Bolt desta integração.');
    // Só o pedido da lista: sem empresa escolhida não há segunda chamada.
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('credenciais recusadas pela Bolt mostram o erro e não ficam completas', async () => {
    invoke.mockResolvedValueOnce({
      data: { success: false, error: 'Credenciais inválidas: a Bolt recusou este par (HTTP 401).' },
      error: null,
    });
    const onEstado = vi.fn();
    render(<BoltApiCredenciais contexto="criar" modoGravado="password" onEstado={onEstado} />);

    preencherCredenciais();
    fireEvent.click(screen.getByRole('button', { name: /testar ligação/i }));

    await waitFor(() => expect(screen.getByText(/a Bolt recusou este par/)).toBeInTheDocument());
    expect(ultimoEstado(onEstado).completo).toBe(false);
  });

  it('mexer nas credenciais invalida o teste anterior e a empresa que veio com ele', async () => {
    invoke
      .mockResolvedValueOnce(respostaLista([42]))
      .mockResolvedValueOnce(respostaEmpresa('Lara'));
    const onEstado = vi.fn();
    render(<BoltApiCredenciais contexto="criar" modoGravado="password" onEstado={onEstado} />);

    preencherCredenciais();
    fireEvent.click(screen.getByRole('button', { name: /testar ligação/i }));
    await waitFor(() => expect(ultimoEstado(onEstado).completo).toBe(true));

    fireEvent.change(screen.getByLabelText('Client Secret *'), { target: { value: 'outro' } });

    const estado = ultimoEstado(onEstado);
    expect(estado.completo).toBe(false);
    expect(estado.companyId).toBe('');
    expect(estado.companyName).toBeNull();
    expect(screen.queryByTestId('bolt-empresa-escolhida')).not.toBeInTheDocument();
  });

  it('editar uma conta ainda no robô avisa que está a converter', () => {
    render(<BoltApiCredenciais contexto="editar" modoGravado="password" onEstado={vi.fn()} />);

    const aviso = screen.getByTestId('bolt-aviso-conversao');
    expect(aviso).toHaveTextContent(/robô deixa de correr/i);
    expect(aviso).toHaveTextContent(/importação manual do CSV mantém-se/i);
    expect(aviso).toHaveTextContent(/histórico/i);
  });

  it('editar uma conta já convertida não mostra o aviso e não revela o segredo', () => {
    render(
      <BoltApiCredenciais
        contexto="editar"
        modoGravado="oauth"
        segredoGravado
        companyIdGravado={42}
        companyNameGravado="Lara"
        onEstado={vi.fn()}
      />
    );

    expect(screen.queryByTestId('bolt-aviso-conversao')).not.toBeInTheDocument();
    expect(screen.getByTestId('bolt-credenciais-gravadas')).toHaveTextContent('Lara (42)');

    const campoSegredo = screen.getByLabelText('Client Secret *') as HTMLInputElement;
    expect(campoSegredo).toHaveValue('');
    expect(campoSegredo).toHaveAttribute('type', 'password');
    expect(campoSegredo.placeholder).toMatch(/gravado/i);
  });
});
