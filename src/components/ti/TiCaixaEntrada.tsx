import { useMemo, useState } from 'react';
import { Inbox, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { contarPorSeparador, filtrarTickets, type SeparadorCaixa } from '@/lib/tiTicketChat';
import type { TiTicket } from '@/hooks/useTiTickets';
import { TiTicketItem } from './TiTicketItem';

const TODAS = '__todas__';

const SEPARADORES: { valor: SeparadorCaixa; rotulo: string; soGestao?: boolean }[] = [
  { valor: 'por_responder', rotulo: 'Por responder', soGestao: true },
  { valor: 'abertos', rotulo: 'Abertos' },
  { valor: 'resolvidos', rotulo: 'Resolvidos' },
  { valor: 'todos', rotulo: 'Todos' },
];

interface TiCaixaEntradaProps {
  tickets: TiTicket[];
  isLoading: boolean;
  error: unknown;
  selecionadoId: string | null;
  onSelecionar: (id: string) => void;
  /** Quem gere: separador "Por responder" e destaque dos pedidos à espera. */
  gestao: boolean;
}

export function TiCaixaEntrada({
  tickets,
  isLoading,
  error,
  selecionadoId,
  onSelecionar,
  gestao,
}: TiCaixaEntradaProps) {
  const [separador, setSeparador] = useState<SeparadorCaixa>(gestao ? 'por_responder' : 'abertos');
  const [empresa, setEmpresa] = useState(TODAS);
  const [pesquisa, setPesquisa] = useState('');

  // O filtro de empresa sai da própria lista: aparece só com as empresas que a
  // RLS deixou ver, e só quando há mais do que uma.
  const empresas = useMemo(
    () =>
      Array.from(
        new Set(tickets.map((t) => t.organizacao?.nome).filter(Boolean) as string[])
      ).sort(),
    [tickets]
  );
  const contagens = useMemo(() => contarPorSeparador(tickets), [tickets]);
  const visiveis = useMemo(
    () =>
      filtrarTickets(tickets, {
        separador,
        empresa: empresa === TODAS ? null : empresa,
        pesquisa,
      }),
    [tickets, separador, empresa, pesquisa]
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2.5 border-b border-border p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={pesquisa}
            onChange={(e) => setPesquisa(e.target.value)}
            placeholder="Pesquisar por número, nome ou texto"
            className="h-9 bg-background pl-8"
            aria-label="Pesquisar pedidos"
          />
        </div>
        {empresas.length > 1 && (
          <Select value={empresa} onValueChange={setEmpresa}>
            <SelectTrigger className="h-9 bg-background" aria-label="Empresa">
              <SelectValue placeholder="Todas as empresas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODAS}>Todas as empresas</SelectItem>
              {empresas.map((nome) => (
                <SelectItem key={nome} value={nome}>
                  {nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex flex-wrap gap-1" role="tablist">
          {SEPARADORES.filter((s) => gestao || !s.soGestao).map((s) => (
            <button
              key={s.valor}
              type="button"
              role="tab"
              aria-selected={separador === s.valor}
              onClick={() => setSeparador(s.valor)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors',
                separador === s.valor
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {s.rotulo}
              <span className="tabular-nums opacity-70">{contagens[s.valor]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-2 p-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : error ? (
          <p className="p-4 text-sm text-destructive">Não foi possível carregar os pedidos.</p>
        ) : visiveis.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center text-sm text-muted-foreground">
            <Inbox className="h-8 w-8 opacity-40" />
            {tickets.length === 0
              ? 'Ainda não há pedidos.'
              : pesquisa.trim()
                ? 'Nenhum pedido corresponde à pesquisa.'
                : 'Nenhum pedido neste separador.'}
          </div>
        ) : (
          visiveis.map((t) => (
            <TiTicketItem
              key={t.id}
              ticket={t}
              activo={t.id === selecionadoId}
              mostrarEmpresa={empresas.length > 1}
              destacarPorResponder={gestao}
              onSelecionar={onSelecionar}
            />
          ))
        )}
      </div>
    </div>
  );
}
