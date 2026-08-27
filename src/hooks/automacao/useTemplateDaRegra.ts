import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * O corpo da mensagem de email de uma regra.
 *
 * Não vive na regra: vive em `notification_templates`, indexado por `codigo`
 * dentro da organização. Isso significa que o corpo é PARTILHADO por todas as
 * regras que usem o mesmo `template_codigo` — daí `regrasQueUsam`, para o
 * editor poder dizer quantas vai afectar antes de gravar.
 *
 * Só afecta EMAIL. O motor escreve `mensagem = null` na notificação dentro da
 * aplicação, portanto o corpo não aparece lá.
 */
export interface TemplateDaRegra {
  assunto: string;
  corpo: string;
  /** Quantas regras da organização usam este mesmo código. */
  regrasQueUsam: number;
}

export function useTemplateDaRegra(codigo: string | null) {
  return useQuery({
    queryKey: ['notification-template', codigo],
    queryFn: async (): Promise<TemplateDaRegra | null> => {
      const { data, error } = await supabase
        .from('notification_templates')
        .select('assunto, corpo_template')
        .eq('codigo', codigo as string)
        .eq('canal', 'email')
        .eq('ativo', true)
        // A tabela é versionada; o motor lê sempre a versão mais alta.
        .order('versao', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      const { count, error: erroContagem } = await supabase
        .from('automation_rules')
        .select('id', { count: 'exact', head: true })
        .eq('acao_config->>template_codigo', codigo as string);
      if (erroContagem) throw erroContagem;

      return {
        assunto: data.assunto ?? '',
        corpo: data.corpo_template ?? '',
        regrasQueUsam: count ?? 0,
      };
    },
    enabled: !!codigo,
  });
}

export function useGuardarTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      codigo,
      assunto,
      corpo,
    }: {
      codigo: string;
      assunto: string;
      corpo: string;
    }) => {
      const { error } = await supabase
        .from('notification_templates')
        .update({ assunto, corpo_template: corpo })
        .eq('codigo', codigo)
        .eq('canal', 'email')
        .eq('ativo', true);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ['notification-template', v.codigo] });
    },
  });
}
