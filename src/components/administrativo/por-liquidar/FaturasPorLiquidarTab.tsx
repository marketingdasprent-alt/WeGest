import { useMemo, useState } from 'react';
import { format, startOfMonth } from 'date-fns';
import { toast } from 'sonner';
import { Banknote, FileSpreadsheet, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
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
import { FaturasPorLiquidarTabela } from './FaturasPorLiquidarTabela';
import { PorLiquidarStats } from './PorLiquidarStats';
import { PorLiquidarToolbar } from './PorLiquidarToolbar';
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
      <StickyPageHeader
        title="Por liquidar"
        description="Faturas de rent-a-car ainda por pagar, por cliente"
        icon={Receipt}
      >
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            disabled={grupos.length === 0}
            onClick={() => exportarFaturasPorLiquidar(grupos, de, ate)}
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Exportar Excel
          </Button>
          <Button
            className="w-full sm:w-auto"
            disabled={escolhidas.length === 0}
            onClick={() => setLoteAberto(true)}
          >
            <Banknote className="mr-2 h-4 w-4" /> Registar pagamento ({escolhidas.length})
          </Button>
        </div>
      </StickyPageHeader>

      {/* Linha própria: dentro do cabeçalho os filtros ficavam a flutuar ao lado dos botões. */}
      <PorLiquidarToolbar
        de={de}
        ate={ate}
        onPeriodoChange={(novoDe, novoAte) => {
          setDe(novoDe);
          setAte(novoAte);
        }}
        pesquisa={pesquisa}
        onPesquisaChange={setPesquisa}
        totalCount={nFaturas}
      />

      <PorLiquidarStats
        total={totalPendente}
        clientes={grupos.length}
        faturas={nFaturas}
        escolhidas={escolhidas.length}
        totalEscolhido={totalEscolhido}
        maisAntiga={grupos
          .flatMap((g) => g.faturas)
          .reduce<
            string | null
          >((min, f) => (f.emitidaEm && (!min || f.emitidaEm < min) ? f.emitidaEm : min), null)}
        loading={isLoading}
      />

      {error ? (
        <p className="text-sm text-destructive">
          Não foi possível carregar as faturas: {error.message}
        </p>
      ) : (
        <FaturasPorLiquidarTabela
          grupos={grupos}
          loading={isLoading}
          selecionadas={selecionadas}
          onToggleFatura={handleToggleFatura}
          onToggleCliente={handleToggleCliente}
          onVerPdf={handleVerPdf}
          pdfAAbrir={pdfAAbrir}
        />
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
