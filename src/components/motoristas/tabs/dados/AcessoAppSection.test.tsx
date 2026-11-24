import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { AcessoAppSection } from './AcessoAppSection';
import type { EstadoAcessoRow } from './estadoAcesso';

const estado = vi.hoisted(() => ({
  value: { data: null, isLoading: false, error: null } as {
    data: unknown;
    isLoading: boolean;
    error: Error | null;
  },
}));
const mutate = vi.hoisted(() => vi.fn());
const pendente = vi.hoisted(() => ({ value: false }));
const permissao = vi.hoisted(() => ({ value: true }));

vi.mock('@/hooks/useAcessoMotorista', () => ({
  useEstadoAcessoMotorista: () => estado.value,
  useEnviarAcessoMotorista: () => ({ mutate, isPending: pendente.value }),
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => permissao.value }),
}));

const linha = (r: Partial<EstadoAcessoRow>): EstadoAcessoRow => ({
  estado: 'nunca_entrou',
  email_conta: 'conta@x.pt',
  email_ficha: 'conta@x.pt',
  email_difere: false,
  ultimo_acesso: null,
  provisoria_expira_em: null,
  ...r,
});

beforeEach(() => {
  estado.value = { data: linha({}), isLoading: false, error: null };
  pendente.value = false;
  permissao.value = true;
});

describe('AcessoAppSection', () => {
  it('mostra o carregamento', () => {
    estado.value = { data: null, isLoading: true, error: null };
    render(<AcessoAppSection motoristaId="m" />);
    expect(screen.getByLabelText('A carregar')).toBeTruthy();
  });

  it('mostra o erro', () => {
    estado.value = { data: null, isLoading: false, error: new Error('falhou') };
    render(<AcessoAppSection motoristaId="m" />);
    expect(screen.getByText(/Erro ao carregar o acesso: falhou/)).toBeTruthy();
  });

  it('sem linha: estado vazio, sem botão', () => {
    estado.value = { data: null, isLoading: false, error: null };
    render(<AcessoAppSection motoristaId="m" />);
    expect(screen.getByText(/Sem informação de acesso/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Enviar acesso/ })).toBeNull();
  });

  it.each([
    [{ estado: 'sem_conta', email_conta: null } as const, 'Sem conta na app'],
    [{ estado: 'nunca_entrou' } as const, 'Conta criada, nunca entrou'],
    [
      { estado: 'ativo', ultimo_acesso: '2026-11-24T10:30:00' } as const,
      'Último acesso em 24/11/2026 10:30',
    ],
    [
      { estado: 'provisoria_pendente', provisoria_expira_em: '2026-11-27T09:05:00' } as const,
      'Senha provisória enviada, válida até 27/11/2026 09:05',
    ],
    [{ estado: 'provisoria_expirada' } as const, 'Senha provisória expirada'],
  ])('mostra o estado %#', (parcial, texto) => {
    estado.value = { data: linha(parcial), isLoading: false, error: null };
    render(<AcessoAppSection motoristaId="m" />);
    expect(screen.getByText(texto)).toBeTruthy();
  });

  it('mostra o aviso quando o email da conta difere', () => {
    estado.value = {
      data: linha({ email_difere: true, email_conta: 'outra@x.pt' }),
      isLoading: false,
      error: null,
    };
    render(<AcessoAppSection motoristaId="m" />);
    expect(screen.getByText('A conta usa outra@x.pt, diferente do email da ficha')).toBeTruthy();
  });

  it('sem permissão esconde o botão', () => {
    permissao.value = false;
    render(<AcessoAppSection motoristaId="m" />);
    expect(screen.queryByRole('button', { name: /Enviar acesso/ })).toBeNull();
  });

  it('desativa o botão enquanto envia', () => {
    pendente.value = true;
    render(<AcessoAppSection motoristaId="m" />);
    expect(screen.getByRole('button', { name: /Enviar acesso/ })).toHaveProperty('disabled', true);
  });

  it('confirma o envio e chama a mutation sem substituição', () => {
    render(<AcessoAppSection motoristaId="m-1" />);
    fireEvent.click(screen.getByRole('button', { name: /Enviar acesso/ }));
    expect(screen.getByText(/72 horas/)).toBeTruthy();
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button', { name: 'Enviar acesso' }).at(-1)!);
    expect(mutate).toHaveBeenCalledWith(
      { motoristaId: 'm-1', confirmarSubstituicao: false },
      expect.any(Object)
    );
  });

  it('requer_confirmacao abre o segundo diálogo e reenvia com a flag', () => {
    render(<AcessoAppSection motoristaId="m-1" />);
    fireEvent.click(screen.getByRole('button', { name: /Enviar acesso/ }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Enviar acesso' }).at(-1)!);

    const opcoes = mutate.mock.calls[0][1] as {
      onSuccess: (r: { status: string }) => void;
    };
    act(() => opcoes.onSuccess({ status: 'requer_confirmacao' }));

    expect(
      screen.getByText(
        'Este motorista já entra na app. Enviar uma senha provisória substitui a senha atual.'
      )
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Substituir e enviar' }));
    expect(mutate).toHaveBeenLastCalledWith(
      { motoristaId: 'm-1', confirmarSubstituicao: true },
      expect.any(Object)
    );
  });
});
