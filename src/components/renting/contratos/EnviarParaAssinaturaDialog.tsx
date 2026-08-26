import { useMemo, useState } from 'react';
import { Loader2, PenLine } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { agruparPorPessoa, type Signatario } from '@/lib/assinaturas';

const ROTULO_PAPEL: Record<Signatario['papel'], string> = {
  cliente: 'cliente',
  condutor: 'condutor',
  motorista: 'motorista',
};

export interface EnviarParaAssinaturaDialogProps {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  /** Cliente do contrato, condutores associados e motorista, com o email da ficha. */
  candidatos: Signatario[];
  onEnviar: (escolhidos: Signatario[]) => Promise<void>;
}

function chaveDe(s: Signatario, indice: number): string {
  return `${s.papel}:${s.clienteId ?? s.motoristaId ?? s.email ?? indice}`;
}

/**
 * Escolher quem assina um documento.
 *
 * Quem não tem email fica desligado e nomeado: saltá-lo em silêncio deixaria
 * quem envia convencido de que toda a gente recebeu, e a assinatura em falta só
 * apareceria semanas depois.
 */
export function EnviarParaAssinaturaDialog({
  open,
  onOpenChange,
  candidatos,
  onEnviar,
}: EnviarParaAssinaturaDialogProps) {
  const [escolhidas, setEscolhidas] = useState<Set<string>>(new Set());
  const [aEnviar, setAEnviar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const escolhidos = useMemo(
    () => candidatos.filter((s, i) => escolhidas.has(chaveDe(s, i))),
    [candidatos, escolhidas]
  );

  const repetidos = useMemo(() => agruparPorPessoa(escolhidos), [escolhidos]);

  const alternar = (chave: string) => {
    setEscolhidas((anterior) => {
      const seguinte = new Set(anterior);
      if (seguinte.has(chave)) seguinte.delete(chave);
      else seguinte.add(chave);
      return seguinte;
    });
  };

  const enviar = async () => {
    setAEnviar(true);
    setErro(null);
    try {
      await onEnviar(escolhidos);
      onOpenChange(false);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro inesperado');
    } finally {
      setAEnviar(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenLine className="h-5 w-5" />
            Enviar para assinatura
          </DialogTitle>
          <DialogDescription>
            Cada pessoa recebe o documento por email e um link próprio onde assina.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {candidatos.map((s, i) => {
            const chave = chaveDe(s, i);
            const semEmail = !s.email || s.email.trim() === '';

            return (
              <label
                key={chave}
                htmlFor={chave}
                className="flex items-start gap-3 rounded-md border p-3 text-sm"
              >
                <Checkbox
                  id={chave}
                  disabled={semEmail || aEnviar}
                  checked={escolhidas.has(chave)}
                  onCheckedChange={() => alternar(chave)}
                  aria-label={`${s.nome} (${ROTULO_PAPEL[s.papel]})`}
                />
                <span className="min-w-0">
                  <span className="font-medium">{s.nome}</span>{' '}
                  <span className="text-muted-foreground">({ROTULO_PAPEL[s.papel]})</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {semEmail ? 'Sem email na ficha — não é possível enviar' : s.email}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        {repetidos.length > 0 && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            {repetidos.join(', ')} vai receber dois pedidos, um por cada papel. Se não for isso que
            quer, desmarque um deles.
          </p>
        )}

        {erro && <p className="text-sm text-destructive">{erro}</p>}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={aEnviar}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={escolhidos.length === 0 || aEnviar}>
            {aEnviar && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enviar para assinatura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
