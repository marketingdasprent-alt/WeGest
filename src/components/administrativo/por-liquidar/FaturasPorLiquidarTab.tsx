import { useMemo, useState } from 'react';
import { format, startOfMonth } from 'date-fns';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
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
import { BarraSelecaoPagamento } from './BarraSelecaoPagamento';
import { CabecalhoPorLiquidar } from './CabecalhoPorLiquidar';
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
    // Largura limitada: num ecrã largo o valor ficava a mil píxeis do nome.
    <div className="max-w-6xl space-y-6">
      <CabecalhoPorLiquidar
        de={de}
        ate={ate}
        onPeriodoChange={(novoDe, novoAte) => {
          setDe(novoDe);
          setAte(novoAte);
        }}
        pesquisa={pesquisa}
        onPesquisaChange={setPesquisa}
        onExportar={() => exportarFaturasPorLiquidar(grupos, de, ate)}
        resumo={
          isLoading || error
            ? null
            : { total: totalPendente, clientes: grupos.length, faturas: nFaturas }
        }
      />

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
