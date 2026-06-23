import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  catalogoCompleto,
  resolverCampos,
  type CampoCatalogoCustom,
  type CampoEfetivo,
  type CampoOverride,
} from '@/lib/camposDinamicos';

const QUERY_KEY = ['org_campos_dinamicos'] as const;
const CATALOGO_KEY = ['campos_catalogo'] as const;

/** Campos custom do catálogo (criados pelo provider). Fail-open se a tabela
 *  ainda não existir. Leitura é global (todas as orgs veem). */
function useCamposCatalogoCustom() {
  return useQuery<CampoCatalogoCustom[]>({
    queryKey: CATALOGO_KEY,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('campos_catalogo')
        .select('id, chave, label, categoria, fonte')
        .order('created_at', { ascending: true });
      if (error) {
        if ((error as { code?: string }).code === '42P01') return [];
        throw error;
      }
      return (data ?? []) as CampoCatalogoCustom[];
    },
  });
}

type Result = {
  campos: CampoEfetivo[];
  tabelaAusente: boolean;
};

/**
 * Paleta efectiva = catálogo (código + custom do provider) fundido com os
 * overrides da org. Fail-open com defaults se as tabelas não existirem.
 */
export function useCamposDinamicos() {
  const { data: custom = [] } = useCamposCatalogoCustom();

  const query = useQuery<Result>({
    queryKey: [...QUERY_KEY, custom.map((c) => c.chave).join(',')],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const catalogo = catalogoCompleto(custom);
      const { data, error } = await (supabase as any)
        .from('org_campos_dinamicos')
        .select('chave, label, ordem, ativo');

      if (error) {
        if ((error as { code?: string }).code === '42P01') {
          return { campos: resolverCampos([], catalogo), tabelaAusente: true };
        }
        throw error;
      }

      const overrides = (data ?? []) as CampoOverride[];
      return { campos: resolverCampos(overrides, catalogo), tabelaAusente: false };
    },
  });

  return {
    ...query,
    campos: query.data?.campos ?? resolverCampos([], catalogoCompleto(custom)),
    tabelaAusente: query.data?.tabelaAusente ?? false,
  };
}

/**
 * Guarda a config da org (visibilidade/ordem/rótulo). Substitui o conjunto:
 * apaga overrides actuais (RLS limita à org) e insere os novos.
 */
export function useSaveCamposDinamicos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (campos: CampoEfetivo[]) => {
      const { error: delErr } = await (supabase as any)
        .from('org_campos_dinamicos')
        .delete()
        .not('chave', 'is', null);
      if (delErr) throw delErr;

      const rows = campos.map((c, idx) => ({
        chave: c.chave,
        label: c.label?.trim() ? c.label.trim() : null,
        ordem: Number.isFinite(c.ordem) ? c.ordem : idx,
        ativo: c.ativo,
      }));
      const { error: insErr } = await (supabase as any).from('org_campos_dinamicos').insert(rows);
      if (insErr) throw insErr;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

// ── Gestão do catálogo (só provider / Década Ousada) ────────────────────────

export function useCamposCatalogo() {
  return useCamposCatalogoCustom();
}

export function useCriarCampoCatalogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (campo: Omit<CampoCatalogoCustom, 'id'>) => {
      const { error } = await (supabase as any).from('campos_catalogo').insert({
        chave: campo.chave,
        label: campo.label,
        categoria: campo.categoria,
        fonte: campo.fonte,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CATALOGO_KEY });
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useApagarCampoCatalogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('campos_catalogo').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CATALOGO_KEY });
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
