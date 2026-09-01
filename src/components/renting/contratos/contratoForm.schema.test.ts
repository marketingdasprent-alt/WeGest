import { describe, it, expect } from 'vitest';
import { contratoFormSchema } from './contratoForm.schema';

// TVDE: sem data_fim exigida, e ainda assim precisa de tarifa_id (regime !==
// 'slot') — o payload mínimo mais curto para chegar ao superRefine.
const baseTvde = {
  cliente_id: '11111111-1111-1111-1111-111111111111',
  viatura_id: '22222222-2222-2222-2222-222222222222',
  reserva_id: '33333333-3333-3333-3333-333333333333',
  emissor_id: '44444444-4444-4444-4444-444444444444',
  data_inicio: '2026-07-01T10:00',
  estado_operacional: 'agendado' as const,
  estado_financeiro: 'pendente' as const,
  origem: 'sistema' as const,
  regime: 'tvde' as const,
  tarifa_id: '55555555-5555-5555-5555-555555555555',
  taxa_iva: 23,
  condutores: [
    { cliente_id: '11111111-1111-1111-1111-111111111111', motorista_id: null, is_principal: true },
  ],
};

describe('contratoFormSchema — base válida', () => {
  it('TVDE sem data_fim, com tarifa e condutor, é válido', () => {
    const r = contratoFormSchema.safeParse(baseTvde);
    expect(r.success).toBe(true);
  });
});

// O campo "a cada N dias" só aparece na UI depois de escolher "Intervalo de
// dias" (ver ALDFields, partilhado com a reserva) — fácil ficar por
// preencher. Sem esta validação, o formulário deixava passar e a BD
// rebentava com um erro em bruto (chk_contratos_renovacao_intervalo_obrigatorio,
// caso real em produção 2026-09-01).
describe('contratoFormSchema — renovação por intervalo de dias', () => {
  it('"intervalo_dias" sem o número de dias é inválido', () => {
    const r = contratoFormSchema.safeParse({
      ...baseTvde,
      is_longa_duracao: true,
      renovacao_opcao: 'intervalo_dias',
      renovacao_intervalo_dias: null,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('renovacao_intervalo_dias'))).toBe(true);
    }
  });

  it('"intervalo_dias" com o número de dias é válido', () => {
    const r = contratoFormSchema.safeParse({
      ...baseTvde,
      is_longa_duracao: true,
      renovacao_opcao: 'intervalo_dias',
      renovacao_intervalo_dias: 30,
    });
    expect(r.success).toBe(true);
  });

  it('outra opção de renovação não exige o número de dias', () => {
    const r = contratoFormSchema.safeParse({
      ...baseTvde,
      is_longa_duracao: true,
      renovacao_opcao: 'primeiro_dia_mes',
      renovacao_intervalo_dias: null,
    });
    expect(r.success).toBe(true);
  });

  it('sem opção de renovação nenhuma, o campo dos dias é irrelevante', () => {
    const r = contratoFormSchema.safeParse({
      ...baseTvde,
      is_longa_duracao: false,
      renovacao_opcao: null,
      renovacao_intervalo_dias: null,
    });
    expect(r.success).toBe(true);
  });
});
