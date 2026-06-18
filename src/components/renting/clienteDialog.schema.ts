/**
 * Schema, tipos e validações do ClienteDialog.
 * Separado do componente para reduzir ruído visual e permitir testes isolados.
 */
import { z } from 'zod';
import {
  validarNIF,
  validarCodigoPostal,
  validarEmail,
  validarTelefone,
  validarIBAN,
  validarCartaConducao,
  validarNumeroDocumento,
} from '@/lib/pt-validators';
import { TIPOS_DOCUMENTO, type TipoDocumento } from '@/types/cliente';

// ── Constantes auxiliares ─────────────────────────────────────
export const TIPO_CARTA = 'Carta de Condução' as const satisfies TipoDocumento;

// Tipos de identificação visíveis no selector (tudo excepto Carta de Condução)
export const TIPOS_DOC_IDENTIFICACAO = TIPOS_DOCUMENTO.filter(
  (t): t is Exclude<TipoDocumento, typeof TIPO_CARTA> => t !== TIPO_CARTA
);

// Mapeamento entre o ENUM `tipo_documento_enum` (DB) e as chaves do pt-validators
const DOC_TYPE_KEY: Partial<Record<TipoDocumento, string>> = {
  'Cartão Cidadão': 'cc',
  Passaporte: 'passaporte',
  'Autorização de Residência': 'ar',
};

// Type guard: confirma que o valor é um TipoDocumento conhecido
export function isTipoDocumento(value: unknown): value is TipoDocumento {
  return typeof value === 'string' && (TIPOS_DOCUMENTO as readonly string[]).includes(value);
}

// ── Validações auxiliares ─────────────────────────────────────
const validateDateYear = (val: string | undefined | null): boolean => {
  if (!val) return true;
  const match = val.match(/^(\d{4})-\d{2}-\d{2}$/);
  if (!match) return true;
  const year = parseInt(match[1], 10);
  return year >= 1900 && year <= 2100;
};

// Wrapper Zod que torna um pt-validator opcional (só valida se preenchido)
const optionalRefine = (fn: (v: string) => { valid: boolean; message?: string }) =>
  z
    .string()
    .optional()
    .refine(
      (v) => !v || fn(v).valid,
      (v) => ({ message: (v ? fn(v).message : '') || 'Valor inválido' })
    );

const optionalDateYear = () =>
  z.string().optional().refine(validateDateYear, { message: 'Ano inválido (1900–2100)' });

// ── Schema base (formato dos campos) ──────────────────────────
const baseSchema = z.object({
  tipo_cliente: z.enum(['particular', 'empresa', 'condutor']),
  // Derivado de tipo_cliente (mantido para a lógica de validação existente).
  is_empresa: z.boolean(),
  nome: z.string().min(1, 'Nome é obrigatório'),
  nome_comercial: z.string().optional(),
  nif: optionalRefine(validarNIF),
  telefone: optionalRefine(validarTelefone),
  email: optionalRefine(validarEmail),
  data_nascimento: optionalDateYear(),
  naturalidade: z.string().optional(),
  genero: z.union([z.enum(['M', 'F', 'Outro']), z.literal('')]).optional(),
  iban: optionalRefine(validarIBAN),
  observacoes: z.string().optional(),
  // Morada
  morada: z.string().optional(),
  codigo_postal: optionalRefine(validarCodigoPostal),
  localidade: z.string().optional(),
  cidade: z.string().optional(),
  pais: z.string().optional(),
  // Documento de identificação
  doc_tipo: z.string().optional(),
  doc_numero: z.string().optional(),
  doc_pais_emissao: z.string().optional(),
  doc_data_emissao: optionalDateYear(),
  doc_validade: optionalDateYear(),
  // Carta de condução
  carta_numero: optionalRefine(validarCartaConducao),
  carta_pais: z.string().optional(),
  carta_data_emissao: optionalDateYear(),
  carta_validade: optionalDateYear(),
});

export type ClienteFormData = z.infer<typeof baseSchema>;

// ── Helper para issues de obrigatoriedade ─────────────────────
type Ctx = z.RefinementCtx;

function exigirCampo<K extends keyof ClienteFormData>(
  data: ClienteFormData,
  ctx: Ctx,
  campo: K,
  mensagem = 'Campo obrigatório'
) {
  const v = data[campo];
  if (!v || (typeof v === 'string' && !v.trim())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [campo as string],
      message: mensagem,
    });
  }
}

// ── Validações por contexto ───────────────────────────────────
function validateComum(data: ClienteFormData, ctx: Ctx) {
  exigirCampo(data, ctx, 'nif');
  exigirCampo(data, ctx, 'telefone');
  exigirCampo(data, ctx, 'email');
  exigirCampo(
    data,
    ctx,
    'data_nascimento',
    data.is_empresa ? 'Data de criação obrigatória' : 'Data de nascimento obrigatória'
  );
  exigirCampo(data, ctx, 'morada');
  exigirCampo(data, ctx, 'codigo_postal');
  exigirCampo(data, ctx, 'localidade');
  exigirCampo(data, ctx, 'cidade');
  exigirCampo(data, ctx, 'pais');
}

/** Exige nome + pelo menos um apelido (≥ 2 palavras). */
function exigirNomeApelido(data: ClienteFormData, ctx: Ctx) {
  if (data.nome.trim()) {
    const palavras = data.nome
      .trim()
      .split(/\s+/)
      .filter((p) => p.length > 0);
    if (palavras.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['nome'],
        message: 'Indique o nome e pelo menos um apelido',
      });
    }
  }
}

/** Carta de condução completa — obrigatória para quem conduz. */
function exigirCarta(data: ClienteFormData, ctx: Ctx) {
  exigirCampo(data, ctx, 'carta_numero');
  exigirCampo(data, ctx, 'carta_validade');
}

function validatePessoa(data: ClienteFormData, ctx: Ctx) {
  exigirNomeApelido(data, ctx);
  exigirCampo(data, ctx, 'genero', 'Selecione o género');
  exigirCampo(data, ctx, 'naturalidade');
  exigirCarta(data, ctx);
}

/**
 * Condutor: só conduz, não é o titular/pagador. Validação mínima —
 * nome + apelido e carta de condução. Sem IBAN, morada, NIF,
 * documento de identificação, etc. (tudo opcional).
 */
function validateCondutor(data: ClienteFormData, ctx: Ctx) {
  exigirNomeApelido(data, ctx);
  exigirCarta(data, ctx);
}

function validateEmpresa(data: ClienteFormData, ctx: Ctx) {
  exigirCampo(data, ctx, 'nome_comercial');
}

function validateDocumentos(data: ClienteFormData, ctx: Ctx) {
  exigirCampo(data, ctx, 'doc_tipo', 'Selecione o tipo de documento');
  exigirCampo(data, ctx, 'doc_numero');
  exigirCampo(data, ctx, 'doc_validade');

  // Número do documento: validar formato conforme o tipo seleccionado
  if (data.doc_numero && data.doc_tipo && isTipoDocumento(data.doc_tipo)) {
    const tipoKey = DOC_TYPE_KEY[data.doc_tipo];
    if (tipoKey) {
      const result = validarNumeroDocumento(tipoKey, data.doc_numero);
      if (!result.valid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['doc_numero'],
          message: result.message || 'Número inválido',
        });
      }
    }
  }
}

// ── Schema final exportado ────────────────────────────────────
export const clienteFormSchema = baseSchema.superRefine((data, ctx) => {
  // Condutor: validação leve (só identidade de condução). Não passa
  // pelas exigências de pagador (NIF, IBAN, morada, doc identificação).
  if (data.tipo_cliente === 'condutor') {
    validateCondutor(data, ctx);
    return;
  }

  validateComum(data, ctx);
  validateDocumentos(data, ctx);
  if (data.is_empresa) {
    validateEmpresa(data, ctx);
  } else {
    validatePessoa(data, ctx);
  }
});

// ── Defaults ──────────────────────────────────────────────────
export const emptyDefaults: ClienteFormData = {
  tipo_cliente: 'particular',
  is_empresa: false,
  nome: '',
  nome_comercial: '',
  nif: '',
  telefone: '',
  email: '',
  data_nascimento: '',
  naturalidade: '',
  genero: '',
  iban: '',
  observacoes: '',
  morada: '',
  codigo_postal: '',
  localidade: '',
  cidade: '',
  pais: 'Portugal',
  doc_tipo: '',
  doc_numero: '',
  doc_pais_emissao: '',
  doc_data_emissao: '',
  doc_validade: '',
  carta_numero: '',
  carta_pais: '',
  carta_data_emissao: '',
  carta_validade: '',
};
