import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Paperclip } from 'lucide-react';
import { abrirTiAnexo, useMeusTiTickets } from '@/hooks/useTiTickets';
import { ESTADO_TICKET_ROTULO } from '@/lib/tiTicketEstados';

const TAMANHO_PAGINA = 5;

/**
 * Histórico de quem NÃO gere tickets: só os próprios pedidos, em modo
 * leitura. As acções de gerir (sugerir, marcar resolvido, reabrir) ficam de
 * fora de propósito — quem vê isto não tem essa permissão, e mesmo que a
 * tivesse, responder à própria sugestão é o papel da página do link por
 * email (TicketTIAutor), não daqui.
 *
 * Mesmo painel que a lista do admin (cartão, scroll interno, paginação) —
 * só o conteúdo muda, para os dois ecrãs não parecerem coisas diferentes.
 * Sem pesquisa nem filtro de empresa: numa lista de "os meus pedidos" (uma
 * só organização, tipicamente poucos) não fazem falta.
 */
export function MeusTiTicketsLista() {
  const { data = [], isLoading, error } = useMeusTiTickets();
  const [pagina, setPagina] = useState(1);

  const totalPaginas = Math.max(1, Math.ceil(data.length / TAMANHO_PAGINA));
  useEffect(() => {
    if (pagina > totalPaginas) setPagina(totalPaginas);
  }, [pagina, totalPaginas]);

  const naPagina = useMemo(
    () => data.slice((pagina - 1) * TAMANHO_PAGINA, pagina * TAMANHO_PAGINA),
    [data, pagina]
  );
  const janelaPaginas = useMemo(() => {
    const maxBotoes = 5;
    let inicio = Math.max(1, pagina - 2);
    const fim = Math.min(totalPaginas, inicio + maxBotoes - 1);
    inicio = Math.max(1, fim - maxBotoes + 1);
    return Array.from({ length: fim - inicio + 1 }, (_, i) => inicio + i);
  }, [pagina, totalPaginas]);
  const irParaPagina = (p: number) => {
    if (p >= 1 && p <= totalPaginas) setPagina(p);
  };

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (error) {
    return <p className="text-sm text-destructive">Não foi possível carregar os teus pedidos.</p>;
  }

  return (
    <Card className="space-y-4 p-6">
      <h2 className="text-sm font-semibold">Os meus pedidos ({data.length})</h2>

      {data.length === 0 && (
        <p className="text-sm text-muted-foreground">Ainda não submeteste nenhum pedido.</p>
      )}

      <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
        {naPagina.map((t) => {
          const estado = ESTADO_TICKET_ROTULO[t.status] ?? {
            rotulo: t.status,
            variante: 'default' as const,
          };
          return (
            <div key={t.id} className="space-y-3 rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">#{t.numero}</span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(t.created_at), 'dd/MM/yyyy HH:mm')}
                  </span>
                </div>
                <Badge variant={estado.variante}>{estado.rotulo}</Badge>
              </div>

              <p className="whitespace-pre-wrap text-sm">{t.descricao}</p>

              {t.anexos.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {t.anexos.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                      onClick={async () => {
                        const url = await abrirTiAnexo(a.ficheiro_url);
                        if (!url) {
                          toast.error('Não foi possível abrir o anexo.');
                          return;
                        }
                        window.open(url, '_blank', 'noopener,noreferrer');
                      }}
                    >
                      <Paperclip className="h-3 w-3" />
                      {a.nome}
                    </button>
                  ))}
                </div>
              )}

              {t.status === 'resolvido' && t.resolvido_por_nome && (
                <p className="text-xs text-muted-foreground">
                  Resolvido por <b className="text-foreground">{t.resolvido_por_nome}</b>
                  {t.resolvido_em && ` a ${format(new Date(t.resolvido_em), 'dd/MM/yyyy HH:mm')}`}
                </p>
              )}

              {t.sugestoes.map((s, i) => (
                <div key={s.id} className="rounded-md border border-border p-2 text-sm">
                  <p className="text-xs font-semibold text-muted-foreground">
                    Tentativa {i + 1} · {format(new Date(s.created_at), 'dd/MM/yyyy HH:mm')}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{s.texto}</p>
                  <p className="mt-1 text-xs">
                    {s.util === true && (
                      <span className="text-emerald-600">Marcaste: resolveu</span>
                    )}
                    {s.util === false && (
                      <span className="text-destructive">Marcaste: não resolveu</span>
                    )}
                    {s.util === null && (
                      <span className="text-muted-foreground">Ainda por responder</span>
                    )}
                    {s.util !== null && s.respondida_em && (
                      <span className="text-muted-foreground">
                        {' '}
                        · {format(new Date(s.respondida_em), 'dd/MM/yyyy HH:mm')}
                      </span>
                    )}
                  </p>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {totalPaginas > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => irParaPagina(pagina - 1)}
                className={pagina === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
            {janelaPaginas.map((p) => (
              <PaginationItem key={p}>
                <PaginationLink
                  isActive={p === pagina}
                  onClick={() => irParaPagina(p)}
                  className="cursor-pointer"
                >
                  {p}
                </PaginationLink>
              </PaginationItem>
            ))}
            <PaginationItem>
              <PaginationNext
                onClick={() => irParaPagina(pagina + 1)}
                className={
                  pagina === totalPaginas ? 'pointer-events-none opacity-50' : 'cursor-pointer'
                }
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </Card>
  );
}
