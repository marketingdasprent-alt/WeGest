import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Danos que a viatura já trazia de CONTRATOS ANTERIORES ao que se está a
 * fechar. Alimenta o DanosExistentesPanel — ver lá o porquê de não trazer o
 * valor: são danos de outra pessoa e não se cobram a este motorista.
 */

export interface DanoExistenteFoto {
  id: string;
  url: string;
  nome: string;
  descricao: string | null;
}

export interface DanoExistente {
  id: string;
  descricao: string;
  localizacao: string | null;
  estado: string | null;
  data_registo: string | null;
  observacoes: string | null;
  fotos: DanoExistenteFoto[];
}

/** `ficheiro_url` é um caminho no bucket nuns sítios e um URL completo noutros
 *  (o separador Danos da viatura grava já o público). Aceita os dois. */
function urlDaFoto(ficheiroUrl: string): string {
  if (/^https?:\/\//i.test(ficheiroUrl)) return ficheiroUrl;
  return supabase.storage.from('viatura-danos').getPublicUrl(ficheiroUrl).data.publicUrl;
}

export function useDanosExistentes(
  viaturaId: string | null | undefined,
  /** Contrato em curso, quando se sabe. Os danos que ELE registou não são "já
   *  existentes". Nos ecrãs do calendário ainda não há nada gravado deste
   *  contrato quando o ecrã abre, por isso é opcional. */
  contratoId?: string | null
) {
  return useQuery({
    queryKey: ['danos-existentes-fecho', viaturaId, contratoId],
    enabled: !!viaturaId,
    queryFn: async (): Promise<DanoExistente[]> => {
      // 'reparado' fora: já não está na viatura, não há nada a discutir. Os
      // restantes estados entram todos — o que interessa é o dano estar lá,
      // não a etiqueta que tem (e há duas convenções em uso, 'existente' e
      // 'pendente').
      const { data, error } = await supabase
        .from('viatura_danos')
        .select(
          'id, descricao, localizacao, estado, data_registo, observacoes, contrato_renting_id, contrato_id_origem'
        )
        .eq('viatura_id', viaturaId!)
        .neq('estado', 'reparado')
        .order('data_registo', { ascending: false });
      if (error) throw error;

      // De contratos ANTERIORES: tira os que este mesmo contrato registou
      // (incluindo os que se acabaram de gravar, se o diálogo reabrir).
      const anteriores = contratoId
        ? (data ?? []).filter(
            (d) => d.contrato_renting_id !== contratoId && d.contrato_id_origem !== contratoId
          )
        : (data ?? []);
      if (anteriores.length === 0) return [];

      const { data: fotos } = await supabase
        .from('viatura_dano_fotos')
        .select('id, dano_id, ficheiro_url, nome_ficheiro, descricao')
        .in(
          'dano_id',
          anteriores.map((d) => d.id)
        );

      const porDano = new Map<string, DanoExistenteFoto[]>();
      (fotos ?? []).forEach((f) => {
        if (!f.dano_id || !f.ficheiro_url) return;
        const lista = porDano.get(f.dano_id) ?? [];
        lista.push({
          id: f.id,
          url: urlDaFoto(f.ficheiro_url),
          nome: f.nome_ficheiro ?? '',
          descricao: f.descricao ?? null,
        });
        porDano.set(f.dano_id, lista);
      });

      return anteriores.map((d) => ({
        id: d.id,
        descricao: d.descricao,
        localizacao: d.localizacao,
        estado: d.estado,
        data_registo: d.data_registo,
        observacoes: d.observacoes,
        fotos: porDano.get(d.id) ?? [],
      }));
    },
  });
}
