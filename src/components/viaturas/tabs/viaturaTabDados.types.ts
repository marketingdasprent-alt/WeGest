import { z } from 'zod';
import type { FieldErrors } from 'react-hook-form';

export const viaturaSchema = z.object({
  matricula: z
    .string()
    .min(1, 'Matrícula é obrigatória')
    .regex(/^[A-Z0-9]{2}-[A-Z0-9]{2}-[A-Z0-9]{2}$/, 'Formato inválido. Use XX-00-XX'),
  marca: z.string().optional(),
  modelo: z.string().optional(),
  marca_id: z.string().min(1, 'Marca é obrigatória'),
  modelo_id: z.string().optional(),
  combustivel_id: z.string().optional(),
  ano: z.string().optional(),
  cor: z.string().optional(),
  categoria: z.string().optional(),
  combustivel: z.string().optional(),
  status: z.string().optional(),
  km_atual: z.string().optional(),
  numero_motor: z.string().optional(),
  numero_chassis: z.string().optional(),
  data_matricula: z.string().optional(),
  observacoes: z.string().optional(),
  grupo_id: z.string().optional(),
  is_slot: z.boolean().default(false),
  habilitada_tvde: z.boolean().default(false),
  estacao_id: z.string().optional(),
  extintor_numero: z.string().optional(),
  extintor_validade: z.string().optional(),
  tipo_id: z.string().optional(),
  proxima_manutencao_data: z.string().optional(),
  proxima_manutencao_km: z.string().optional(),
});

/**
 * Viatura NOVA: o tipo passa a ser obrigatório.
 *
 * Só na criação, de propósito. Das 449 viaturas em produção, 105 não têm tipo;
 * exigi-lo também na edição impedia de gravar qualquer correcção nessas — até
 * os quilómetros — enquanto ninguém lhes escolhesse um tipo. O que se quer é
 * não deixar entrar viaturas novas sem ele, não bloquear o histórico.
 */
export const viaturaSchemaNova = viaturaSchema.extend({
  tipo_id: z.string().min(1, 'Tipo é obrigatório'),
});

export type ViaturaFormData = z.infer<typeof viaturaSchema>;

/** Nome legível de cada campo, para quando o erro não traz mensagem própria. */
const ROTULOS: Record<string, string> = {
  matricula: 'Matrícula',
  marca_id: 'Marca',
  modelo_id: 'Modelo',
  combustivel_id: 'Combustível',
  tipo_id: 'Tipo',
  grupo_id: 'Grupo',
  estacao_id: 'Estação',
  ano: 'Ano',
  cor: 'Cor',
  km_atual: 'Quilómetros',
  numero_motor: 'Número de motor',
  numero_chassis: 'Número de chassis',
  data_matricula: 'Data da matrícula',
  extintor_numero: 'Número do extintor',
  extintor_validade: 'Validade do extintor',
  proxima_manutencao_data: 'Data da próxima manutenção',
  proxima_manutencao_km: 'Quilómetros da próxima manutenção',
  observacoes: 'Observações',
};

/**
 * Texto do aviso quando a gravação falha na validação.
 *
 * Nomeia SEMPRE o campo. Antes, um erro sem mensagem caía num "verifica os
 * campos obrigatórios" que não dizia qual era — e num formulário com três
 * separadores isso deixa a pessoa à procura.
 */
export function resumoErrosViatura(errors: FieldErrors<ViaturaFormData>): string {
  const partes = Object.entries(errors)
    .map(([campo, erro]) => {
      const mensagem = erro && typeof erro.message === 'string' ? erro.message : '';
      if (mensagem) return mensagem;
      return `${ROTULOS[campo] ?? campo}: preenchimento inválido`;
    })
    .filter(Boolean);

  return Array.from(new Set(partes)).slice(0, 5).join(' · ');
}

export interface Viatura {
  id: string;
  matricula: string;
  marca: string;
  modelo: string;
  marca_id?: string | null;
  modelo_id?: string | null;
  combustivel_id?: string | null;
  ano?: number | null;
  cor?: string | null;
  categoria?: string | null;
  combustivel?: string | null;
  status?: string | null;
  km_atual?: number | null;
  numero_motor?: string | null;
  numero_chassis?: string | null;
  data_matricula?: string | null;
  observacoes?: string | null;
  grupo_id?: string | null;
  is_slot?: boolean | null;
  habilitada_tvde?: boolean | null;
  estacao_id?: string | null;
  extintor_numero?: string | null;
  extintor_validade?: string | null;
  tipo_id?: string | null;
  proxima_manutencao_data?: string | null;
  proxima_manutencao_km?: number | null;
}

export interface ViaturaDocument {
  id: string;
  tipo_documento: string;
  nome_ficheiro: string | null;
  ficheiro_url: string;
  data_validade: string | null;
}

export const CATEGORIAS = [
  { value: 'green', label: 'Green' },
  { value: 'comfort', label: 'Comfort' },
  { value: 'black', label: 'Black' },
  { value: 'x-saver', label: 'X-Saver' },
];

export interface ViaturaMarca {
  id: string;
  nome: string;
}
export interface ViaturaModelo {
  id: string;
  nome: string;
  marca_id: string;
}
export interface ViaturaCombustivel {
  id: string;
  nome: string;
}

export const STATUS_OPTIONS = [
  { value: 'disponivel', label: 'Disponível' },
  { value: 'em_uso', label: 'Em Uso' },
  { value: 'manutencao', label: 'Manutenção' },
  { value: 'inativo', label: 'Inativo' },
];

export const DOCUMENTOS_VIATURA = [
  { tipo: 'dua_frente', label: 'DUA - Frente', obrigatorio: true },
  { tipo: 'dua_verso', label: 'DUA - Verso', obrigatorio: true },
  { tipo: 'dav', label: 'DAV - Declaração Aduaneira de Veículo', obrigatorio: false },
  { tipo: 'ac', label: 'AC - Certificado de Aprovação', obrigatorio: false },
  { tipo: 'ipo', label: 'IPO - Inspeção Periódica Obrigatória', obrigatorio: true },
];

export interface BatchViaturaEntry {
  file: File;
  tipoDetectado: string;
  labelDetectado: string;
  reconhecido: boolean;
}

export interface Estacao {
  id: string;
  nome: string;
  cidade: string | null;
}

export interface ViaturasTipo {
  id: string;
  nome: string;
  elegivel_tvde?: boolean;
}

export interface RentingGrupo {
  id: string;
  nome: string;
}
