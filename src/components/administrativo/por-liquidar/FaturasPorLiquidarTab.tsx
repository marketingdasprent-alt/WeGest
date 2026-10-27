import { useMemo, useState } from 'react';
import { format, startOfMonth } from 'date-fns';
import { FileSpreadsheet, Loader2, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SectionCard } from '@/components/ui/section-card';
import { useEstadoPersistido } from '@/hooks/useEstadoPersistido';
import { agruparPorCliente, useFaturasPorLiquidar } from '@/hooks/useFaturasPorLiquidar';
import type { ClienteComFaturas } from '@/hooks/useFaturasPorLiquidar';
import { exportarFaturasPorLiquidar } from '@/lib/exportarFaturasPorLiquidar';
import { matchesSearch } from '@/lib/utils';
import { formatCurrency } from '@/utils/formatters';
import { FaturasPorLiquidarTabela } from './FaturasPorLiquidarTabela';
import { RegistarRecibosLoteDialog } from './RegistarRecibosLoteDialog';

export function FaturasPorLiquidarTab() {
  const [de, setDe] = useEstadoPersistido('porLiquidar.de', () =>
    format(startOfMonth(new Date()), 'yyyy-MM-dd')
  );
  const [ate, setAte] = useEstadoPersistido('porLiquidar.ate', () =>
    format(new Date(), 'yyyy-MM-dd')
  );
  const [pesquisa, setPesquisa] = useEstadoPersistido('porLiquidar.pesquisa', '');
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [loteAberto, setLoteAberto] = useState(false);

  const { data: faturas, isLoading, error } = useFaturasPorLiquidar({ de, ate });

  const grupos = useMemo(
    () =>
      agruparPorCliente(
        (faturas ?? []).filter((f) => matchesSearch(f.destinatario_nome, pesquisa))
      ),
    [faturas, pesquisa]
  );
  const totalPendente = grupos.reduce((s, g) => s + g.totalPendente, 0);
  // Só as que estão à vista: uma escolhida e depois escondida pela pesquisa não deve levar recibo.
  const escolhidas = grupos.flatMap((g) => g.faturas).filter((f) => selecionadas.has(f.id));

  const alternar = (ids: string[], marcar: boolean) =>
    setSelecionadas((atual) => {
      const novo = new Set(atual);
      ids.forEach((id) => (marcar ? novo.add(id) : novo.delete(id)));
      return novo;
    });
  const handleToggleFatura = (id: string) => alternar([id], !selecionadas.has(id));
  const handleToggleCliente = (g: ClienteComFaturas) =>
    alternar(
      g.faturas.map((f) => f.id),
      !g.faturas.every((f) => selecionadas.has(f.id))
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-xs text-muted-foreground">
          De
          <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="h-9" />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          Até
          <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="h-9" />
        </label>
        <Input
          placeholder="Pesquisar cliente..."
          value={pesquisa}
          onChange={(e) => setPesquisa(e.target.value)}
          className="h-9 w-56"
        />
        <div className="ml-auto rounded-lg border bg-card px-4 py-2 text-right">
          <p className="text-xs text-muted-foreground">Total por liquidar</p>
          <p className="text-xl font-bold tabular-nums">{formatCurrency(totalPendente)}</p>
        </div>
      </div>

      <SectionCard
        icon={<Receipt className="h-4 w-4" />}
        title="Faturas por liquidar"
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={grupos.length === 0}
              onClick={() => exportarFaturasPorLiquidar(grupos, de, ate)}
            >
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </Button>
            <Button
              size="sm"
              className="gap-2"
              disabled={escolhidas.length === 0}
              onClick={() => setLoteAberto(true)}
            >
              <Receipt className="h-4 w-4" /> Registar recibos ({escolhidas.length})
            </Button>
          </div>
        }
      >
        {isLoading ? (
          <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin text-muted-foreground" />
        ) : error ? (
          <p className="text-sm text-destructive">
            Não foi possível carregar as faturas: {error.message}
          </p>
        ) : grupos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma fatura por liquidar neste período.
          </p>
        ) : (
          <FaturasPorLiquidarTabela
            grupos={grupos}
            selecionadas={selecionadas}
            onToggleFatura={handleToggleFatura}
            onToggleCliente={handleToggleCliente}
          />
        )}
      </SectionCard>

      <RegistarRecibosLoteDialog
        open={loteAberto}
        onOpenChange={setLoteAberto}
        faturas={escolhidas}
        onConcluido={(idsPagos) => alternar(idsPagos, false)}
      />
    </div>
  );
}
