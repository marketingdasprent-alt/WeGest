// src/components/faturacao/acordo/ParcelaTimelineItem.tsx
import { useState } from 'react';
import { CalendarClock, Download, Eye, StickyNote } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ParcelaStatusBadge } from '@/components/faturacao/ParcelaStatusBadge';
import { formatCurrency } from '@/utils/formatters';
import { gerarAvisoVencimentoPdf } from '@/utils/avisoVencimentoPdf';
import {
  useAssociarDocumentoExistente,
  useReemitirDocumento,
  useGravarNotaParcela,
  type AcordoDetalhe,
  type ParcelaDetalhe,
} from '@/hooks/useAcordoDetalhe';
import type { AcordoVistaDevedor, AcordoVistaDevedorParcela } from '@/hooks/useAcordoVistaDevedor';

const dataPT = (iso: string) => iso.split('-').reverse().join('/');

const ABERTAS: ParcelaDetalhe['estado'][] = ['agendada', 'avisada', 'vencida'];

interface Props {
  acordo: AcordoDetalhe | AcordoVistaDevedor;
  parcela: ParcelaDetalhe | AcordoVistaDevedorParcela;
  onRegistarPagamento?: (parcela: ParcelaDetalhe) => void;
  /**
   * `win`: janela já aberta SINCRONAMENTE (dentro deste próprio onClick, antes de
   * qualquer await) — o chamador só lhe muda o `location.href` depois de obter o
   * PDF. Nunca abrir a janela dentro de um useEffect/callback assíncrono: alguns
   * navegadores (Safari) só toleram `window.open()` na pilha de chamada síncrona
   * do gesto do utilizador; um efeito disparado por uma mudança de estado já não
   * conta, mesmo que seja consequência direta do clique.
   */
  onVerDocumento?: (invoiceId: string, win: Window | null) => void;
  /**
   * 'staff' (default) mostra todas as acções internas (Registar pagamento, Ver
   * recibo, PDF do aviso). 'devedor' esconde-as TODAS incondicionalmente — o
   * devedor só visualiza o próprio acordo (via RPC acordo_vista_devedor), nunca
   * actua sobre ele. A gating é feita pelo `modo`, não pela presença/ausência dos
   * campos: mesmo que um dia a vista do devedor passasse a incluir algum destes
   * campos, isso não deve, por si só, fazer aparecer um botão de acção.
   */
  modo?: 'staff' | 'devedor';
}

export function ParcelaTimelineItem({
  acordo,
  parcela,
  onRegistarPagamento,
  onVerDocumento,
  modo = 'staff',
}: Props) {
  const modoStaff = modo !== 'devedor';
  // Cast seguro: o AcordoDetalhePanel só passa `acordo`/`parcela` com estes dados
  // completos quando modo é 'staff' (fonte useAcordoDetalhe); em modo 'devedor' estes
  // valores nunca chegam a ser lidos, porque todos os blocos que os usam estão
  // atrás de `modoStaff &&`.
  const parcelaStaff = parcela as ParcelaDetalhe;
  const acordoStaff = acordo as AcordoDetalhe;
  const aberta = ABERTAS.includes(parcelaStaff.estado);
  const associarDocumento = useAssociarDocumentoExistente();
  const reemitirDocumento = useReemitirDocumento();
  const gravarNota = useGravarNotaParcela();
  const [editandoNota, setEditandoNota] = useState(false);
  const [rascunhoNota, setRascunhoNota] = useState(parcelaStaff.nota ?? '');

  function guardarNota() {
    gravarNota.mutate(
      { parcelaId: parcelaStaff.id, nota: rascunhoNota },
      {
        onSuccess: () => setEditandoNota(false),
        onError: (e) => toast.error(`Erro ao guardar a nota: ${(e as Error).message}`),
      }
    );
  }

  return (
    <li className="ml-6">
      <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 ring-4 ring-background">
        <CalendarClock className="h-3 w-3 text-primary" />
      </span>
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">Parcela {parcela.numero}</span>
          <ParcelaStatusBadge estado={parcelaStaff.estado} />
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatCurrency(parcela.valor)} · vence {dataPT(parcela.dataVencimento)}
          </span>
        </div>

        {modoStaff && parcelaStaff.estado === 'liquidacao_pendente' && !parcelaStaff.suspenso && (
          <p className="text-xs text-indigo-700 dark:text-indigo-300">
            ⏳ Pagamento registado — recibo por emitir. Nova tentativa automática em breve.
          </p>
        )}

        {modoStaff && parcelaStaff.suspenso && (
          <p className="text-xs text-destructive">
            ⚠ Recibo suspenso — precisa de verificação. A ligação ao software de faturação falhou e
            não é possível confirmar se o recibo chegou a ser emitido.
          </p>
        )}

        {modoStaff && parcelaStaff.suspenso && (
          <div className="flex items-center gap-2 mt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                const numero = window.prompt('Nº do documento já emitido no provider:');
                if (!numero) return;
                associarDocumento.mutate(
                  {
                    parcelaId: parcelaStaff.id,
                    numeroDocumento: numero,
                    cobrancaId: acordoStaff.cobrancaId,
                    contratoId: acordoStaff.contratoId,
                    valor: parcelaStaff.valor,
                  },
                  {
                    onSuccess: () => toast.success('Documento associado — parcela liquidada.'),
                    onError: (e) =>
                      toast.error(`Erro ao associar o documento: ${(e as Error).message}`),
                  }
                );
              }}
            >
              Já existe — associar
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() =>
                reemitirDocumento.mutate(parcelaStaff.id, {
                  onSuccess: () => toast.success('Reposto para nova tentativa automática.'),
                  onError: (e) =>
                    toast.error(`Erro ao repor para nova tentativa: ${(e as Error).message}`),
                })
              }
            >
              Não existe — emitir
            </Button>
          </div>
        )}

        {modoStaff && parcelaStaff.avisoEnviadoEm && (
          <p className="text-xs text-muted-foreground">
            Aviso enviado {dataPT(parcelaStaff.avisoEnviadoEm.slice(0, 10))}
          </p>
        )}

        {modoStaff && !editandoNota && parcelaStaff.nota && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <StickyNote className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span className="flex-1">{parcelaStaff.nota}</span>
            <button
              type="button"
              className="underline hover:text-foreground"
              onClick={() => {
                setRascunhoNota(parcelaStaff.nota ?? '');
                setEditandoNota(true);
              }}
            >
              editar
            </button>
          </p>
        )}

        {modoStaff && editandoNota && (
          <div className="flex flex-col gap-1.5">
            <Textarea
              value={rascunhoNota}
              onChange={(e) => setRascunhoNota(e.target.value)}
              placeholder="Nota interna (ex.: cliente pediu adiamento)"
              className="min-h-16 text-xs"
              autoFocus
            />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                className="h-7 text-xs"
                disabled={gravarNota.isPending}
                onClick={guardarNota}
              >
                Guardar nota
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  setRascunhoNota(parcelaStaff.nota ?? '');
                  setEditandoNota(false);
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          {modoStaff && aberta && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => onRegistarPagamento?.(parcelaStaff)}
            >
              Registar pagamento
            </Button>
          )}
          {modoStaff && parcelaStaff.invoiceRcId && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => {
                // Abre a janela JÁ, síncrono dentro do clique — antes de qualquer
                // await no chamador (ver comentário no tipo de onVerDocumento acima).
                const win = window.open('', '_blank');
                onVerDocumento?.(parcelaStaff.invoiceRcId!, win);
              }}
            >
              <Eye className="h-3.5 w-3.5" />
              Ver recibo
            </Button>
          )}
          {modoStaff && parcelaStaff.avisoEnviadoEm && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => {
                const pdf = gerarAvisoVencimentoPdf(acordoStaff, parcelaStaff);
                pdf.save(`aviso-parcela-${parcelaStaff.numero}-acordo-${acordoStaff.codigo}.pdf`);
              }}
            >
              <Download className="h-3.5 w-3.5" />
              PDF do aviso
            </Button>
          )}
          {modoStaff && !parcelaStaff.nota && !editandoNota && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setEditandoNota(true)}
            >
              <StickyNote className="h-3.5 w-3.5" />
              Nota
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
