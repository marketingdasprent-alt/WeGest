import type { TipoPedidoAlteracao } from '@/hooks/usePedidosTrocaKms';

const chave = (userId: string) => `pedidos-alteracao-aviso:${userId}`;

// sessionStorage pode estar bloqueado (modo privado); nesse caso o aviso mostra-se sempre.
export function avisoJaMostrado(userId: string): boolean {
  try {
    return sessionStorage.getItem(chave(userId)) === '1';
  } catch {
    return false;
  }
}

export function marcarAvisoMostrado(userId: string): void {
  try {
    sessionStorage.setItem(chave(userId), '1');
  } catch {
    // Sem storage não há como lembrar; não é motivo para falhar.
  }
}

export interface ResumoPedidosPendentes {
  total: number;
  porTipo: Partial<Record<TipoPedidoAlteracao, number>>;
}

export function resumirContagens(
  contagens: readonly (readonly [TipoPedidoAlteracao, number])[]
): ResumoPedidosPendentes {
  const porTipo: ResumoPedidosPendentes['porTipo'] = {};
  let total = 0;
  for (const [tipo, n] of contagens) {
    if (n <= 0) continue;
    porTipo[tipo] = n;
    total += n;
  }
  return { total, porTipo };
}
