import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  useCriarSugestao,
  useCriarTicketComoAdmin,
  useMarcarPresencial,
  useTiTickets,
} from '@/hooks/useTiTickets';
import type { EstadoTicket } from '@/lib/tiTicketEstados';

/** Rótulo e tom de cada estado. Um só sítio, para o mesmo estado não ter dois nomes. */
const ESTADOS: Record<
  EstadoTicket,
  { rotulo: string; variante: 'default' | 'secondary' | 'destructive' }
> = {
  aberto: { rotulo: 'Aberto', variante: 'default' },
  com_sugestao: { rotulo: 'À espera de resposta', variante: 'secondary' },
  nao_resolvido: { rotulo: 'A sugestão não resolveu', variante: 'destructive' },
  presencial: { rotulo: 'A resolver presencialmente', variante: 'default' },
  resolvido: { rotulo: 'Resolvido', variante: 'secondary' },
};

export function TiTicketLista() {
  const { data = [], isLoading, error } = useTiTickets();
  const criarSugestao = useCriarSugestao();
  const marcarPresencial = useMarcarPresencial();
  const criarComoAdmin = useCriarTicketComoAdmin();

  const [aSugerir, setASugerir] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [novoAberto, setNovoAberto] = useState(false);
  const [novaDescricao, setNovaDescricao] = useState('');

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (error) {
    return <p className="text-sm text-destructive">Não foi possível carregar os pedidos.</p>;
  }

  const enviarSugestao = async (ticketId: string) => {
    try {
      const r = await criarSugestao.mutateAsync({ ticketId, texto });
      setASugerir(null);
      setTexto('');
      // Distinguir "gravado" de "gravado e avisado" — sem isto o admin fica a
      // pensar que a pessoa foi notificada quando o email pode não ter saído.
      if (r?.emailFalhou) {
        toast.warning('Sugestão gravada, mas o email não saiu. Avise a pessoa por outra via.');
      } else {
        toast.success('Sugestão enviada por email.');
      }
    } catch (e: any) {
      toast.error(e.message ?? 'Não foi possível gravar a sugestão.');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Pedidos actuais ({data.length})</h2>
        <Button size="sm" variant="outline" onClick={() => setNovoAberto((v) => !v)}>
          Novo pedido
        </Button>
      </div>

      {novoAberto && (
        <Card className="space-y-2 p-4">
          <Label htmlFor="ti-nova-descricao">Descrição</Label>
          <Textarea
            id="ti-nova-descricao"
            rows={3}
            value={novaDescricao}
            onChange={(e) => setNovaDescricao(e.target.value)}
          />
          <Button
            size="sm"
            disabled={!novaDescricao.trim() || criarComoAdmin.isPending}
            onClick={async () => {
              try {
                await criarComoAdmin.mutateAsync({ descricao: novaDescricao });
                setNovaDescricao('');
                setNovoAberto(false);
                toast.success('Pedido aberto.');
              } catch (e: any) {
                toast.error(e.message ?? 'Não foi possível abrir o pedido.');
              }
            }}
          >
            Abrir pedido
          </Button>
        </Card>
      )}

      {data.length === 0 && <p className="text-sm text-muted-foreground">Ainda não há pedidos.</p>}

      {data.map((t) => {
        const estado = ESTADOS[t.status] ?? { rotulo: t.status, variante: 'default' as const };
        return (
          <Card key={t.id} className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold">#{t.numero}</span>
                <span className="text-sm text-muted-foreground">{t.autor_nome}</span>
              </div>
              <Badge variant={estado.variante}>{estado.rotulo}</Badge>
            </div>

            <p className="whitespace-pre-wrap text-sm">{t.descricao}</p>

            {t.sugestoes.map((s) => (
              <div key={s.id} className="rounded-md border border-border p-2 text-sm">
                <p className="whitespace-pre-wrap">{s.texto}</p>
                <p className="mt-1 text-xs">
                  {s.util === true && <span className="text-emerald-600">Ajudou</span>}
                  {s.util === false && <span className="text-destructive">Não ajudou</span>}
                  {s.util === null && (
                    <span className="text-muted-foreground">Sem resposta ainda</span>
                  )}
                </p>
              </div>
            ))}

            {t.status !== 'resolvido' && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setASugerir(t.id)}>
                  Sugerir resolução
                </Button>
                {t.status !== 'presencial' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => marcarPresencial.mutateAsync({ ticketId: t.id })}
                  >
                    Ver presencialmente
                  </Button>
                )}
              </div>
            )}

            {aSugerir === t.id && (
              <div className="space-y-2">
                <Label htmlFor={`ti-sug-${t.id}`}>Sugestão</Label>
                <Textarea
                  id={`ti-sug-${t.id}`}
                  rows={3}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                />
                <Button
                  size="sm"
                  disabled={!texto.trim() || criarSugestao.isPending}
                  onClick={() => enviarSugestao(t.id)}
                >
                  Enviar sugestão
                </Button>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
