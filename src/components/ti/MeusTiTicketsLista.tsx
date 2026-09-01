import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Paperclip } from 'lucide-react';
import { abrirTiAnexo, useMeusTiTickets } from '@/hooks/useTiTickets';
import { ESTADO_TICKET_ROTULO } from '@/lib/tiTicketEstados';

/**
 * Histórico de quem NÃO gere tickets: só os próprios pedidos, em modo
 * leitura. As acções de gerir (sugerir, marcar resolvido, reabrir) ficam de
 * fora de propósito — quem vê isto não tem essa permissão, e mesmo que a
 * tivesse, responder à própria sugestão é o papel da página do link por
 * email (TicketTIAutor), não daqui.
 */
export function MeusTiTicketsLista() {
  const { data = [], isLoading, error } = useMeusTiTickets();

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (error) {
    return <p className="text-sm text-destructive">Não foi possível carregar os teus pedidos.</p>;
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold">Os meus pedidos ({data.length})</h2>

      {data.length === 0 && (
        <p className="text-sm text-muted-foreground">Ainda não submeteste nenhum pedido.</p>
      )}

      {data.map((t) => {
        const estado = ESTADO_TICKET_ROTULO[t.status] ?? {
          rotulo: t.status,
          variante: 'default' as const,
        };
        return (
          <Card key={t.id} className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">#{t.numero}</span>
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
                {t.resolvido_em && ` a ${format(new Date(t.resolvido_em), 'dd/MM/yyyy')}`}
              </p>
            )}

            {t.sugestoes.map((s, i) => (
              <div key={s.id} className="rounded-md border border-border p-2 text-sm">
                <p className="text-xs font-semibold text-muted-foreground">Tentativa {i + 1}</p>
                <p className="mt-1 whitespace-pre-wrap">{s.texto}</p>
                <p className="mt-1 text-xs">
                  {s.util === true && <span className="text-emerald-600">Marcaste: resolveu</span>}
                  {s.util === false && (
                    <span className="text-destructive">Marcaste: não resolveu</span>
                  )}
                  {s.util === null && (
                    <span className="text-muted-foreground">Ainda por responder</span>
                  )}
                </p>
              </div>
            ))}
          </Card>
        );
      })}
    </div>
  );
}
