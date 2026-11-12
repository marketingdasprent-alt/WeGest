// Travão da faturação: o que fazer quando o documento emitido não tem o total pedido.
// TS puro, sem APIs de Deno: usado pela edge function faturacao-emitir e
// testado pelo Vitest (src/lib/faturacaoTravao.test.ts).
// Em 10/2026 26 faturas da Dasp Rent Sul saíram abaixo do valor e continuaram a sair:
// agora a primeira divergente trava a integração até um administrador a desbloquear.
import {
  avisoTotalDivergente,
  type LinhaParaTotal,
  round2,
  TOLERANCIA_TOTAL,
  toleranciaTotal,
  totalEsperado,
} from './totais.ts';

export type DecisaoTotal =
  | { estado: 'ok'; totalFiscal: number }
  | { estado: 'nao_confirmado'; totalFiscal: null }
  | {
      estado: 'divergente';
      totalFiscal: number;
      numero: string;
      esperado: number;
      real: number;
      motivo: string;
      aviso: string;
    };

/** O RC não traz total; nos outros tipos decide-se sempre (sem total lido fica 'nao_confirmado'). */
export function confirmaTotalEmitido(tipo: string): boolean {
  return tipo !== 'RC';
}

/**
 * Compara o GrossTotal lido no fornecedor com o total pedido (tolerância de arredondamento,
 * proporcional à fatura). Um real <= 0 num documento esperado positivo é leitura suspeita
 * (ex.: CabecDoc ainda por calcular), não prova de divergência: avisa, não trava.
 * Na NC o sinal lido ainda não está confirmado, por isso compara-se o módulo.
 */
export function decidirTotalEmitido(
  esperado: number,
  real: number | null | undefined,
  numero: string,
  tolerancia: number = TOLERANCIA_TOTAL,
  tipo: string = 'FT'
): DecisaoTotal {
  if (real == null || !Number.isFinite(real))
    return { estado: 'nao_confirmado', totalFiscal: null };
  const lido = tipo === 'NC' ? Math.abs(real) : real;
  if (lido <= 0 && esperado > tolerancia) return { estado: 'nao_confirmado', totalFiscal: null };
  const totalFiscal = round2(lido);
  if (Math.abs(lido - esperado) <= tolerancia) return { estado: 'ok', totalFiscal };
  const esp = round2(esperado);
  return {
    estado: 'divergente',
    totalFiscal,
    numero,
    esperado: esp,
    real: totalFiscal,
    motivo: `Documento ${numero}: esperado ${esp.toFixed(2)} €, real ${totalFiscal.toFixed(2)} €.`,
    aviso: avisoTotalDivergente(esperado, lido, numero) ?? '',
  };
}

/** Como decidirTotalEmitido mas nunca lança: o documento já existe no fornecedor e o espelho tem de se gravar. */
export function decisaoSegura(
  itens: LinhaParaTotal[],
  precosComIva: boolean,
  real: number | null | undefined,
  numero: string,
  tipo: string
): DecisaoTotal {
  try {
    return decidirTotalEmitido(
      totalEsperado(itens, precosComIva),
      real,
      numero,
      toleranciaTotal(itens),
      tipo
    );
  } catch (e) {
    console.warn('[faturacao] não foi possível calcular o total esperado:', numero, e);
    return { estado: 'nao_confirmado', totalFiscal: null };
  }
}

/** Mensagem de recusa quando a integração está travada, senão null. Falha fechada. */
export function recusaPorTravao(
  bloqueadaEm: string | null | undefined,
  motivo: string | null | undefined
): string | null {
  if (!bloqueadaEm) return null;
  const porque = motivo?.trim().replace(/\.+$/, '') || 'total do documento diferente do pedido';
  return `Faturação travada: ${porque}. Peça a um administrador para desbloquear.`;
}

/** Recusa da NC quando o fornecedor não permite consultar o documento (sem teto não se emite). */
export const RECUSA_NC_SEM_CONSULTA =
  'Este fornecedor de faturação não permite confirmar o total da fatura; nada foi emitido. Emita a nota de crédito diretamente no software de faturação.';

export interface AvisosDeEmissao {
  warning?: string;
  totalDivergente?: { numero: string; esperado: number; real: number };
  totalNaoConfirmado?: true;
}

/** Campos de aviso da resposta da edge (contrato com o ecrã). */
export function avisosDaDecisao(d: DecisaoTotal, numero: string): AvisosDeEmissao {
  if (d.estado === 'divergente') {
    return {
      warning: `${d.aviso} A faturação desta integração ficou travada até um administrador a desbloquear.`,
      totalDivergente: { numero: d.numero, esperado: d.esperado, real: d.real },
    };
  }
  if (d.estado === 'nao_confirmado') {
    return {
      warning: `Não foi possível confirmar o total do documento ${numero} no software de faturação. Confirme-o lá.`,
      totalNaoConfirmado: true,
    };
  }
  return {};
}

/** Texto do aviso no sino aos administradores. */
export function mensagemNotificacaoTravao(d: Extract<DecisaoTotal, { estado: 'divergente' }>) {
  return {
    titulo: 'Faturação travada: total diferente do pedido',
    mensagem: `${d.motivo} A faturação desta integração ficou travada até ser desbloqueada.`,
  };
}
