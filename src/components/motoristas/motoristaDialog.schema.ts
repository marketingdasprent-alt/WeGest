import * as z from 'zod';
import { validateDateYear } from '@/utils/dateValidators';
import {
  validarNIF,
  validarIBAN,
  validarCodigoPostal,
  validarCartaConducao,
  validarNumeroDocumento,
} from '@/lib/pt-validators';

// Mapeia os labels do select para as chaves de regra do pt-validators
// (mesmo mapeamento do clienteDialog.schema).
const DOC_TYPE_KEY: Record<string, string> = {
  'Cartão Cidadão': 'cc',
  Passaporte: 'passaporte',
  'Autorização de Residência': 'ar',
};

export const formSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório'),
  nif: z
    .string()
    .min(1, 'NIF é obrigatório')
    .refine(
      (v) => validarNIF(v).valid,
      (v) => ({ message: validarNIF(v).message || 'NIF inválido' })
    ),
  telefone: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  documento_tipo: z.string().min(1, 'Tipo de documento é obrigatório'),
  documento_numero: z.string().min(1, 'Número do documento é obrigatório'),
  documento_validade: z.string().optional().refine(validateDateYear, {
    message: 'Ano inválido (use entre 1900 e 2100)',
  }),
  carta_conducao: z
    .string()
    .min(1, 'Número da carta de condução é obrigatório')
    .refine(
      (v) => validarCartaConducao(v).valid,
      (v) => ({ message: validarCartaConducao(v).message || 'Carta de condução inválida' })
    ),
  carta_categorias: z.array(z.string()).optional(),
  carta_validade: z.string().optional().refine(validateDateYear, {
    message: 'Ano inválido (use entre 1900 e 2100)',
  }),
  licenca_tvde_numero: z.string().optional(),
  licenca_tvde_validade: z.string().optional().refine(validateDateYear, {
    message: 'Ano inválido (use entre 1900 e 2100)',
  }),
  morada: z.string().optional(),
  codigo_postal: z
    .string()
    .optional()
    .refine(
      (v) => !v || validarCodigoPostal(v).valid,
      (v) => ({ message: (v ? validarCodigoPostal(v).message : '') || 'Código postal inválido' })
    ),
  data_contratacao: z
    .string()
    .min(1, 'Data de contratação é obrigatória')
    .refine(validateDateYear, {
      message: 'Ano inválido (use entre 1900 e 2100)',
    }),
  cidade: z.string().optional(),
  status_ativo: z.boolean().optional(),
  is_slot: z.boolean().optional(),
  observacoes: z.string().optional(),
  iban: z
    .string()
    .optional()
    .refine(
      (v) => !v || validarIBAN(v).valid,
      (v) => ({ message: (v ? validarIBAN(v).message : '') || 'IBAN inválido' })
    ),
  caucao_valor: z.number().nullable().optional(),
  lead_id: z.string().nullable().optional(),
  gestor_responsavel: z.string().optional().nullable(),
  bolt_id: z.string().optional().nullable(),
  uber_uuid: z.string().optional().nullable(),
  documento_ficheiro_url: z.string().optional(),
  documento_identificacao_verso_url: z.string().optional(),
  carta_ficheiro_url: z.string().optional(),
  carta_conducao_verso_url: z.string().optional(),
  licenca_tvde_ficheiro_url: z.string().optional(),
  registo_criminal_url: z.string().optional(),
  comprovativo_morada_url: z.string().optional(),
  comprovativo_iban_url: z.string().optional(),
});

export const formSchemaValidado = formSchema.superRefine((data, ctx) => {
  // Nº do documento validado conforme o tipo seleccionado (CC, passaporte, AR).
  if (data.documento_tipo && data.documento_numero) {
    const res = validarNumeroDocumento(
      DOC_TYPE_KEY[data.documento_tipo] ?? data.documento_tipo,
      data.documento_numero
    );
    if (!res.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['documento_numero'],
        message: res.message || 'Número de documento inválido',
      });
    }
  }
});

export type FormValues = z.infer<typeof formSchema>;

export const CATEGORIAS_CARTA = ['A', 'A1', 'A2', 'B', 'B1', 'C', 'C1', 'D', 'D1', 'E'];

export function normalizeNif(nif: string): string {
  return nif.replace(/\s/g, '');
}

export interface MotoristaPayload {
  nome: string;
  nif: string | null;
  telefone: string | null;
  email: string | null;
  documento_tipo: string | null;
  documento_numero: string | null;
  documento_validade: string | null;
  carta_conducao: string | null;
  carta_categorias: string[] | null;
  carta_validade: string | null;
  licenca_tvde_numero: string | null;
  licenca_tvde_validade: string | null;
  morada: string | null;
  codigo_postal: string | null;
  data_contratacao: string | null;
  cidade: string | null;
  status_ativo: boolean;
  is_slot: boolean;
  observacoes: string | null;
  iban: string | null;
  caucao_valor: number | null;
  lead_id: string | null;
  gestor_responsavel: string | null;
  bolt_id: string | null;
  uber_uuid: string | null;
  documento_ficheiro_url: string | null;
  documento_identificacao_verso_url: string | null;
  carta_ficheiro_url: string | null;
  carta_conducao_verso_url: string | null;
  licenca_tvde_ficheiro_url: string | null;
  registo_criminal_url: string | null;
  comprovativo_morada_url: string | null;
  comprovativo_iban_url: string | null;
}

/** Constrói o payload de INSERT/UPDATE a partir dos valores do form —
 *  normaliza NIF/IBAN e converte o sentinel 'none' de gestor_responsavel. */
export function buildMotoristaPayload(values: FormValues): MotoristaPayload {
  const nifNormalizado = normalizeNif(values.nif);
  const ibanNormalizado = values.iban ? values.iban.replace(/\s/g, '').toUpperCase() : '';

  return {
    nome: values.nome,
    nif: nifNormalizado || null,
    telefone: values.telefone || null,
    email: values.email || null,
    documento_tipo: values.documento_tipo || null,
    documento_numero: values.documento_numero || null,
    documento_validade: values.documento_validade || null,
    carta_conducao: values.carta_conducao || null,
    carta_categorias: values.carta_categorias || null,
    carta_validade: values.carta_validade || null,
    licenca_tvde_numero: values.licenca_tvde_numero || null,
    licenca_tvde_validade: values.licenca_tvde_validade || null,
    morada: values.morada || null,
    codigo_postal: values.codigo_postal || null,
    data_contratacao: values.data_contratacao || null,
    cidade: values.cidade || null,
    status_ativo: values.status_ativo ?? true,
    is_slot: values.is_slot ?? false,
    observacoes: values.observacoes || null,
    iban: ibanNormalizado || null,
    caucao_valor: values.caucao_valor ?? null,
    lead_id: values.lead_id || null,
    gestor_responsavel:
      values.gestor_responsavel === 'none' ? null : values.gestor_responsavel || null,
    bolt_id: values.bolt_id || null,
    uber_uuid: values.uber_uuid || null,
    documento_ficheiro_url: values.documento_ficheiro_url || null,
    documento_identificacao_verso_url: values.documento_identificacao_verso_url || null,
    carta_ficheiro_url: values.carta_ficheiro_url || null,
    carta_conducao_verso_url: values.carta_conducao_verso_url || null,
    licenca_tvde_ficheiro_url: values.licenca_tvde_ficheiro_url || null,
    registo_criminal_url: values.registo_criminal_url || null,
    comprovativo_morada_url: values.comprovativo_morada_url || null,
    comprovativo_iban_url: values.comprovativo_iban_url || null,
  };
}
