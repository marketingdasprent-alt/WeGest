import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { mensagemDeErroDaFuncao } from '@/lib/erroFuncaoEdge';

const createInputSchema = z.object({
  nome: z.string().trim().min(1),
  email: z.string().trim().email(),
  password: z.string().min(6).max(72),
  cargo_id: z.string().uuid().nullable(),
  org_id: z.string().uuid(),
});
const createResultSchema = z.discriminatedUnion('status', [
  z.object({ success: z.literal(true), status: z.literal('created') }),
  z.object({
    success: z.literal(true),
    status: z.literal('invited'),
    invite: z.object({ token: z.string(), expires_at: z.string() }),
  }),
]);

export function useCreateAdminAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: z.infer<typeof createInputSchema>) => {
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: createInputSchema.parse(input),
      });
      if (error) throw error;
      return createResultSchema.parse(data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['utilizadores'] });
      void queryClient.invalidateQueries({ queryKey: ['convites'] });
    },
  });
}

export function useRequestAccountRecovery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { readonly userId: string; readonly org_id: string }) => {
      const { data, error } = await supabase.functions.invoke('reset-user-password', {
        body: { userId: input.userId, org_id: input.org_id },
      });
      if (error) {
        throw new Error(
          await mensagemDeErroDaFuncao(error, 'Não foi possível enviar a recuperação.')
        );
      }
      z.object({ success: z.literal(true) }).parse(data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['utilizadores'] });
    },
  });
}
