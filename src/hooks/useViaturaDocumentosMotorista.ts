import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type TipoDocViatura = 'dua' | 'ipo' | 'carta_verde';

export interface DocViatura {
  tipo: TipoDocViatura;
  /** Caminho no bucket `viatura-documentos`. */
  url: string;
  validade: string | null;
}

export type DocumentosViatura = Record<TipoDocViatura, DocViatura | null>;

/**
 * Os três documentos da viatura que o motorista pode precisar de mostrar
 * numa operação STOP: DUA, IPO e Carta Verde.
 *
 * DUA: o upload actual grava 'dua_frente' / 'dua_verso'; 'dua' sozinho é o
 * valor legado de antes da separação frente/verso — mantido para viaturas
 * com documentos antigos. Mostra-se a frente; sem frente, o que houver.
 */
export function useViaturaDocumentosMotorista(viaturaId: string | null | undefined) {
  return useQuery({
    queryKey: ['viatura-documentos-motorista', viaturaId],
    enabled: !!viaturaId,
    queryFn: async (): Promise<DocumentosViatura> => {
      const { data, error } = await supabase
        .from('viatura_documentos')
        .select('tipo_documento, ficheiro_url, data_validade')
        .eq('viatura_id', viaturaId!)
        .in('tipo_documento', ['dua_frente', 'dua_verso', 'dua', 'ipo', 'carta_verde']);
      if (error) throw error;

      const linhas = data ?? [];
      const primeiro = (...tipos: string[]) => {
        for (const t of tipos) {
          const d = linhas.find((l) => l.tipo_documento === t);
          if (d) return d;
        }
        return undefined;
      };
      const doc = (
        tipo: TipoDocViatura,
        d: { ficheiro_url: string; data_validade: string | null } | undefined
      ): DocViatura | null => (d ? { tipo, url: d.ficheiro_url, validade: d.data_validade } : null);

      return {
        dua: doc('dua', primeiro('dua_frente', 'dua', 'dua_verso')),
        ipo: doc('ipo', primeiro('ipo')),
        carta_verde: doc('carta_verde', primeiro('carta_verde')),
      };
    },
  });
}
