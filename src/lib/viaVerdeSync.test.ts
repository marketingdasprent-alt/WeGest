import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import { pedirSyncViaVerde } from './viaVerdeSync';

// O drain Via Verde passou a exigir chamada interna (auditoria 2026-09-25): o
// pedido manual vai todo pela RPC, que põe na fila e arranca o drain no servidor.
describe('pedirSyncViaVerde', () => {
  beforeEach(() => {
    vi.mocked(supabase.rpc).mockReset();
    vi.mocked(supabase.functions.invoke).mockReset();
  });

  it('pede pela RPC, com o período, sem inserir na fila nem chamar o drain do browser', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: 'adicionado',
      error: null,
      count: null,
      status: 200,
      statusText: 'OK',
    } as never);

    const resultado = await pedirSyncViaVerde('integ-1', {
      inicio: '2026-09-01',
      fim: '2026-09-07',
    });

    expect(resultado).toBe('adicionado');
    expect(supabase.rpc).toHaveBeenCalledWith('via_verde_sync_pedir', {
      p_integracao_id: 'integ-1',
      p_periodo_inicio: '2026-09-01',
      p_periodo_fim: '2026-09-07',
    });
    expect(supabase.from).not.toHaveBeenCalledWith('via_verde_sync_queue');
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('sem período manda nulos (o robot usa o período por omissão)', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: 'ja_na_fila',
      error: null,
      count: null,
      status: 200,
      statusText: 'OK',
    } as never);

    expect(await pedirSyncViaVerde('integ-1', { inicio: null, fim: null })).toBe('ja_na_fila');
    expect(supabase.rpc).toHaveBeenCalledWith('via_verde_sync_pedir', {
      p_integracao_id: 'integ-1',
      p_periodo_inicio: null,
      p_periodo_fim: null,
    });
  });

  it('propaga a recusa da BD com a mensagem do Postgres', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { message: 'Sem permissão para executar integrações.', code: '42501' },
      count: null,
      status: 403,
      statusText: 'Forbidden',
    } as never);

    await expect(pedirSyncViaVerde('integ-1', { inicio: null, fim: null })).rejects.toMatchObject({
      message: 'Sem permissão para executar integrações.',
    });
  });
});
