// supabase/functions/_shared/register-org/buildCargoPermissoes.ts
//
// Extraído do register-org/index.ts (2026-07-22) para ser testável sem
// mockar o cliente Supabase. Guarda a regressão de 14–20/07: cargo_permissoes
// passou a exigir org_id NOT NULL (20260714150000) e esta função é o único
// sítio que constrói as linhas atribuídas ao cargo admin ao criar uma org.

export interface RecursoLike {
  id: string;
}

export interface CargoPermissaoRow {
  cargo_id: string;
  recurso_id: string;
  org_id: string;
  tem_acesso: boolean;
  pode_editar: boolean;
}

/** Constrói as linhas de cargo_permissoes que dão ao cargo admin acesso total
 * a todos os recursos, ao criar uma organização nova. */
export function buildCargoPermissoes(
  cargoId: string,
  orgId: string,
  recursos: RecursoLike[]
): CargoPermissaoRow[] {
  return recursos.map((r) => ({
    cargo_id: cargoId,
    recurso_id: r.id,
    org_id: orgId,
    tem_acesso: true,
    pode_editar: true,
  }));
}
