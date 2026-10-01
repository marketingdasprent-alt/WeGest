export interface LinhaComTitular {
  motorista_id: string | null;
  cliente_id: string | null;
}

/**
 * Quantas transacções ficaram com dono depois de gravadas. É o gatilho
 * resolver_motorista que decide o titular: contar o que o importador calculou
 * dizia "N com motorista" quando na base ficavam todas sem nenhum.
 */
export function contarComTitular(linhas: readonly LinhaComTitular[] | null | undefined): number {
  return (linhas ?? []).filter((l) => !!l.motorista_id || !!l.cliente_id).length;
}
