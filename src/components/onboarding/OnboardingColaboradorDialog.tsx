import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissionsContext } from '@/contexts/PermissionsContext';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { markOnboardingSeen, shouldShowOnboarding } from '@/lib/onboarding';

const CONTACTO_SUPORTE = 'o Thiago ou o João';

export function OnboardingColaboradorDialog() {
  const { user } = useAuth();
  const { tipoUtilizador, initialized, loading } = usePermissionsContext();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (shouldShowOnboarding({ userId: user?.id, tipoUtilizador, initialized, loading })) {
      setOpen(true);
    }
  }, [user?.id, tipoUtilizador, initialized, loading]);

  const handleOpenChange = (next: boolean) => {
    // Fechar por qualquer via (botão, X, Esc) marca como visto — não chateia outra vez.
    if (!next && user?.id) {
      markOnboardingSeen(user.id);
    }
    setOpen(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bem-vindo ao novo WeGest 👋</DialogTitle>
          <DialogDescription>
            Atualizámos o sistema. Antes de começares, dá uma vista de olhos:
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div>
            <p className="font-semibold">Novo fluxo de trabalho</p>
            <p className="text-muted-foreground">
              Ao criar um contrato, o sistema trata automaticamente da reserva, do estado da viatura
              e dos eventos. Já não precisas de fazer estes passos à mão.
            </p>
          </div>
          <div>
            <p className="font-semibold">Calendário atualizado</p>
            <p className="text-muted-foreground">
              O calendário passou a ser automático: os eventos são gerados pelo sistema a partir dos
              contratos e movimentos. Deixou de ser preenchido manualmente.
            </p>
          </div>
          <div>
            <p className="font-semibold">Encontraste algum erro?</p>
            <p className="text-muted-foreground">Não hesites em falar com {CONTACTO_SUPORTE}.</p>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => handleOpenChange(false)}>Entendido, começar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
