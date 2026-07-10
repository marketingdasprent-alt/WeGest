import { z } from 'zod';

export const viaturaSchema = z.object({
  matricula: z
    .string()
    .min(1, 'Matrícula é obrigatória')
    .regex(/^[A-Z0-9]{2}-[A-Z0-9]{2}-[A-Z0-9]{2}$/, 'Formato inválido. Use XX-00-XX'),
  marca: z.string().optional(),
  modelo: z.string().optional(),
  marca_id: z.string().min(1, 'Marca é obrigatória'),
  modelo_id: z.string().min(1, 'Modelo é obrigatório'),
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
});

export type ViaturaFormData = z.infer<typeof viaturaSchema>;

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
