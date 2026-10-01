import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Fuel, Zap } from 'lucide-react';

export type StatusCartao = 'disponivel' | 'em_uso' | 'cancelado' | 'bloqueado' | 'perdido';

export interface CartaoFrota {
  id: string;
  numero: string;
  tipo: 'bp' | 'repsol' | 'edp';
  motorista_id: string | null;
  ultimo_motorista_id: string | null;
  cliente_id: string | null;
  ativo: boolean;
  status: StatusCartao;
  data_validade: string | null;
  data_entrega: string | null;
  data_devolucao: string | null;
  limite: number | null;
  pin: string | null;
  ambito: string | null;
  detentor: string | null;
  notas: string | null;
  devolucao: string | null;
  ultimo_cliente_id: string | null;
  motorista: { nome: string } | null;
  ultimo_motorista: { nome: string } | null;
  cliente: { nome: string } | null;
  ultimo_cliente: { nome: string } | null;
}

export interface MotoristaOption {
  id: string;
  nome: string;
}

export interface ClienteOption {
  id: string;
  nome: string;
}

/**
 * O titular de um cartão é um motorista OU um cliente, nunca os dois — a base
 * garante-o com `cartoes_frota_um_titular`. No formulário isso vive como um
 * valor único prefixado, para que o `<Select>` (que só sabe de strings) não
 * consiga exprimir o estado inválido "os dois preenchidos".
 */
export type TitularRef = `m:${string}` | `c:${string}` | '';

export const titularRef = (motoristaId: string, clienteId: string): TitularRef =>
  motoristaId ? `m:${motoristaId}` : clienteId ? `c:${clienteId}` : '';

export const parseTitular = (ref: TitularRef): { motorista_id: string; cliente_id: string } =>
  ref.startsWith('m:')
    ? { motorista_id: ref.slice(2), cliente_id: '' }
    : ref.startsWith('c:')
      ? { motorista_id: '', cliente_id: ref.slice(2) }
      : { motorista_id: '', cliente_id: '' };

export const STATUS_INFO: Record<StatusCartao, { label: string; cls: string }> = {
  disponivel: {
    label: 'Disponível',
    cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
  em_uso: {
    label: 'Em Uso',
    cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  },
  cancelado: {
    label: 'Cancelado',
    cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  },
  bloqueado: {
    label: 'Bloqueado',
    cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  },
  perdido: {
    label: 'Perdido',
    cls: 'bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300',
  },
};

export const STATUS_ORDER: StatusCartao[] = [
  'disponivel',
  'em_uso',
  'cancelado',
  'bloqueado',
  'perdido',
];

export interface HistoricoItem {
  transaction_date: string;
  amount: number;
  station_name: string | null;
  fuel_type: string | null;
  quantity: number | null;
}

export const TIPO_INFO = {
  bp: {
    label: 'BP',
    Icon: Fuel,
    badgeCls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  },
  repsol: {
    label: 'Repsol',
    Icon: Fuel,
    badgeCls: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  },
  edp: {
    label: 'EDP',
    Icon: Zap,
    badgeCls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  },
} as const;

export const fmtEur = (v: number | null) =>
  v == null
    ? '-'
    : new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v);
export const fmtDate = (s: string | null) => {
  if (!s) return '-';
  try {
    return format(new Date(s), 'dd/MM/yyyy', { locale: pt });
  } catch {
    return s.slice(0, 10);
  }
};
export const fmtDT = (s: string | null) => {
  if (!s) return '-';
  try {
    return format(new Date(s), 'dd/MM/yyyy HH:mm', { locale: pt });
  } catch {
    return s.slice(0, 16);
  }
};
export const norm = (s: string) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

export type Movimento = 'nenhum' | 'entrega' | 'devolucao';

export type FormState = {
  numero: string;
  tipo: 'bp' | 'repsol' | 'edp';
  data_validade: string;
  limite: string;
  pin: string;
  ambito: string;
  detentor: string;
  notas: string;
  devolucao: string;
  status: StatusCartao;
  motorista_id: string;
  cliente_id: string;
  ultimo_motorista_id: string;
  ultimo_cliente_id: string;
  data_entrega: string;
  data_devolucao: string;
  movimento: Movimento;
};

export const emptyForm = (): FormState => ({
  numero: '',
  tipo: 'bp',
  data_validade: '',
  limite: '',
  pin: '',
  ambito: '',
  detentor: '',
  notas: '',
  devolucao: '',
  status: 'disponivel',
  motorista_id: '',
  cliente_id: '',
  ultimo_motorista_id: '',
  ultimo_cliente_id: '',
  data_entrega: '',
  data_devolucao: '',
  movimento: 'nenhum',
});

export const todayISO = () => new Date().toISOString().slice(0, 10);
