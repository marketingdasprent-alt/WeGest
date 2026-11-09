import { UserX } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface FichaInativaAvisoProps {
  onSair: () => void;
}

/** Ficha inativa: a app não mostra saldo, resumos nem histórico dessa empresa. */
export function FichaInativaAviso({ onSair }: FichaInativaAvisoProps) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 text-center">
          <UserX className="mx-auto mb-3 h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <h2 className="mb-1 text-lg font-semibold">Ficha inativa</h2>
          <p className="mb-5 text-sm text-muted-foreground">
            A sua ficha de motorista nesta empresa não está ativa. Se continua a trabalhar connosco,
            fale com o seu gestor.
          </p>
          <Button onClick={onSair}>Sair</Button>
        </CardContent>
      </Card>
    </div>
  );
}
