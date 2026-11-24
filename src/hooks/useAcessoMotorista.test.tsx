import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useEnviarAcessoMotorista, useEstadoAcessoMotorista } from './useAcessoMotorista';

const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('@/contexts/TenantContext', () => ({ useOrgId: () => 'org-1' }));

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

const erroHttp = (status: number, corpo: unknown) => ({
  data: null,
  error: { message: 'non-2xx', context: new Response(JSON.stringify(corpo), { status }) },
});

beforeEach(() => {
  vi.mocked(supabase.functions.invoke).mockReset();
});

describe('useEstadoAcessoMotorista', () => {
  it('lê a primeira linha da RPC com o id do motorista', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [{ estado: 'ativo', email_conta: 'a@x.pt' }],
      error: null,
    } as never);
    const { result } = renderHook(() => useEstadoAcessoMotorista('m-1'), { wrapper });
    await waitFor(() => expect(result.current.data?.estado).toBe('ativo'));
    expect(supabase.rpc).toHaveBeenCalledWith('motorista_estado_acesso', { p_motorista_id: 'm-1' });
  });

  it('zero linhas (sem permissão) dá null', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as never);
    const { result } = renderHook(() => useEstadoAcessoMotorista('m-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

describe('useEnviarAcessoMotorista', () => {
  it('o corpo só leva ids, nunca email nem senha, e avisa com o email mascarado', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { success: true, status: 'enviado', email_destino_mascarado: 'j***@x.pt' },
      error: null,
    } as never);
    const { result } = renderHook(() => useEnviarAcessoMotorista(), { wrapper });
    const r = await result.current.mutateAsync({ motoristaId: 'm-1' });

    expect(r).toEqual({ status: 'enviado', emailMascarado: 'j***@x.pt' });
    const [nome, opcoes] = vi.mocked(supabase.functions.invoke).mock.calls[0];
    expect(nome).toBe('motorista-enviar-acesso');
    const corpo = (opcoes as { body: Record<string, unknown> }).body;
    expect(corpo).toEqual({ motorista_id: 'm-1', org_id: 'org-1' });
    expect(Object.keys(corpo).join()).not.toMatch(/email|senha|password/i);
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ title: 'Acesso enviado para j***@x.pt' })
    );
  });

  it('requer_confirmacao não é erro: devolve o estado e não mostra toast destrutivo', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue(
      erroHttp(409, { success: false, error: 'requer_confirmacao', mensagem: 'Já entrou' }) as never
    );
    const { result } = renderHook(() => useEnviarAcessoMotorista(), { wrapper });
    const r = await result.current.mutateAsync({ motoristaId: 'm-1' });
    expect(r).toEqual({ status: 'requer_confirmacao', mensagem: 'Já entrou' });
    expect(toast).not.toHaveBeenCalled();
  });

  it('reenvio leva confirmar_substituicao', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { success: true, email_destino_mascarado: 'a***@x.pt' },
      error: null,
    } as never);
    const { result } = renderHook(() => useEnviarAcessoMotorista(), { wrapper });
    await result.current.mutateAsync({ motoristaId: 'm-1', confirmarSubstituicao: true });
    const corpo = (vi.mocked(supabase.functions.invoke).mock.calls[0][1] as { body: unknown }).body;
    expect(corpo).toEqual({ motorista_id: 'm-1', org_id: 'org-1', confirmar_substituicao: true });
  });

  it('outros erros mostram a mensagem do servidor num toast destrutivo', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue(
      erroHttp(400, {
        success: false,
        error: 'ficha_sem_email',
        mensagem: 'A ficha não tem um email válido.',
      }) as never
    );
    const { result } = renderHook(() => useEnviarAcessoMotorista(), { wrapper });
    await expect(result.current.mutateAsync({ motoristaId: 'm-1' })).rejects.toThrow(
      'A ficha não tem um email válido.'
    );
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: 'Erro',
        description: 'A ficha não tem um email válido.',
        variant: 'destructive',
      })
    );
  });

  it('429 usa a mensagem de espera', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: {
        message: 'non-2xx',
        context: new Response('{}', { status: 429, headers: { 'Retry-After': '600' } }),
      },
    } as never);
    const { result } = renderHook(() => useEnviarAcessoMotorista(), { wrapper });
    await expect(result.current.mutateAsync({ motoristaId: 'm-1' })).rejects.toThrow(
      'Demasiados pedidos. Tente novamente daqui a 10 minutos.'
    );
  });
});
