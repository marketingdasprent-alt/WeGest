// src/components/administrativo/ContasResumoTabFecharSemana.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { fecharSemanaFinanceiro } from './ContasResumoTab';

describe('fecharSemanaFinanceiro', () => {
  it('invoca a edge function com semanaInicio e semanaFim no formato yyyy-MM-dd', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { success: true }, error: null });
    const result = await fecharSemanaFinanceiro(
      { functions: { invoke } } as any,
      new Date('2026-07-06T12:00:00Z'),
      new Date('2026-07-12T12:00:00Z')
    );
    expect(invoke).toHaveBeenCalledWith('fechar-semana-financeiro', {
      body: { semanaInicio: '2026-07-06', semanaFim: '2026-07-12' },
    });
    expect(result.success).toBe(true);
  });

  it('aceita período parcial, não alinhado a uma semana civil (ex: segunda a quarta)', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { success: true }, error: null });
    await fecharSemanaFinanceiro(
      { functions: { invoke } } as any,
      new Date('2026-07-06T12:00:00Z'),
      new Date('2026-07-08T12:00:00Z')
    );
    expect(invoke).toHaveBeenCalledWith('fechar-semana-financeiro', {
      body: { semanaInicio: '2026-07-06', semanaFim: '2026-07-08' },
    });
  });

  it('propaga erro quando a edge function falha (erro de transporte)', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(
      fecharSemanaFinanceiro(
        { functions: { invoke } } as any,
        new Date('2026-07-06T12:00:00Z'),
        new Date('2026-07-12T12:00:00Z')
      )
    ).rejects.toThrow('boom');
  });

  it('propaga erro quando a edge function devolve success:false (HTTP 200 com falha lógica, ex: período no futuro)', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { success: false, error: 'Não é possível fechar um período que ainda não começou.' },
      error: null,
    });
    await expect(
      fecharSemanaFinanceiro(
        { functions: { invoke } } as any,
        new Date('2026-07-25T12:00:00Z'),
        new Date('2026-07-30T12:00:00Z')
      )
    ).rejects.toThrow('Não é possível fechar um período que ainda não começou.');
  });
});
