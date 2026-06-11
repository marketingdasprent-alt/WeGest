import { z } from 'zod';
import { RENOVACAO_OPCOES, RESERVA_ESTADOS, RESERVA_REGIMES } from '@/types/reserva';

const optionalNumber = z
  .union([z.number(), z.string()])
  .optional()
  .nullable()
  .transform((v) => {
    if (v === '' || v === null || v === undefined) return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  });

const datetimeLocal = z
  .string()
  .min(1, 'Data obrigatória')
  .refine((v) => !Number.isNaN(new Date(v).getTime()), 'Data inválida');

export const reservaDialogSchema = z
  .object({
    viatura_id: z.string().uuid('Viatura inválida').nullable().optional(),
    matricula: z.string().max(20).optional().nullable(),
    grupo: z.string().max(50).optional().nullable(),

    estacao_entrega_id: z.string().uuid().nullable().optional(),
    estacao_recolha_id: z.string().uuid().nullable().optional(),

    data_inicio: datetimeLocal,
    // Slot é aberto (sem data fim). Validação condicional no superRefine.
    data_fim: z.string().optional().nullable(),

    cliente_id: z.string().uuid().nullable().optional(),
    cliente_nome: z.string().max(255).optional().nullable(),

    condutor_id: z.string().uuid().nullable().optional(),
    condutor_nome: z.string().max(255).optional().nullable(),

    // Empresa emissora (cliente tipo='empresa') — determina os templates dos
    // documentos. Obrigatória a partir de confirmada (superRefine).
    emissor_id: z.string().uuid().nullable().optional(),

    estado: z.enum(RESERVA_ESTADOS),
    regime: z.enum(RESERVA_REGIMES).default('rent_a_car'),

    valor_total: optionalNumber,
    slot_valor_semanal: optionalNumber,
    franquia_valor: optionalNumber,
    caucao_valor: optionalNumber,
    kms_incluidos: optionalNumber,
    km_adicional_valor: optionalNumber,

    is_longa_duracao: z.boolean().default(false),
    renovacao_opcao: z.enum(RENOVACAO_OPCOES).nullable().optional(),
    renovacao_intervalo_dias: optionalNumber,

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
  // Validações condicionais ao regime e estado.
  .superRefine((d, ctx) => {
    const isSlot = d.regime === 'slot';
    const exigeCompleto = d.estado === 'confirmada' || d.estado === 'em_curso';

    // Emissor: obrigatório a partir de confirmada, em qualquer regime —
    // é a empresa cujos templates assinam os documentos da reserva.
    if (exigeCompleto && !d.emissor_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['emissor_id'],
        message: 'Empresa emissora obrigatória quando a reserva é confirmada ou está em curso',
      });
    }

    // data_fim: obrigatória e válida fora do regime slot (slot é aberto).
    if (!isSlot) {
      if (!d.data_fim || Number.isNaN(new Date(d.data_fim).getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['data_fim'],
          message: 'Data fim obrigatória',
        });
      } else {
        const inicio = new Date(d.data_inicio).getTime();
        const fim = new Date(d.data_fim).getTime();
        if (fim <= inicio) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['data_fim'],
            message: 'Data fim tem que ser posterior à data início',
          });
        } else if ((fim - inicio) / (1000 * 60 * 60 * 24) > 365) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['data_fim'],
            message: 'Duração máxima: 365 dias',
          });
        }
      }
    }

    // Slot: exige a viatura (carro do motorista); cliente/estações não se aplicam.
    if (isSlot) {
      if (!d.viatura_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['viatura_id'],
          message: 'Seleciona a viatura (carro do motorista)',
        });
      }
      return;
    }

    // Validação condicional: estado confirmada/em_curso exige dados completos.
    // Reserva pendente pode ser rascunho com cliente/viatura/estações por preencher.
    if (!exigeCompleto) return;

    if (!d.cliente_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cliente_id'],
        message: 'Cliente obrigatório quando a reserva é confirmada ou está em curso',
      });
    }
    if (!d.viatura_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['viatura_id'],
        message: 'Viatura obrigatória quando a reserva é confirmada ou está em curso',
      });
    }
    if (!d.estacao_entrega_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['estacao_entrega_id'],
        message: 'Estação de entrega obrigatória',
      });
    }
    // Estação de recolha só é obrigatória em rent-a-car. Em TVDE o condutor fica
    // com a viatura (sem devolução), por isso não se exige recolha.
    if (d.regime === 'rent_a_car' && !d.estacao_recolha_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['estacao_recolha_id'],
        message: 'Estação de recolha obrigatória',
      });
    }
  });

export type ReservaFormValues = z.infer<typeof reservaDialogSchema>;

/** Converte ISO timestamp para input[type=datetime-local] no fuso do browser. */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Converte input[type=datetime-local] (fuso local) para ISO UTC. */
export function localInputToIso(local: string): string {
  return new Date(local).toISOString();
}
