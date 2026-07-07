export type PapelAssinatura = 'motorista' | 'responsavel';

/**
 * Dado o par de assinaturas (data URL ou null/vazio), devolve os papéis que
 * ainda não foram assinados. Usado para o aviso "Concluir sem assinatura?".
 */
export function papeisEmFalta(sigs: {
  motorista: string | null;
  responsavel: string | null;
}): PapelAssinatura[] {
  const falta: PapelAssinatura[] = [];
  if (!sigs.motorista) falta.push('motorista');
  if (!sigs.responsavel) falta.push('responsavel');
  return falta;
}
