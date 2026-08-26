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

  // Bloco 0.3 da auditoria: até 2026-08-19 a edge function não filtrava por
  // organização nenhuma — quem fechasse numa fechava em todas (a Década Ousada
  // apanhou um fecho de 10–16/08 que só a Premium pediu, com o mesmo carimbo).
  it('envia o orgId para o fecho ficar preso a uma só organização', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { success: true }, error: null });
    await fecharSemanaFinanceiro(
      { functions: { invoke } } as any,
      new Date('2026-07-06T12:00:00Z'),
      new Date('2026-07-12T12:00:00Z'),
      'org-abc'
    );
    expect(invoke).toHaveBeenCalledWith('fechar-semana-financeiro', {
      body: { semanaInicio: '2026-07-06', semanaFim: '2026-07-12', orgId: 'org-abc' },
    });
  });

  it('sem orgId não inventa um: a edge function resolve a organização activa', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { success: true }, error: null });
    await fecharSemanaFinanceiro(
      { functions: { invoke } } as any,
      new Date('2026-07-06T12:00:00Z'),
      new Date('2026-07-12T12:00:00Z'),
      null
    );
    expect(invoke.mock.calls[0][1].body).not.toHaveProperty('orgId');
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
