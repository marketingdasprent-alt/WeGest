import { describe, it, expect } from 'vitest';
import { reservaDialogSchema } from './reservaDialog.schema';

const baseSlot = {
  data_inicio: '2026-07-01T10:00',
  estado: 'pendente' as const,
  regime: 'slot' as const,
  emissor_id: '11111111-1111-1111-1111-111111111111',
  viatura_id: '22222222-2222-2222-2222-222222222222',
  slot_valor_mensal: 300,
  condutores: [
    { cliente_id: null, motorista_id: '33333333-3333-3333-3333-333333333333', is_principal: true },
  ],
};

describe('reservaDialogSchema — slot', () => {
  it('slot pendente só precisa de viatura', () => {
    const r = reservaDialogSchema.safeParse({ ...baseSlot, estado: 'pendente' });
    expect(r.success).toBe(true);
  });

  it('slot em_curso válido com motorista + viatura + valor mensal', () => {
    const r = reservaDialogSchema.safeParse({ ...baseSlot, estado: 'em_curso' });
    expect(r.success).toBe(true);
  });

  it('slot em_curso sem valor mensal é inválido', () => {
    const r = reservaDialogSchema.safeParse({
      ...baseSlot,
      estado: 'em_curso',
      slot_valor_mensal: null,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('slot_valor_mensal'))).toBe(true);
    }
  });

  it('slot em_curso sem motorista é inválido', () => {
    const r = reservaDialogSchema.safeParse({
      ...baseSlot,
      estado: 'em_curso',
      condutores: [
        {
          cliente_id: '44444444-4444-4444-4444-444444444444',
          motorista_id: null,
          is_principal: true,
        },
      ],
    });
    expect(r.success).toBe(false);
  });

  it('slot NUNCA exige cliente/estações (em_curso sem eles é válido)', () => {
    const r = reservaDialogSchema.safeParse({ ...baseSlot, estado: 'em_curso' });
    expect(r.success).toBe(true);
  });

  it('slot NUNCA exige empresa emissora (em_curso sem ela é válido)', () => {
    const r = reservaDialogSchema.safeParse({
      ...baseSlot,
      estado: 'em_curso',
      emissor_id: null,
    });
    expect(r.success).toBe(true);
  });
});

describe('reservaDialogSchema — rent_a_car não regrediu', () => {
  it('rent_a_car em_curso ainda exige cliente e estações', () => {
    const r = reservaDialogSchema.safeParse({
      data_inicio: '2026-07-01T10:00',
      data_fim: '2026-07-05T10:00',
      estado: 'em_curso',
      regime: 'rent_a_car',
      emissor_id: '11111111-1111-1111-1111-111111111111',
      viatura_id: '22222222-2222-2222-2222-222222222222',
      condutores: [
        {
          cliente_id: '44444444-4444-4444-4444-444444444444',
          motorista_id: null,
          is_principal: true,
        },
      ],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const paths = r.error.issues.flatMap((i) => i.path);
      expect(paths).toContain('cliente_id');
      expect(paths).toContain('estacao_entrega_id');
    }
  });

  it('rent_a_car confirmada sem empresa emissora é inválida', () => {
    const r = reservaDialogSchema.safeParse({
      data_inicio: '2026-07-01T10:00',
      data_fim: '2026-07-05T10:00',
      estado: 'confirmada',
      regime: 'rent_a_car',
      emissor_id: null,
      viatura_id: '22222222-2222-2222-2222-222222222222',
      cliente_id: '44444444-4444-4444-4444-444444444444',
      estacao_entrega_id: '55555555-5555-5555-5555-555555555555',
      estacao_recolha_id: '55555555-5555-5555-5555-555555555555',
      condutores: [
        {
          cliente_id: '44444444-4444-4444-4444-444444444444',
          motorista_id: null,
          is_principal: true,
        },
      ],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('emissor_id'))).toBe(true);
    }
  });
});
