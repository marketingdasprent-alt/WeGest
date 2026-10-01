import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Fuel } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { AbastecimentoSuspeito } from '@/utils/abastecimentosSuspeitos';

interface AbastecimentosSuspeitosAvisoProps {
  suspeitos: readonly AbastecimentoSuspeito[];
  nomes: Record<string, string>;
}

const eur = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });

/**
 * Antes de fechar a semana: abastecimentos imputados a quem não tinha o carro.
 * Um dos registos (cartão ou associação do carro) está errado. Sem casos, não aparece.
 */
export function AbastecimentosSuspeitosAviso({
  suspeitos,
  nomes,
}: AbastecimentosSuspeitosAvisoProps) {
  const [aberto, setAberto] = useState(false);
  if (suspeitos.length === 0) return null;
  const total = suspeitos.reduce((s, x) => s + x.valor, 0);
  const nome = (id: string) => nomes[id] || 'Motorista sem nome';

  return (
    <div
      role="status"
      className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <Fuel className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          <span>
            <strong>
              {suspeitos.length} {suspeitos.length === 1 ? 'abastecimento' : 'abastecimentos'} (
              {eur.format(total)})
            </strong>{' '}
            desta semana {suspeitos.length === 1 ? 'foi imputado' : 'foram imputados'} a quem não
            tinha o carro abastecido. Confirmar antes de fechar.
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
          {aberto ? 'Esconder' : 'Ver quais'}
        </Button>
      </div>
      {aberto && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1 pr-3 font-medium">Dia</th>
                <th className="py-1 pr-3 font-medium">Valor</th>
                <th className="py-1 pr-3 font-medium">Carro abastecido</th>
                <th className="py-1 pr-3 font-medium">Imputado a</th>
                <th className="py-1 font-medium">O carro estava com</th>
              </tr>
            </thead>
            <tbody>
              {suspeitos.map((s) => (
                <tr key={s.id} className="border-t border-amber-500/20">
                  <td className="py-1 pr-3 tabular-nums">
                    {format(parseISO(s.data.slice(0, 10)), 'dd/MM')} {s.data.slice(11, 16)}
                  </td>
                  <td className="py-1 pr-3 tabular-nums">{eur.format(s.valor)}</td>
                  <td className="py-1 pr-3 font-mono">{s.matricula}</td>
                  <td className="py-1 pr-3">{nome(s.imputadoId)}</td>
                  <td className="py-1">{s.titularesIds.map(nome).join(' / ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">
            Corrigir em Administrativo → Cartões (histórico do cartão) ou na associação do carro, e
            voltar a carregar a semana.
          </p>
        </div>
      )}
    </div>
  );
}
