import { formatDateTime } from '@/utils/formatters';

export type EstadoAcessoCodigo =
  | 'sem_conta'
  | 'nunca_entrou'
  | 'ativo'
  | 'provisoria_pendente'
  | 'provisoria_expirada';

export interface EstadoAcessoRow {
  estado: EstadoAcessoCodigo;
  email_conta: string | null;
  email_ficha: string | null;
  email_difere: boolean;
  ultimo_acesso: string | null;
  provisoria_expira_em: string | null;
}

export type TomAcesso = 'neutro' | 'ok' | 'aviso' | 'erro';

export interface EstadoAcessoVista {
  rotulo: string;
  detalhe: string | null;
  tom: TomAcesso;
  podeEnviar: boolean;
  aviso?: string;
}

const ROTULOS: Record<
  EstadoAcessoCodigo,
  { tom: TomAcesso; rotulo: (r: EstadoAcessoRow) => string }
> = {
  sem_conta: { tom: 'neutro', rotulo: () => 'Sem conta na app' },
  nunca_entrou: { tom: 'aviso', rotulo: () => 'Conta criada, nunca entrou' },
  ativo: {
    tom: 'ok',
    rotulo: (r) =>
      r.ultimo_acesso ? `Último acesso em ${formatDateTime(r.ultimo_acesso)}` : 'Conta ativa',
  },
  provisoria_pendente: {
    tom: 'aviso',
    rotulo: (r) => `Senha provisória enviada, válida até ${formatDateTime(r.provisoria_expira_em)}`,
  },
  provisoria_expirada: { tom: 'erro', rotulo: () => 'Senha provisória expirada' },
};

export function estadoAcesso(row: EstadoAcessoRow): EstadoAcessoVista {
  const { tom, rotulo } = ROTULOS[row.estado];
  const detalhe = row.email_conta ?? row.email_ficha ?? null;
  const aviso =
    row.email_difere && row.email_conta
      ? `A conta usa ${row.email_conta}, diferente do email da ficha`
      : undefined;
  return { rotulo: rotulo(row), detalhe, tom, podeEnviar: true, ...(aviso ? { aviso } : {}) };
}
