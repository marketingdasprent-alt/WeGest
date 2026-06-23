import { z } from 'zod';
import { MOVIMENTO_ESTADOS, MOVIMENTO_TIPOS } from '@/types/movimento';

/** Aceita number | string | '' | null e normaliza para number | null. */
const optionalNumber = z
  .union([z.number(), z.string()])
  .optional()
  .nullable()
  .transform((v) => {
    if (v === '' || v === null || v === undefined) return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  });

const isValidDate = (v: string) => !Number.isNaN(new Date(v).getTime());

export const movimentoFormSchema = z
  .object({
    tipo: z.enum(MOVIMENTO_TIPOS, { required_error: 'Escolhe o tipo de movimento' }),
    estado: z.enum(MOVIMENTO_ESTADOS),

    viatura_id: z.string().uuid('Viatura inválida').nullable(),
    matricula: z.string().max(20).optional().nullable(),

    estacao_origem_id: z.string().uuid().nullable().optional(),
    estacao_destino_id: z.string().uuid().nullable().optional(),

    data_partida: z
      .string()
      .min(1, 'Data de partida obrigatória')
      .refine(isValidDate, 'Data inválida'),
    data_chegada: z
      .string()
      .optional()
      .nullable()
      .refine((v) => !v || isValidDate(v), 'Data inválida'),

    colaborador_id: z.string().uuid().nullable().optional(),
    colaborador_nome: z.string().max(255).optional().nullable(),

    km_inicial: optionalNumber,
    km_final: optionalNumber,
    combustivel_inicial: optionalNumber,
    combustivel_final: optionalNumber,

    motivo: z.string().max(255).optional().nullable(),
    prestador: z.string().max(255).optional().nullable(),
    custo_estimado: optionalNumber,
    custo_final: optionalNumber,

    info: z.string().max(255).optional().nullable(),
    observacoes: z.string().max(2000).optional().nullable(),
    observacoes_internas: z.string().max(2000).optional().nullable(),
  })
  .superRefine((d, ctx) => {
    if (!d.viatura_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Seleciona a viatura',
        path: ['viatura_id'],
      });
    }

    if (d.data_chegada && isValidDate(d.data_chegada) && isValidDate(d.data_partida)) {
      if (new Date(d.data_chegada).getTime() < new Date(d.data_partida).getTime()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'A chegada não pode ser anterior à partida',
          path: ['data_chegada'],
        });
      }
    }

    if (d.tipo === 'transferencia') {
      if (!d.estacao_origem_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Estação de origem obrigatória',
          path: ['estacao_origem_id'],
        });
      }
      if (!d.estacao_destino_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Estação de destino obrigatória',
          path: ['estacao_destino_id'],
        });
      }
    }

    if (
      d.km_inicial !== null &&
      d.km_inicial !== undefined &&
      d.km_final !== null &&
      d.km_final !== undefined &&
      d.km_final < d.km_inicial
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'O KM final não pode ser inferior ao inicial',
        path: ['km_final'],
      });
    }
  });

export type MovimentoFormValues = z.infer<typeof movimentoFormSchema>;
