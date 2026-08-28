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
import { moduloDoEvento } from './rotulos';

/**
 * A tabela de regras, tal como estava na RegrasTab.
 *
 * Saiu de lá quando a vista de fluxo entrou: a RegrasTab passou a ser a casca
 * que escolhe entre as duas vistas, e uma casca não tem de saber desenhar
 * linhas de tabela.
 */
export function RegrasTabela({
  regras,
  podeGerir,
  toggleOcupado,
  onToggle,
  onAbrir,
}: {
  regras: RegraEstatistica[];
  podeGerir: boolean;
  toggleOcupado: boolean;
  onToggle: (id: string, ativo: boolean) => void;
  /** Clicar na linha abre a automação no construtor. */
  onAbrir: (regra: { id: string; nome: string }) => void;
}) {
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
        {regras.map((regra) => (
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
              <span className="block text-[11px] text-muted-foreground md:hidden">
                {moduloDoEvento(regra.event_type)}
              </span>
            </TableCell>
            <TableCell className="hidden md:table-cell">
              <Badge variant="outline" className="font-normal">
                {moduloDoEvento(regra.event_type)}
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
      </TableBody>
    </Table>
  );
}
