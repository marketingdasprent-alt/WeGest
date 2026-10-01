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
import { cn } from '@/lib/utils';
import type { GrupoDeRegras } from './agrupamento';
import { identidadeDoEvento, type ModuloIdentidade } from './rotulos';

const N_COLUNAS = 8;

const ROTULO_DA_ACCAO: Record<string, string> = {
  notificacao: 'Enviar notificação',
  email: 'Enviar email',
  automacao_interna: 'Executar acção',
};

// Uma linha de secção preserva o alinhamento das colunas entre módulos.
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

// A ordenação pertence ao agrupamento; cabeçalhos só aparecem com vários grupos.
export function RegrasTabela({
  grupos,
  podeGerir,
  toggleEmCurso,
  onToggle,
  onAbrir,
}: {
  grupos: GrupoDeRegras[];
  podeGerir: boolean;
  toggleEmCurso?: string;
  onToggle: (ids: string[], ativo: boolean) => void;
  onAbrir: (regra: { id: string; nome: string }) => void;
}) {
  const comSeccoes = grupos.length > 1;

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
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
                    // O título não depende apenas da cor para comunicar o estado.
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
                  {/* As acções da automação, sem obrigar a abrir o construtor. */}
                  <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                    {regra.acoes.map((tipo) => ROTULO_DA_ACCAO[tipo] ?? tipo).join(' + ')}
                  </span>
                  <span
                    className="block text-[11px] md:hidden"
                    style={{ color: `hsl(var(${identidadeDoEvento(regra.event_type).token}))` }}
                  >
                    {identidadeDoEvento(regra.event_type).nome}
                  </span>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {/* Reutiliza o token do módulo para manter consistência com o construtor. */}
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
                    // O tempo relativo torna a última execução legível de relance.
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
                    onCheckedChange={(checked) => onToggle(regra.rule_ids, checked)}
                    disabled={
                      !podeGerir ||
                      (toggleEmCurso != null && regra.rule_ids.includes(toggleEmCurso))
                    }
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
