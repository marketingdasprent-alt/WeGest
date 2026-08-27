import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

/**
 * Leitura de `formularios`.
 *
 * Extraído de EditLeadDialog e RentCarLanding, que faziam `supabase.from()`
 * directo dentro de `useEffect` + `useState` — o anti-pattern que o AGENTS.md
 * §5 e §12 proíbem, e que a regra `no-restricted-syntax` sinaliza.
 *
 * Ambos engoliam o erro num `console.error` e seguiam com o estado vazio: um
 * select de formulários vazio era indistinguível de "a leitura falhou". Aqui o
 * erro propaga-se e cada ecrã decide o que mostrar.
 */

/** Só o que o dropdown de escolha precisa. */
export type FormularioOpcao = Pick<Tables<'formularios'>, 'id' | 'nome' | 'ativo'>;

/** Formulários activos, por ordem alfabética — para dropdowns de escolha. */
export function useFormulariosAtivos() {
  return useQuery({
    queryKey: ['formularios', { ativos: true }],
    queryFn: async (): Promise<FormularioOpcao[]> => {
      const { data, error } = await supabase
        .from('formularios')
        .select('id, nome, ativo')
        .eq('ativo', true)
        .order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Um formulário activo pelo nome exacto — é assim que a landing pública
 * encontra o seu (o nome está fixo no componente, não há id à mão).
 *
 * Sem nome não corre: evita uma query inútil enquanto o valor não existe.
 */
export function useFormularioPorNome(nome: string) {
  return useQuery({
    queryKey: ['formularios', { nome }],
    queryFn: async (): Promise<Tables<'formularios'> | null> => {
      const { data, error } = await supabase
        .from('formularios')
        .select('*')
        .eq('nome', nome)
        .eq('ativo', true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!nome,
  });
}
