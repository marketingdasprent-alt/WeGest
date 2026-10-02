/**
 * Uma pessoa pode ter vários grupos (cargos) na mesma organização: o principal
 * (user_organizacoes.cargo_id) e os adicionais (user_organizacoes_cargos).
 */

export interface LinhaPermissao {
  recurso_id: string;
  tem_acesso: boolean;
  pode_editar?: boolean | null;
}

/** Todos os grupos da pessoa, o principal primeiro e sem repetidos. */
export function idsDosGrupos(
  principal: string | null | undefined,
  adicionais: readonly string[]
): string[] {
  const ids = new Set<string>();
  if (principal) ids.add(principal);
  for (const id of adicionais) ids.add(id);
  return [...ids];
}

/**
 * Soma as permissões dos grupos: tem acesso a um recurso se ALGUM grupo lho dá,
 * e edita-o se algum grupo que lho dá deixa editar.
 */
export function somarPermissoes(linhas: readonly LinhaPermissao[]): {
  acesso: string[];
  edicao: string[];
} {
  const acesso = new Set<string>();
  const edicao = new Set<string>();
  for (const l of linhas) {
    if (!l.tem_acesso) continue;
    acesso.add(l.recurso_id);
    if (l.pode_editar) edicao.add(l.recurso_id);
  }
  return { acesso: [...acesso], edicao: [...edicao] };
}

/** Mesma regra da base: um grupo com "admin" no nome dá administrador. */
export function ehGrupoAdmin(nome: string | null | undefined): boolean {
  return (nome ?? '').toLowerCase().includes('admin');
}

export function algumGrupoAdmin(nomes: readonly (string | null | undefined)[]): boolean {
  return nomes.some(ehGrupoAdmin);
}

/** O que juntar e o que tirar para passar dos grupos actuais aos pretendidos. */
export function diferencaGrupos(
  actuais: readonly string[],
  pretendidos: readonly string[]
): { inserir: string[]; remover: string[] } {
  const a = new Set(actuais);
  const p = new Set(pretendidos);
  return {
    inserir: [...p].filter((id) => !a.has(id)),
    remover: [...a].filter((id) => !p.has(id)),
  };
}

/** Nomes dos grupos de uma pessoa, na ordem principal + adicionais. */
export function nomesDosGrupos(
  ids: readonly string[],
  grupos: readonly { id: string; nome: string }[]
): string[] {
  return ids.map((id) => grupos.find((g) => g.id === id)?.nome).filter((n): n is string => !!n);
}
