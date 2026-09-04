import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Paperclip, Search } from 'lucide-react';
import {
  abrirTiAnexo,
  useCriarSugestao,
  useMarcarPresencial,
  useMarcarResolvido,
  useReabrirTicket,
  useTiTickets,
} from '@/hooks/useTiTickets';
import { ESTADO_TICKET_ROTULO } from '@/lib/tiTicketEstados';
import { resumoContinuacao } from '@/lib/tiTicketContinuacao';

const TODAS = '__todas__';
const TAMANHO_PAGINA = 5;

export function TiTicketLista() {
  const { data = [], isLoading, error } = useTiTickets();
  const criarSugestao = useCriarSugestao();
  const marcarPresencial = useMarcarPresencial();
  const marcarResolvido = useMarcarResolvido();
  const reabrir = useReabrirTicket();

  const [aSugerir, setASugerir] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [empresa, setEmpresa] = useState(TODAS);
  const [pesquisa, setPesquisa] = useState('');
  const [pagina, setPagina] = useState(1);

  // Quem faz suporte à plataforma vê os pedidos de todas as empresas; toda a
  // gente vê só os da sua. O filtro sai da própria lista em vez de uma query às
  // organizações — assim aparece exactamente com as empresas que estão ali, e
  // não com as que a pessoa não pode ver.
  const empresas = useMemo(
    () =>
      Array.from(new Set(data.map((t) => t.organizacao?.nome).filter(Boolean) as string[])).sort(),
    [data]
  );
  const visiveis = useMemo(() => {
    const porEmpresa =
      empresa === TODAS ? data : data.filter((t) => t.organizacao?.nome === empresa);
    const termo = pesquisa.trim().toLowerCase();
    if (!termo) return porEmpresa;
    // Número, nome de quem pediu, ou texto da descrição — o que quem procura
    // costuma ter à mão para encontrar um pedido específico.
    return porEmpresa.filter(
      (t) =>
        String(t.numero).includes(termo) ||
        t.autor_nome.toLowerCase().includes(termo) ||
        t.descricao.toLowerCase().includes(termo)
    );
  }, [data, empresa, pesquisa]);

  // Mudar o filtro ou a pesquisa sem voltar à página 1 deixava a lista a
  // mostrar "sem resultados" quando a página 3 de um filtro antigo não
  // existia no novo conjunto.
  useEffect(() => {
    setPagina(1);
  }, [empresa, pesquisa]);

  const totalPaginas = Math.max(1, Math.ceil(visiveis.length / TAMANHO_PAGINA));
  useEffect(() => {
    if (pagina > totalPaginas) setPagina(totalPaginas);
  }, [pagina, totalPaginas]);

  const naPagina = useMemo(
    () => visiveis.slice((pagina - 1) * TAMANHO_PAGINA, pagina * TAMANHO_PAGINA),
    [visiveis, pagina]
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
    return <p className="text-sm text-destructive">Não foi possível carregar os pedidos.</p>;
  }

  /**
   * Corre uma transição e mostra o resultado. As mutações rejeitam transições
   * proibidas pela máquina de estados — sem este catch, o erro morria em
   * silêncio e o admin ficava a olhar para um botão que parecia não fazer nada.
   */
  const executar = async (
    mutacao: { mutateAsync: (v: { ticketId: string }) => Promise<unknown> },
    ticketId: string,
    sucesso: string
  ) => {
    try {
      await mutacao.mutateAsync({ ticketId });
      toast.success(sucesso);
    } catch (e: any) {
      toast.error(e?.message ?? 'Não foi possível mudar o estado do pedido.');
    }
  };

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
    <Card className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Pedidos actuais ({visiveis.length})</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={pesquisa}
              onChange={(e) => setPesquisa(e.target.value)}
              placeholder="Pesquisar por número, nome ou texto"
              className="h-9 w-56 bg-background pl-8"
              aria-label="Pesquisar pedidos"
            />
          </div>
          {/* Só faz sentido filtrar por empresa quando há mais do que uma na
              lista — para quem vê só a sua, seria um controlo com uma opção. */}
          {empresas.length > 1 && (
            <Select value={empresa} onValueChange={setEmpresa}>
              <SelectTrigger className="h-9 w-48 bg-background">
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
        </div>
      </div>

      {visiveis.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {data.length === 0
            ? 'Ainda não há pedidos.'
            : pesquisa.trim()
              ? 'Nenhum pedido corresponde à pesquisa.'
              : 'Nenhum pedido desta empresa.'}
        </p>
      )}

      <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
        {naPagina.map((t) => {
          const estado = ESTADO_TICKET_ROTULO[t.status] ?? {
            rotulo: t.status,
            variante: 'default' as const,
          };
          // As sugestões já vêm ordenadas do hook, por isso o índice é o número
          // da tentativa.
          const continuacao = resumoContinuacao(t.sugestoes);
          return (
            <div key={t.id} className="space-y-3 rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">#{t.numero}</span>
                  <span className="text-sm text-muted-foreground">{t.autor_nome}</span>
                  {/* Quando foi feito, dia e minuto — para quem gere vários
                    pedidos da mesma pessoa distinguir qual é qual. */}
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(t.created_at), 'dd/MM/yyyy HH:mm')}
                  </span>
                  {/* De que empresa veio. O número do pedido é por organização,
                    portanto sem isto havia dois "#1" na mesma lista. */}
                  {empresas.length > 1 && t.organizacao?.nome && (
                    <Badge variant="secondary">{t.organizacao.nome}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {/* Quem abre a lista tem de ver logo que este pedido já levou
                    uma tentativa. Sem isto, uma segunda passagem parece um
                    pedido novo e repete-se a sugestão que já falhou. */}
                  {continuacao.ehContinuacao && t.status !== 'resolvido' && (
                    <Badge variant="outline">
                      Continuação — {continuacao.proximaTentativa}.ª tentativa
                    </Badge>
                  )}
                  <Badge variant={estado.variante}>{estado.rotulo}</Badge>
                </div>
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

              {/* Quem tratou disto. É a primeira pergunta quando um pedido volta
                a abrir, e sem isto a resposta estava só na cabeça de alguém. */}
              {t.status === 'resolvido' && (
                <p className="text-xs text-muted-foreground">
                  {t.resolvido_por_nome ? (
                    <>
                      Resolvido por <b className="text-foreground">{t.resolvido_por_nome}</b>
                      {t.resolvido_em &&
                        ` a ${format(new Date(t.resolvido_em), 'dd/MM/yyyy HH:mm')}`}
                    </>
                  ) : (
                    // Pedidos fechados antes de existir a coluna. Dizer que não se
                    // sabe é melhor do que ficar calado: calado, quem olha fica a
                    // pensar que o ecrã não está a mostrar o que devia.
                    'Fechado antes de se passar a registar quem resolve — não há registo de quem foi.'
                  )}
                </p>
              )}

              {t.sugestoes.map((s, i) => (
                <div key={s.id} className="rounded-md border border-border p-2 text-sm">
                  <p className="text-xs font-semibold text-muted-foreground">
                    Tentativa {i + 1}
                    {s.criado_por_nome && ` · por ${s.criado_por_nome}`}
                    {' · '}
                    {format(new Date(s.created_at), 'dd/MM/yyyy HH:mm')}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{s.texto}</p>
                  <p className="mt-1 text-xs">
                    {s.util === true && <span className="text-emerald-600">Resolveu</span>}
                    {s.util === false && <span className="text-destructive">Não resolveu</span>}
                    {s.util === null && (
                      <span className="text-muted-foreground">Sem resposta ainda</span>
                    )}
                    {s.util !== null && s.respondida_em && (
                      <span className="text-muted-foreground">
                        {' '}
                        · {format(new Date(s.respondida_em), 'dd/MM/yyyy HH:mm')}
                      </span>
                    )}
                  </p>
                  {/* O que o autor escreveu ao recusar. Distinguir "não explicou"
                    de "explicou" evita ficar à espera de um texto que nunca
                    houve. */}
                  {s.util === false && (
                    <p
                      className={
                        s.resposta_texto
                          ? 'mt-2 whitespace-pre-wrap rounded-md bg-muted p-2 text-xs'
                          : 'mt-2 text-xs italic text-muted-foreground'
                      }
                    >
                      {s.resposta_texto ?? 'Não explicou porquê.'}
                    </p>
                  )}
                </div>
              ))}

              <div className="flex flex-wrap gap-2">
                {t.status !== 'resolvido' ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setASugerir(t.id)}>
                      {continuacao.ehContinuacao
                        ? `Nova sugestão (tentativa ${continuacao.proximaTentativa})`
                        : 'Sugerir resolução'}
                    </Button>
                    <Button
                      size="sm"
                      disabled={marcarResolvido.isPending}
                      onClick={() =>
                        executar(marcarResolvido, t.id, 'Pedido marcado como resolvido.')
                      }
                    >
                      Marcar como resolvido
                    </Button>
                    {t.status !== 'presencial' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          executar(
                            marcarPresencial,
                            t.id,
                            'Pedido marcado para resolver em pessoa.'
                          )
                        }
                      >
                        Ver presencialmente
                      </Button>
                    )}
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={reabrir.isPending}
                    onClick={() => executar(reabrir, t.id, 'Pedido reaberto.')}
                  >
                    Reabrir
                  </Button>
                )}
              </div>

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
