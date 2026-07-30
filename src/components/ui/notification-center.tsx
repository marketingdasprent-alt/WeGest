import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { pt } from 'date-fns/locale';
import {
  AlertTriangle,
  Bell,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Eye,
  Loader2,
  type LucideIcon,
} from 'lucide-react';
import { type Notificacao, itensDaNotificacao, totalAgrupado } from '@/types/notificacao';
import {
  notificacaoLabel,
  notificacaoLink,
  notificacaoItemTexto,
  notificacaoTitulo,
} from '@/utils/notificacoes';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────
// `Notificacao` vem de src/types/notificacao.ts: é a linha gerada + as colunas
// do agrupamento (itens/agrupadas), que ainda não estão em types.ts.

export type NotificationFilter = 'all' | 'unread';

export interface NotificationCenterProps {
  notificacoes: Notificacao[];
  isLoading: boolean;
  error: Error | null;
  filtro: NotificationFilter;
  onFiltroChange: (filtro: NotificationFilter) => void;
  onMarkAsRead: (id: string) => void;
  onLoadMore: () => void;
  hasMore: boolean;
  isLoadingMore: boolean;
  unreadCount?: number;
  /**
   * Total real de não resolvidas no servidor, quando é maior do que o número de
   * linhas carregadas. O hook lê no máximo 200; sem isto, quem tem mais do que
   * 200 avisos via só os primeiros e nada dizia que a lista estava cortada.
   */
  totalNoServidor?: number;
}

// ── Severity config ──────────────────────────────────────────────────────────

interface SeveridadeConfig {
  icon: LucideIcon;
  iconClass: string;
  bgClass: string;
}

const SEVERIDADE_MAP: Record<string, SeveridadeConfig> = {
  urgente: {
    icon: AlertTriangle,
    iconClass: 'text-destructive',
    bgClass: 'hover:bg-destructive/5',
  },
  normal: {
    icon: Bell,
    iconClass: 'text-primary',
    bgClass: 'hover:bg-primary/5',
  },
};

const getSeveridadeConfig = (severidade: string): SeveridadeConfig =>
  SEVERIDADE_MAP[severidade] ?? SEVERIDADE_MAP.normal;

// ── Agrupamento ──────────────────────────────────────────────────────────────
// Quando um scan em atraso (ex.: renovações de contrato) gera várias
// notificações de uma vez, o mesmo título repete-se N vezes — agrupa-se
// para não inundar o popup com linhas quase idênticas.

interface NotificacaoGrupo {
  titulo: string;
  items: Notificacao[];
}

function agruparPorTitulo(notificacoes: Notificacao[]): NotificacaoGrupo[] {
  const grupos: NotificacaoGrupo[] = [];
  const indicePorTitulo = new Map<string, number>();
  for (const n of notificacoes) {
    // Agrupa pelo título já resolvido: agrupar pelo valor cru punha as linhas
    // sem título num grupo com chave '' e cabeçalho vazio.
    const titulo = notificacaoTitulo(n);
    const indice = indicePorTitulo.get(titulo);
    if (indice === undefined) {
      indicePorTitulo.set(titulo, grupos.length);
      grupos.push({ titulo, items: [n] });
    } else {
      grupos[indice].items.push(n);
    }
  }
  return grupos;
}

// ── Linha individual ─────────────────────────────────────────────────────────

function NotificationRow({
  n,
  onMarkAsRead,
  compact = false,
}: {
  n: Notificacao;
  onMarkAsRead: (id: string) => void;
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const [aberto, setAberto] = React.useState(false);
  const sev = getSeveridadeConfig(n.severidade);
  const SevIcon = sev.icon;
  const urgente = n.severidade === 'urgente';
  const link = notificacaoLink(n);

  // Uma notificação agrupada representa N entidades (ex.: 88 viaturas com o
  // seguro a expirar). `itens` guarda todas com o respectivo link — é o que
  // permite agrupar sem perder acesso a nenhuma delas.
  const itens = itensDaNotificacao(n);
  const total = totalAgrupado(n);

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-lg border border-border transition-colors',
        compact ? 'p-2 pl-9' : 'p-3',
        sev.bgClass
      )}
    >
      <div className="flex items-start gap-3">
        {!compact && (
          <div
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
              urgente ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
            )}
          >
            <SevIcon className="h-4 w-4" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          {/*
            Título e data em coluna, não lado a lado. Em `flex-row` a data era
            `shrink-0` e o título ficava com o resto: num popover de 384px com
            um título longo ("Seguro de viatura a expirar"), o resto chegava a
            ser mais estreito do que uma palavra e o texto saía uma palavra por
            linha, na vertical.
          */}
          {!compact && (
            <p
              className={cn(
                'text-sm font-semibold',
                urgente ? 'text-destructive' : 'text-foreground'
              )}
            >
              {notificacaoTitulo(n)}
              {total > 1 && (
                <span className="ml-2 inline-block whitespace-nowrap rounded-full bg-muted px-2 py-0.5 align-middle text-xs font-bold tabular-nums text-foreground">
                  {total}
                </span>
              )}
            </p>
          )}
          <time
            className={cn('block text-xs text-muted-foreground', compact ? 'mb-1' : 'mt-0.5')}
            dateTime={n.created_at}
          >
            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: pt })}
          </time>

          {n.mensagem && <p className="mt-1 text-sm text-muted-foreground">{n.mensagem}</p>}

          {/*
            `flex-wrap`: três botões ("Ver viatura", "Ver 181", "Resolver") não
            cabem lado a lado num popover estreito, e como o Button não quebra
            texto forçavam a linha a ser mais larga do que o painel — daí a
            barra de scroll horizontal e os botões cortados a meio ("Resol...").
            A dobrar, ocupam duas linhas e ficam inteiros.
          */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={urgente ? 'destructive' : 'default'}
              className="h-7"
              onClick={() => navigate(link)}
            >
              <Eye className="mr-1 h-3 w-3" />
              {notificacaoLabel(n)}
            </Button>
            {total > 1 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7"
                onClick={() => setAberto((v) => !v)}
                aria-expanded={aberto}
              >
                {aberto ? (
                  <ChevronDown className="mr-1 h-3 w-3" />
                ) : (
                  <ChevronRight className="mr-1 h-3 w-3" />
                )}
                {aberto ? 'Ocultar' : `Ver ${total}`}
              </Button>
            )}
            {!n.resolvida && (
              <Button size="sm" variant="ghost" className="h-7" onClick={() => onMarkAsRead(n.id)}>
                <Check className="mr-1 h-3 w-3" />
                Resolver
              </Button>
            )}
            {n.resolvida && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Check className="h-3 w-3" />
                Resolvida
              </span>
            )}
          </div>
        </div>

        {/*
          O chevron que existia aqui fazia exactamente o mesmo que o botão
          "Ver ..." ao lado — dois controlos para uma acção, e com um rótulo
          ("Abrir") que não dizia para onde. Removido: além de duplicado,
          consumia largura no painel estreito onde o problema apertava.
        */}
      </div>

      {/* Entidades desta notificação agrupada. Cada uma mantém o seu link —
          é o que permite colapsar 88 avisos numa linha sem perder o acesso a
          nenhuma das 88 viaturas. */}
      {aberto && itens.length > 0 && (
        <ul className="flex flex-col gap-1 border-t border-border pt-2">
          {itens.map((item, i) => (
            <li key={`${item.link ?? item.viatura_id ?? 'item'}-${i}`}>
              {item.link ? (
                <button
                  type="button"
                  onClick={() => navigate(item.link as string)}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <span className="truncate">{notificacaoItemTexto(n, item, i)}</span>
                  <ChevronRight aria-hidden="true" className="h-3 w-3 shrink-0" />
                </button>
              ) : (
                <span className="block px-2 py-1.5 text-xs text-muted-foreground">
                  {notificacaoItemTexto(n, item, i)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Grupo (título repetido) ──────────────────────────────────────────────────

function NotificationGroupRow({
  grupo,
  expanded,
  onToggle,
  onMarkAsRead,
}: {
  grupo: NotificacaoGrupo;
  expanded: boolean;
  onToggle: () => void;
  onMarkAsRead: (id: string) => void;
}) {
  const primeira = grupo.items[0];
  const sev = getSeveridadeConfig(primeira.severidade);
  const SevIcon = sev.icon;
  const urgente = grupo.items.some((n) => n.severidade === 'urgente');

  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors',
          sev.bgClass
        )}
      >
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
            urgente ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
          )}
        >
          <SevIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'text-sm font-semibold',
              urgente ? 'text-destructive' : 'text-foreground'
            )}
          >
            {grupo.titulo}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(primeira.created_at), { addSuffix: true, locale: pt })}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-bold tabular-nums text-foreground">
          {grupo.items.length}
        </span>
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="space-y-1.5 border-t border-border p-2">
          {grupo.items.map((n) => (
            <NotificationRow key={n.id} n={n} onMarkAsRead={onMarkAsRead} compact />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  notificacoes,
  isLoading,
  error,
  filtro,
  onFiltroChange,
  onMarkAsRead,
  onLoadMore,
  hasMore,
  isLoadingMore,
  unreadCount = 0,
  totalNoServidor,
}) => {
  const [gruposAbertos, setGruposAbertos] = React.useState<Set<string>>(new Set());

  const toggleGrupo = (titulo: string) => {
    setGruposAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(titulo)) novo.delete(titulo);
      else novo.add(titulo);
      return novo;
    });
  };

  const handleResolverTodas = () => {
    for (const n of notificacoes) {
      if (!n.resolvida) onMarkAsRead(n.id);
    }
  };

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-64" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertTriangle className="mb-3 h-10 w-10 text-destructive" />
        <p className="text-sm font-medium text-destructive">Erro ao carregar notificações</p>
        <p className="mt-1 text-xs text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  const naoResolvidas = notificacoes.filter((n) => !n.resolvida).length;
  const grupos = agruparPorTitulo(notificacoes);

  return (
    <div className="space-y-4">
      {/* ── Filter tabs + ações em massa ── */}
      <div className="flex items-center justify-between gap-2">
        <Tabs value={filtro} onValueChange={(v) => onFiltroChange(v as NotificationFilter)}>
          <TabsList>
            <TabsTrigger value="unread" className="gap-1.5">
              Não resolvidas
              {unreadCount > 0 && (
                <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary-foreground">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="all">Todas</TabsTrigger>
          </TabsList>
        </Tabs>
        {naoResolvidas >= 2 && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 shrink-0 text-xs"
            onClick={handleResolverTodas}
          >
            <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
            Resolver todas
          </Button>
        )}
      </div>

      {/* ── Empty state ── */}
      {notificacoes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Bell className="mb-3 h-10 w-10 opacity-20" />
          <p className="text-sm font-medium">Sem notificações</p>
          <p className="mt-0.5 text-xs">
            {filtro === 'unread'
              ? 'Não há notificações por resolver.'
              : 'Não há notificações para mostrar.'}
          </p>
        </div>
      ) : (
        <>
          {/* ── Notification list ── */}
          <div className="space-y-2">
            {grupos.map((grupo) =>
              grupo.items.length === 1 ? (
                <NotificationRow
                  key={grupo.items[0].id}
                  n={grupo.items[0]}
                  onMarkAsRead={onMarkAsRead}
                />
              ) : (
                <NotificationGroupRow
                  key={grupo.titulo}
                  grupo={grupo}
                  expanded={gruposAbertos.has(grupo.titulo)}
                  onToggle={() => toggleGrupo(grupo.titulo)}
                  onMarkAsRead={onMarkAsRead}
                />
              )
            )}
          </div>

          {/* ── Lista cortada pelo limite de leitura ── */}
          {typeof totalNoServidor === 'number' && totalNoServidor > notificacoes.length && (
            <p className="pt-2 text-center text-xs text-muted-foreground">
              A mostrar {notificacoes.length} de {totalNoServidor}. Resolve as mais antigas para ver
              as restantes.
            </p>
          )}

          {/* ── Load more ── */}
          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" size="sm" onClick={onLoadMore} disabled={isLoadingMore}>
                {isLoadingMore ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />A carregar...
                  </>
                ) : (
                  'Carregar mais'
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
