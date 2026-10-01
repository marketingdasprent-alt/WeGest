import { useCallback, useMemo } from 'react';
import { useTenant } from '@/contexts/TenantContext';
import { useToast } from '@/hooks/use-toast';

/**
 * Link de registo de motorista da organização ativa.
 *
 * O motorista abre o link, preenche a ficha e fica associado à org pelo
 * `codigo`. Usado na aba Convites (Administração) e no botão "Adicionar
 * Motorista" da página de Motoristas — daí viver num hook e não num componente.
 */
export const useMotoristaInviteLink = () => {
  const { toast } = useToast();
  const { orgId, orgs } = useTenant();

  const codigo = orgs.find((o) => o.id === orgId)?.codigo ?? null;
  const link = useMemo(
    () => (codigo ? `${window.location.origin}/motorista/registo?org=${codigo}` : null),
    [codigo]
  );

  const copiar = useCallback(async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: 'Copiado!', description: 'Link de registo de motorista copiado.' });
    } catch {
      toast({ title: 'Erro', description: 'Erro ao copiar link', variant: 'destructive' });
    }
  }, [link, toast]);

  return { link, codigo, copiar };
};
