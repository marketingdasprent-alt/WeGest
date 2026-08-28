import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { LinhaHistorico } from './historico';

/**
 * O erro completo de uma falha.
 *
 * A célula da tabela corta o texto, e as mensagens do Postgres passam
 * facilmente os 200 caracteres — sem isto, a parte que diz o que correu mal
 * ficava fora do ecrã.
 */
export function DetalheFalhaSheet({
  linha,
  onOpenChange,
}: {
  linha: LinhaHistorico | null;
  onOpenChange: (aberto: boolean) => void;
}) {
  return (
    <Sheet open={!!linha} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Detalhes da falha</SheetTitle>
          <SheetDescription>
            Registo completo do job que esgotou as tentativas automáticas.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-2 text-sm">
          <p>
            <strong>Origem:</strong> {linha?.origem}
          </p>
          <p>
            <strong>Tipo:</strong> {linha?.titulo}
          </p>
          <p>
            <strong>Tentativas:</strong> {linha?.tentativas ?? '—'}
          </p>
          <p className="whitespace-pre-wrap">
            <strong>Erro:</strong> {linha?.detalhe ?? '—'}
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
