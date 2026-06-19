import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useOrgDefinicoes, useUpdateOrgDefinicoes } from '@/hooks/useOrgDefinicoes';

/**
 * Definições de privacidade da organização.
 * Privacidade por gestor: quando ligada, cada gestor só vê os contratos e
 * reservas de que é responsável; admins e quem tiver a permissão
 * "renting_ver_todos" continuam a ver tudo. O calendário não é afectado.
 */
export const PrivacidadeTab: React.FC = () => {
  const { data: definicoes, isLoading } = useOrgDefinicoes();
  const updateMutation = useUpdateOrgDefinicoes();

  const ativo = definicoes?.privacidade_por_gestor ?? false;

  const handleToggle = (next: boolean) => {
    updateMutation.mutate(
      { privacidade_por_gestor: next },
      {
        onSuccess: () =>
          toast.success(
            next ? 'Privacidade por gestor ativada.' : 'Privacidade por gestor desativada.'
          ),
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Erro ao guardar.'),
      }
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Privacidade
        </CardTitle>
        <CardDescription>
          Controla a visibilidade de contratos e reservas entre colaboradores.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="max-w-xl space-y-4">
            <div className="flex items-start gap-3 rounded-lg border p-4">
              <Switch
                id="privacidade-gestor"
                checked={ativo}
                onCheckedChange={handleToggle}
                disabled={updateMutation.isPending}
                className="mt-0.5"
              />
              <div className="space-y-1">
                <Label htmlFor="privacidade-gestor" className="cursor-pointer font-medium">
                  Privacidade por gestor
                </Label>
                <p className="text-sm text-muted-foreground">
                  Com esta opção ligada, cada gestor vê apenas os contratos e reservas de que é
                  responsável. Os superiores — administradores e quem tiver a permissão{' '}
                  <span className="font-medium">Ver todos os contratos e reservas</span> — continuam
                  a ver tudo. O calendário permanece partilhado por toda a equipa.
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
