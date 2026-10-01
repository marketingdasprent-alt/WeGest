import { useState } from 'react';
import { CircleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ROTULO_FONTE, type GrupoSemDono } from '@/utils/combustivelSemDono';

interface CombustivelSemDonoAvisoProps {
  grupos: readonly GrupoSemDono[];
}

const eur = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });

/**
 * Antes de fechar a semana: combustível gravado sem motorista nem cliente.
 * Fechar assim deixa-o por cobrar. Sem casos, não aparece.
 */
export function CombustivelSemDonoAviso({ grupos }: CombustivelSemDonoAvisoProps) {
  const [aberto, setAberto] = useState(false);
  if (grupos.length === 0) return null;
  const total = grupos.reduce((s, g) => s + g.valor, 0);
  const n = grupos.reduce((s, g) => s + g.transacoes, 0);

  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <CircleAlert className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          <span>
            <strong>
              {n} {n === 1 ? 'abastecimento' : 'abastecimentos'} ({eur.format(total)})
            </strong>{' '}
            desta semana {n === 1 ? 'está' : 'estão'} sem motorista nem cliente. Fechar assim{' '}
            {n === 1 ? 'deixa-o' : 'deixa-os'} por cobrar.
          </span>
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7"
          aria-expanded={aberto}
          onClick={() => setAberto((v) => !v)}
        >
          {aberto ? 'Esconder' : 'Ver cartões'}
        </Button>
      </div>
      {aberto && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1 pr-3 font-medium">Fonte</th>
                <th className="py-1 pr-3 font-medium">Cartão</th>
                <th className="py-1 pr-3 font-medium">Abastecimentos</th>
                <th className="py-1 font-medium">Valor</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => (
                <tr key={`${g.fonte}-${g.cartao}`} className="border-t border-destructive/20">
                  <td className="py-1 pr-3">{ROTULO_FONTE[g.fonte]}</td>
                  <td className="py-1 pr-3 font-mono">{g.cartao}</td>
                  <td className="py-1 pr-3 tabular-nums">{g.transacoes}</td>
                  <td className="py-1 tabular-nums">{eur.format(g.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">
            Registar o titular de cada cartão em Administrativo → Cartões Frota: os abastecimentos
            passam para ele sozinhos. Depois, voltar a carregar a semana.
          </p>
        </div>
      )}
    </div>
  );
}
