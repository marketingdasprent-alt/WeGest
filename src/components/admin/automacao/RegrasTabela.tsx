import { Fragment } from 'react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { format, formatDistanceToNowStrict, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import type { RegraEstatistica } from '@/hooks/automacao/useAutomacaoStats';
import { cn } from '@/lib/utils';
import type { GrupoDeRegras } from './agrupamento';
import { identidadeDoEvento, type ModuloIdentidade } from './rotulos';

/** As colunas do cabeçalho. O cabeçalho de secção atravessa-as todas. */
const N_COLUNAS = 8;

/**
 * Cabeçalho de secção: uma linha que atravessa a tabela.
 *
 * Uma linha em vez de tabelas separadas por módulo, porque tabelas separadas
 * perdiam o alinhamento das colunas entre secções — cada uma media a sua
 * largura pelo seu próprio conteúdo, e a lista deixava de se ler na vertical.
 */
function CabecalhoDeSeccao({ modulo, total }: { modulo: ModuloIdentidade; total: number }) {
  const cor = `hsl(var(${modulo.token}))`;
  const { Icone } = modulo;

  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={N_COLUNAS} className="p-0">
        <div
          className="flex items-center gap-2 border-l-2 bg-muted/40 px-3 py-1.5"
          style={{ borderLeftColor: cor }}
        >
          <Icone aria-hidden className="h-3.5 w-3.5 shrink-0" style={{ color: cor }} />
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: cor }}>
            {modulo.nome}
          </span>
          <span className="text-xs tabular-nums text-muted-foreground">
            {total === 1 ? '1 automação' : `${total} automações`}
          </span>
        </div>
      </TableCell>
    </TableRow>
  );
}

/**
 * A tabela de regras, tal como estava na RegrasTab.
 *
 * Saiu de lá quando a vista de fluxo entrou: a RegrasTab passou a ser a casca
 * que escolhe entre as duas vistas, e uma casca não tem de saber desenhar
 * linhas de tabela.
 *
 * Recebe GRUPOS e não uma lista plana: é o agrupamento que decide a ordem, e
 * decidi-la aqui era decidi-la duas vezes. Os cabeçalhos só aparecem com mais
 * de um grupo — com o filtro num módulo só, ou quando só existe um, um
 * cabeçalho para a única secção seria ruído.
 */
export function RegrasTabela({
  grupos,
  podeGerir,
  toggleOcupado,
  onToggle,
  onAbrir,
}: {
  grupos: GrupoDeRegras[];
  podeGerir: boolean;
  toggleOcupado: boolean;
  onToggle: (id: string, ativo: boolean) => void;
  /** Clicar na linha abre a automação no construtor. */
  onAbrir: (regra: { id: string; nome: string }) => void;
}) {
  const comSeccoes = grupos.length > 1;

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {/* Coluna sem título: é um ponto de estado, e um cabeçalho para ele
              pesava mais do que a informação que dá. */}
          <TableHead className="w-8" aria-label="Saúde" />
          <TableHead>Automação</TableHead>
          <TableHead className="hidden md:table-cell">Módulo</TableHead>
          <TableHead className="text-right">Execuções</TableHead>
          <TableHead className="text-right">Falhas</TableHead>
          <TableHead className="hidden lg:table-cell">Última execução</TableHead>
          <TableHead className="hidden text-right xl:table-cell">Tempo médio</TableHead>
          <TableHead className="w-16 text-right">Ativa</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {grupos.map((grupo) => (
          <Fragment key={grupo.modulo.chave}>
            {comSeccoes && <CabecalhoDeSeccao modulo={grupo.modulo} total={grupo.regras.length} />}
            {grupo.regras.map((regra) => (
              <TableRow
                key={regra.rule_id}
                className={cn(
                  'cursor-pointer transition-colors hover:bg-muted/50',
                  !regra.ativo && 'opacity-60'
                )}
                onClick={() => onAbrir({ id: regra.rule_id, nome: regra.nome })}
              >
                <TableCell>
                  <span
                    className={cn(
                      'block h-2 w-2 rounded-full',
                      !regra.ativo
                        ? 'bg-muted-foreground/40'
                        : regra.falhas > 0
                          ? 'bg-destructive'
                          : regra.ultima_execucao
                            ? 'bg-success'
                            : 'bg-muted-foreground/40'
                    )}
                    // Sem isto, o ponto era cor sem legenda para quem não distingue
                    // verde de vermelho.
                    title={
                      !regra.ativo
                        ? 'Desligada'
                        : regra.falhas > 0
                          ? `${regra.falhas} falha(s)`
                          : regra.ultima_execucao
                            ? 'A correr sem falhas'
                            : 'Ainda não correu'
                    }
                  />
                </TableCell>
                <TableCell className="font-medium">
                  {regra.nome}
                  {/* Em ecrãs estreitos o módulo perde a coluna, mas não se perde. */}
                  <span
                    className="block text-[11px] md:hidden"
                    style={{ color: `hsl(var(${identidadeDoEvento(regra.event_type).token}))` }}
                  >
                    {identidadeDoEvento(regra.event_type).nome}
                  </span>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {/* A mesma cor que o módulo tem no canvas e nos chips. Era aqui
                  que a lista dizia cinzento o que o construtor dizia a cores. */}
                  <Badge
                    variant="outline"
                    className="font-normal"
                    style={{
                      color: `hsl(var(${identidadeDoEvento(regra.event_type).token}))`,
                      borderColor: `hsl(var(${identidadeDoEvento(regra.event_type).token}) / 0.4)`,
                      backgroundColor: `hsl(var(${identidadeDoEvento(regra.event_type).token}) / 0.08)`,
                    }}
                  >
                    {identidadeDoEvento(regra.event_type).nome}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{regra.execucoes}</TableCell>
                <TableCell className="text-right tabular-nums">
                  <span
                    className={
                      regra.falhas > 0 ? 'font-medium text-destructive' : 'text-muted-foreground'
                    }
                  >
                    {regra.falhas}
                  </span>
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                  {regra.ultima_execucao ? (
                    // Relativo em vez de data: "há 2 horas" responde à pergunta que
                    // se faz a olhar para esta coluna.
                    <span
                      title={format(parseISO(regra.ultima_execucao), 'dd MMM yyyy HH:mm', {
                        locale: pt,
                      })}
                    >
                      {formatDistanceToNowStrict(parseISO(regra.ultima_execucao), {
                        locale: pt,
                        addSuffix: true,
                      })}
                    </span>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums text-muted-foreground xl:table-cell">
                  {regra.duracao_media_ms != null
                    ? `${(regra.duracao_media_ms / 1000).toFixed(1)}s`
                    : '—'}
                </TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={regra.ativo}
                    onCheckedChange={(checked) => onToggle(regra.rule_id, checked)}
                    disabled={!podeGerir || toggleOcupado}
                  />
                </TableCell>
              </TableRow>
            ))}
          </Fragment>
        ))}
      </TableBody>
    </Table>
  );
}
