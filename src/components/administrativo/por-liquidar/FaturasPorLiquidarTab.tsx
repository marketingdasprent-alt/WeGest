import { useMemo, useState } from 'react';
import { format, startOfMonth } from 'date-fns';
import { toast } from 'sonner';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEstadoPersistido } from '@/hooks/useEstadoPersistido';
import {
  agruparPorCliente,
  carregarFaturaDaCobranca,
  useFaturasPorLiquidar,
} from '@/hooks/useFaturasPorLiquidar';
import type { ClienteComFaturas, FaturaPorLiquidar } from '@/hooks/useFaturasPorLiquidar';
import { abrirDocumentoPdf } from '@/lib/faturacao';
import { errorMessage } from '@/utils/errorMessage';
import { exportarFaturasPorLiquidar } from '@/lib/exportarFaturasPorLiquidar';
import { matchesSearch } from '@/lib/utils';
import { formatCurrency } from '@/utils/formatters';
import { BarraSelecaoPagamento } from './BarraSelecaoPagamento';
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
  const [pdfAAbrir, setPdfAAbrir] = useState<string | null>(null);

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

  const handleVerPdf = async (f: FaturaPorLiquidar) => {
    // A janela abre já, no clique: depois de um await o browser bloqueia-a.
    const janela = window.open('', '_blank');
    setPdfAAbrir(f.id);
    try {
      const invoice = await carregarFaturaDaCobranca(f.id);
      if (!invoice) {
        janela?.close();
        toast.error(`A fatura ${f.documento_externo_ref} não tem documento guardado no WeGest.`);
        return;
      }
      await abrirDocumentoPdf(invoice, janela);
    } catch (e: unknown) {
      janela?.close();
      toast.error(`Não foi possível abrir o PDF: ${errorMessage(e, 'indisponível')}`);
    } finally {
      setPdfAAbrir(null);
    }
  };

  const nFaturas = grupos.reduce((n, g) => n + g.faturas.length, 0);
  const totalEscolhido = escolhidas.reduce((t, f) => t + f.saldoPagar, 0);

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
        <Button
          variant="outline"
          className="ml-auto h-9 gap-2"
          disabled={grupos.length === 0}
          onClick={() => exportarFaturasPorLiquidar(grupos, de, ate)}
        >
          <FileSpreadsheet className="h-4 w-4" /> Exportar Excel
        </Button>
      </div>

      {isLoading ? (
        <Loader2 className="mx-auto my-10 h-6 w-6 animate-spin text-muted-foreground" />
      ) : error ? (
        <p className="text-sm text-destructive">
          Não foi possível carregar as faturas: {error.message}
        </p>
      ) : grupos.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">
          Nenhuma fatura por liquidar neste período.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-3xl font-bold tabular-nums">{formatCurrency(totalPendente)}</p>
            <p className="text-muted-foreground">
              por liquidar · {grupos.length} {grupos.length === 1 ? 'cliente' : 'clientes'} ·{' '}
              {nFaturas} {nFaturas === 1 ? 'fatura' : 'faturas'}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Escolha as faturas que o cliente pagou e carregue em Registar pagamento.
          </p>
          <FaturasPorLiquidarTabela
            grupos={grupos}
            selecionadas={selecionadas}
            onToggleFatura={handleToggleFatura}
            onToggleCliente={handleToggleCliente}
            onVerPdf={handleVerPdf}
            pdfAAbrir={pdfAAbrir}
          />
          <BarraSelecaoPagamento
            quantas={escolhidas.length}
            total={totalEscolhido}
            onLimpar={() => setSelecionadas(new Set())}
            onRegistarPagamento={() => setLoteAberto(true)}
          />
        </>
      )}

      <RegistarRecibosLoteDialog
        open={loteAberto}
        onOpenChange={setLoteAberto}
        faturas={escolhidas}
        onConcluido={(idsPagos) => alternar(idsPagos, false)}
      />
    </div>
  );
}
