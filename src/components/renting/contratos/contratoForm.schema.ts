import { z } from 'zod';
import {
  CONTRATO_ESTADOS_FIN,
  CONTRATO_ESTADOS_OP,
  CONTRATO_ORIGENS,
  CONTRATO_REGIMES,
  CONTRATO_RENOVACAO_OPCOES,
} from '@/types/contratoRenting';

const datetimeLocal = z
  .string()
  .min(1, 'Data obrigatória')
  .refine((v) => !Number.isNaN(new Date(v).getTime()), 'Data inválida');

const optionalNumber = z
  .union([z.number(), z.string()])
  .optional()
  .nullable()
  .transform((v) => {
    if (v === '' || v === null || v === undefined) return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  });

/** Number opcional não-negativo (campos monetários). */
const optionalNonNegativeNumber = optionalNumber.pipe(
  z.number().min(0, 'Valor não pode ser negativo').nullable()
);

/** Percentagem opcional entre 0 e 100. */
const optionalPercentage = optionalNumber.pipe(
  z.number().min(0, 'Mínimo 0%').max(100, 'Máximo 100%').nullable()
);

export const contratoFormSchema = z
  .object({
    // Cliente + Viatura (obrigatórios)
    cliente_id: z.string().uuid('Cliente inválido'),
    viatura_id: z.string().uuid('Viatura inválida'),
    grupo: z.string().max(50).optional().nullable(),
    matricula: z.string().max(20).optional().nullable(),

    // Reserva associada (obrigatória — contrato sempre origina de reserva)
    reserva_id: z.string().uuid('Reserva inválida'),

    // Empresa emissora (cliente tipo='empresa') — obrigatória; determina os
    // templates dos documentos gerados a partir do contrato.
    emissor_id: z.string().uuid('Empresa emissora obrigatória'),

    // Gestor responsável (profiles.id). Reatribuível por superiores; default
    // (criador) é tratado pela BD. Privacidade por gestor.
    gestor_id: z.string().uuid().nullable().optional(),

    // Entrega
    estacao_entrega_id: z.string().uuid().nullable().optional(),
    data_inicio: datetimeLocal,

    // Recolha
    estacao_recolha_id: z.string().uuid().nullable().optional(),
    // TVDE pode não ter data de fim (contrato em aberto até à 1.ª renovação,
    // que arranca o ciclo mensal) — obrigatória só fora desse regime
    // (validado no superRefine abaixo).
    data_fim: z.string().optional().nullable(),

    // Estação origem da viatura
    estacao_origem_viatura_id: z.string().uuid().nullable().optional(),

    // Estados
    estado_operacional: z.enum(CONTRATO_ESTADOS_OP),
    estado_financeiro: z.enum(CONTRATO_ESTADOS_FIN),
    origem: z.enum(CONTRATO_ORIGENS),
    regime: z.enum(CONTRATO_REGIMES).default('rent_a_car'),

    // Tarifário simples
    tarifa_diaria: optionalNonNegativeNumber,
    // Tarifa aplicada (herdada da reserva). Em TVDE é a tarifa tipo='tvde'
    // escolhida na reserva; usada para o preço semanal por modelo.
    tarifa_id: z.string().uuid().nullable().optional(),
    desconto_percentagem: optionalPercentage,
    taxa_iva: z
      .union([z.number(), z.string()])
      .transform((v) => {
        const n = typeof v === 'number' ? v : Number(v);
        return Number.isFinite(n) ? n : 23;
      })
      .pipe(z.number().min(0, 'Mínimo 0%').max(100, 'Máximo 100%')),
    valor_total_manual: optionalNonNegativeNumber,

    // Longa duração / renovação
    is_longa_duracao: z.boolean().default(false),
    renovacao_opcao: z.enum(CONTRATO_RENOVACAO_OPCOES).nullable().optional(),
    renovacao_intervalo_dias: optionalNonNegativeNumber,

    // Financeiro extra (espelha reserva)
    franquia_valor: optionalNonNegativeNumber,
    caucao_valor: optionalNonNegativeNumber,
    kms_incluidos: optionalNonNegativeNumber,
    km_adicional_valor: optionalNonNegativeNumber,

    // Coberturas (m:n com renting_coberturas — várias por contrato, com snapshot)
    coberturas: z
      .array(
        z.object({
          cobertura_id: z.string().uuid('Cobertura inválida'),
          cobertura_nome: z.string(),
          preco_dia: z.number(),
          franquia_valor: z.number().nullable(),
        })
      )
      .default([])
      .refine(
        (lista) => {
          const ids = lista.map((c) => c.cobertura_id);
          return new Set(ids).size === ids.length;
        },
        { message: 'Cada cobertura só pode aparecer uma vez.' }
      ),

    // Extras (m:n com renting_extras — vários por contrato, com snapshot + quantidade)
    extras: z
      .array(
        z.object({
          extra_id: z.string().uuid('Extra inválido'),
          extra_nome: z.string(),
          preco_unidade: z.number(),
          tipo_calculo: z.enum(['dia', 'fixo']),
          quantidade: z.number().int().min(1, 'Quantidade mínima: 1'),
        })
      )
      .default([])
      .refine(
        (lista) => {
          const ids = lista.map((e) => e.extra_id);
          return new Set(ids).size === ids.length;
        },
        { message: 'Cada extra só pode aparecer uma vez.' }
      ),

    // Taxas (m:n com renting_taxas — várias por contrato, % ou valor fixo)
    taxas: z
      .array(
        z.object({
          taxa_id: z.string().uuid('Taxa inválida'),
          taxa_nome: z.string(),
          percentagem: z.number().nullable(),
          valor_fixo: z.number().nullable(),
        })
      )
      .default([])
      .refine(
        (lista) => {
          const ids = lista.map((t) => t.taxa_id);
          return new Set(ids).size === ids.length;
        },
        { message: 'Cada taxa só pode aparecer uma vez.' }
      ),

    // Voucher + info adicional
    voucher_codigo: z.string().max(50).optional().nullable(),

    observacoes: z.string().max(2000).optional().nullable(),
    observacoes_internas: z.string().max(2000).optional().nullable(),

    condutores: z
      .array(
        z
          .object({
            cliente_id: z.string().uuid().nullable().default(null),
            motorista_id: z.string().uuid().nullable().default(null),
            is_principal: z.boolean().default(false),
          })
          .refine((c) => (c.cliente_id !== null) !== (c.motorista_id !== null), {
            message: 'Cada condutor tem que ser cliente OU motorista (não ambos).',
          })
      )
      .min(1, 'É obrigatório pelo menos um condutor.')
      .default([])
      .refine(
        (lista) => {
          const chaves = lista.map((c) => c.cliente_id ?? c.motorista_id);
          return new Set(chaves).size === chaves.length;
        },
        { message: 'Cada entidade só pode aparecer uma vez como condutor.' }
      )
      .refine((lista) => lista.filter((c) => c.is_principal).length <= 1, {
        message: 'Apenas um condutor pode ser principal.',
      }),
  })
  .superRefine((d, ctx) => {
    // TVDE: data de fim OPCIONAL — sem ela o contrato fica em aberto e a 1.ª
    // renovação (RPC renovar_contrato_renting) fecha o período até hoje e
    // arranca o ciclo mensal. Quando fornecida, valida-se só a ordem.
    if (d.regime === 'tvde') {
      if (
        d.data_fim &&
        !Number.isNaN(new Date(d.data_fim).getTime()) &&
        new Date(d.data_fim).getTime() <= new Date(d.data_inicio).getTime()
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['data_fim'],
          message: 'Data fim tem que ser posterior à data início',
        });
      }
      return;
    }
    if (!d.data_fim || Number.isNaN(new Date(d.data_fim).getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['data_fim'],
        message: 'Data fim obrigatória',
      });
      return;
    }
    if (new Date(d.data_fim).getTime() <= new Date(d.data_inicio).getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['data_fim'],
        message: 'Data fim tem que ser posterior à data início',
      });
    }
  });

export type ContratoFormValues = z.infer<typeof contratoFormSchema>;

export const DEFAULT_CONTRATO_VALUES: ContratoFormValues = {
  cliente_id: '',
  viatura_id: '',
  grupo: '',
  matricula: '',
  reserva_id: '',
  emissor_id: '',
  gestor_id: null,
  estacao_entrega_id: null,
  data_inicio: '',
  estacao_recolha_id: null,
  data_fim: '',
  estacao_origem_viatura_id: null,
  estado_operacional: 'agendado',
  estado_financeiro: 'pendente',
  origem: 'sistema',
  regime: 'rent_a_car',
  tarifa_diaria: null,
  tarifa_id: null,
  desconto_percentagem: null,
  taxa_iva: 23,
  valor_total_manual: null,
  is_longa_duracao: false,
  renovacao_opcao: null,
  renovacao_intervalo_dias: null,
  franquia_valor: null,
  caucao_valor: null,
  kms_incluidos: null,
  km_adicional_valor: null,
  coberturas: [],
  extras: [],
  taxas: [],
  voucher_codigo: '',
  observacoes: '',
  observacoes_internas: '',
  condutores: [],
};

/** Converte ISO timestamp para input[type=datetime-local] no fuso do browser. */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function localInputToIso(local: string): string {
  return new Date(local).toISOString();
}
