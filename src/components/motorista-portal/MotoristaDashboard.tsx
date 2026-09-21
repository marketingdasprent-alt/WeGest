import { AlertTriangle } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useMotoristaAtivo } from '@/hooks/useMotoristaAtivo';
import { useMotoristaTab } from '@/hooks/useMotoristaTab';
import { InicioTab } from './tabs/InicioTab';
import { ViaturaTab } from './tabs/ViaturaTab';
import { ContasTab } from './tabs/ContasTab';
import { DocumentosTab } from './tabs/DocumentosTab';

/**
 * O painel do motorista: lê a ficha dele e mostra a secção pedida no URL.
 *
 * Só compõe. Cada secção traz os seus hooks; a lista de secções e a leitura
 * do `?tab=` estão em `motoristaNav.ts` / `useMotoristaTab`. Antes isto eram
 * 800 linhas com nove cartões numa coluna e dois diálogos inline.
 */
export function MotoristaDashboard() {
  const { user, signOut } = useAuth();
  const { data: motorista, isLoading, error } = useMotoristaAtivo(user?.id);
  const { tab } = useMotoristaTab();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (error || !motorista || !user) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-destructive" aria-hidden="true" />
            <h2 className="mb-1 text-lg font-semibold">
              {error ? 'Não foi possível carregar a sua ficha' : 'Ficha não encontrada'}
            </h2>
            <p className="mb-5 text-sm text-muted-foreground">
              {error
                ? 'Tente daqui a pouco. Se continuar, fale com o seu gestor.'
                : 'Não encontrámos uma ficha de motorista ligada a esta conta.'}
            </p>
            <Button onClick={() => signOut()}>Sair</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Motorista que NÃO usa recibos verdes (recibo_verde=false): esconde tudo o
  // que lhes diz respeito. null/true = usa (comportamento normal).
  const usaRecibos = motorista.recibo_verde !== false;

  switch (tab) {
    case 'viatura':
      return <ViaturaTab motoristaId={motorista.id} />;
    case 'contas':
      return <ContasTab motoristaId={motorista.id} />;
    case 'documentos':
      return (
        <DocumentosTab
          motoristaId={motorista.id}
          userId={user.id}
          dataContratacao={motorista.data_contratacao}
          usaRecibos={usaRecibos}
        />
      );
    default:
      return <InicioTab motorista={motorista} usaRecibos={usaRecibos} />;
  }
}
