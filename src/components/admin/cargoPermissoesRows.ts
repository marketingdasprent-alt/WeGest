import type { Permission } from './PermissionsSelector';

/** Linha aceite pela tabela cargo_permissoes — só as colunas que existem
 *  na BD (tem_acesso/pode_editar). Enviar colunas extra (ex.: pode_ver)
 *  faz o PostgREST rejeitar o insert inteiro com PGRST204. */
export interface CargoPermissaoRow {
  cargo_id: string;
  recurso_id: string;
  tem_acesso: true;
  pode_editar: boolean;
}

/** Converte as permissões seleccionadas no editor nas linhas a inserir:
 *  só as com acesso; nega-se por omissão (sem linha = sem acesso). */
export function buildCargoPermissoesRows(
  selecionadas: Permission[],
  cargoId: string
): CargoPermissaoRow[] {
  return selecionadas
    .filter((p) => p.tem_acesso)
    .map((p) => ({
      cargo_id: cargoId,
      recurso_id: p.recurso_id,
      tem_acesso: true,
      pode_editar: p.pode_editar,
    }));
}
