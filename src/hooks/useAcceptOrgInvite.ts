import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useAcceptOrgInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (token: string) => {
      const { data, error } = await supabase.rpc('marcar_convite_usado', { p_token: token });
      if (error) throw error;
      if (!data)
        throw new Error(
          'Convite inválido, expirado ou destinado a outra conta. Confirme também o seu email.'
        );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });
}

export function useSignInForInvite() {
  return useMutation({
    mutationFn: async (input: { readonly email: string; readonly password: string }) => {
      const { error } = await supabase.auth.signInWithPassword(input);
      if (error) throw error;
    },
  });
}
