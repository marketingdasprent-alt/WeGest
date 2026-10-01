import { supabase } from '@/integrations/supabase/client';

/**
 * "Ver como grupo": o admin pré-visualiza a app com as permissões de um grupo.
 * Só existe no `pnpm dev` — na build de produção `import.meta.env.DEV` é `false`
 * e o código sai. Muda só o ecrã: a BD continua a responder como a um admin.
 */
export const VER_COMO_DISPONIVEL = import.meta.env.DEV;

const CHAVE = 'wegest:ver-como-grupo';

export interface GrupoPrevisto {
  id: string;
  nome: string;
}

interface Escolha {
  orgId: string;
  cargoId: string;
}

/** Grupo escolhido para a org activa (os ids de grupo são por org). */
export function lerVerComoGrupo(orgId: string): string | null {
  if (!VER_COMO_DISPONIVEL) return null;
  try {
    const escolha = JSON.parse(localStorage.getItem(CHAVE) ?? 'null') as Escolha | null;
    return escolha?.orgId === orgId && typeof escolha.cargoId === 'string' ? escolha.cargoId : null;
  } catch (error: unknown) {
    console.warn('[verComoGrupo] Escolha guardada ilegível — ignorada.', error);
    return null;
  }
}

export function guardarVerComoGrupo(orgId: string, cargoId: string | null): void {
  try {
    if (cargoId) localStorage.setItem(CHAVE, JSON.stringify({ orgId, cargoId }));
    else localStorage.removeItem(CHAVE);
  } catch (error: unknown) {
    console.warn('[verComoGrupo] Não foi possível guardar a escolha.', error);
  }
}

/** Grupo com "admin" no nome já faz de quem o tem admin (regra da BD) — não há o que prever. */
export function cargoPrevisivel(nome: string | null | undefined): boolean {
  return !!nome && !/admin/i.test(nome);
}

/** Grupo a pré-visualizar, se o admin escolheu um e ele ainda existe nesta org. */
export async function carregarGrupoPrevisto(orgId: string): Promise<GrupoPrevisto | null> {
  const cargoId = lerVerComoGrupo(orgId);
  if (!cargoId) return null;

  const { data, error } = await supabase
    .from('cargos')
    .select('id, nome')
    .eq('id', cargoId)
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) {
    console.warn('[verComoGrupo] Não foi possível ler o grupo escolhido.', error);
    return null;
  }
  if (!data || !cargoPrevisivel(data.nome)) {
    // Grupo apagado entretanto (ou de admin): volta-se à vista normal.
    guardarVerComoGrupo(orgId, null);
    return null;
  }
  return { id: data.id, nome: data.nome };
}
