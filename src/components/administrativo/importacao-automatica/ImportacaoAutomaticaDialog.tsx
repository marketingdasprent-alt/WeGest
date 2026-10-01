import { useMemo } from 'react';
import { Loader2, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useContasImportacao, useExecutarImportacao } from '@/hooks/useImportacaoAutomatica';
import { useLoteImportacao } from '@/hooks/useLoteImportacao';
import { semanasRecentes } from '@/utils/importacaoAutomatica';
import { ContasEmFaltaAviso } from './ContasEmFaltaAviso';
import { LinhaFicheiroImportacao } from './LinhaFicheiroImportacao';
import { ZonaFicheiros } from './ZonaFicheiros';

interface ImportacaoAutomaticaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: () => void;
}

/**
 * Larga todos os ficheiros da semana de uma vez. O sistema descobre a
 * plataforma, a conta e a semana de cada um; a pessoa só confirma.
 */
export function ImportacaoAutomaticaDialog({
  open,
  onOpenChange,
  onImportComplete,
}: ImportacaoAutomaticaDialogProps) {
  const { data: contas = [], isLoading: aCarregarContas } = useContasImportacao(open);
  const lote = useLoteImportacao(contas);
  const executar = useExecutarImportacao();
  const semanas = useMemo(() => semanasRecentes(new Date(), 8), []);
  const resultados = new Map((executar.data ?? []).map((r) => [r.chave, r]));
  const terminado = executar.isSuccess;

  const fechar = (aberto: boolean) => {
    if (executar.isPending) return;
    if (!aberto) {
      if (terminado) onImportComplete?.();
      lote.limpar();
      executar.reset();
    }
    onOpenChange(aberto);
  };

  return (
    <Dialog open={open} onOpenChange={fechar}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
            Importação automática
          </DialogTitle>
          <DialogDescription>
            Voltar a importar a mesma semana de uma conta substitui os dados dela, nunca soma.
          </DialogDescription>
        </DialogHeader>

        {!terminado && (
          <ZonaFicheiros
            onFicheiros={lote.adicionar}
            desactivada={aCarregarContas || lote.analisando || executar.isPending}
          />
        )}
        {lote.analisando && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />A analisar os ficheiros…
          </p>
        )}
        {lote.erroAnalise && (
          <p className="text-sm text-destructive">
            Não foi possível analisar: {lote.erroAnalise.message}
          </p>
        )}

        <ContasEmFaltaAviso faltas={lote.faltas} />

        <div className="space-y-2">
          {lote.linhas.map((l) => (
            <LinhaFicheiroImportacao
              key={l.chave}
              {...l}
              contas={contas.filter((c) => c.plataforma === l.plataforma)}
              semanas={semanas}
              resultado={resultados.get(l.chave)}
              bloqueada={executar.isPending || terminado}
              onContaChange={(contaId) => lote.escolher(l.chave, { contaId })}
              onPeriodoChange={(periodo) => lote.escolher(l.chave, { periodo })}
              onRetirar={() => lote.retirar(l.chave)}
            />
          ))}
        </div>

        <DialogFooter>
          {terminado ? (
            <Button onClick={() => fechar(false)}>Concluir</Button>
          ) : (
            <Button
              disabled={!lote.pronto || executar.isPending}
              onClick={() => executar.mutate(lote.pedidos())}
            >
              {executar.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              Importar {lote.linhas.length} {lote.linhas.length === 1 ? 'ficheiro' : 'ficheiros'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
