import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Settings2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { useAutomacaoEstatisticasPorRegra, useToggleAutomationRule } from '@/hooks/useAutomationQueue';
import { usePermissions } from '@/hooks/usePermissions';
import { RECURSOS } from '@/utils/permissions';
import { ConfigurarRegraSheet } from './ConfigurarRegraSheet';

const MODULOS_REGRA: Record<string, string> = {
  viatura: 'Viaturas',
  motorista: 'Motoristas',
  cobranca: 'Financeiro',
  contrato_renting: 'Renting',
  utilizador: 'Utilizadores',
};

function moduloDaRegra(eventType: string): string {
  const prefixo = eventType.split('.')[0];
  return MODULOS_REGRA[prefixo] ?? 'Outros';
}

export function RegrasTab() {
  const { canEdit } = usePermissions();
  const podeGerir = canEdit(RECURSOS.AUTOMACOES);
  const { data: regras = [], isLoading } = useAutomacaoEstatisticasPorRegra();
  const toggleRule = useToggleAutomationRule();
  const { toast } = useToast();
  const [moduloFiltro, setModuloFiltro] = useState('todos');
  const [regraAConfigurar, setRegraAConfigurar] = useState<{ id: string; nome: string } | null>(
    null
  );

  const handleToggle = async (id: string, ativo: boolean) => {
    try {
      await toggleRule.mutateAsync({ id, ativo });
      toast({ title: ativo ? 'Regra ligada' : 'Regra desligada' });
    } catch (error) {
      toast({
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Não foi possível atualizar a regra.',
        variant: 'destructive',
      });
    }
  };

  const modulosPresentes = Array.from(
    new Set(regras.map((r) => moduloDaRegra(r.event_type)))
  ).sort();
  const regrasFiltradas =
    moduloFiltro === 'todos'
      ? regras
      : regras.filter((r) => moduloDaRegra(r.event_type) === moduloFiltro);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Estatísticas por automação</CardTitle>
            <CardDescription>
              Execuções, falhas e duração média de cada regra — liga ou desliga aqui.
            </CardDescription>
          </div>
          {modulosPresentes.length > 1 && (
            <Select value={moduloFiltro} onValueChange={setModuloFiltro}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Módulo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os módulos</SelectItem>
                {modulosPresentes.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : regras.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ainda sem regras configuradas.</p>
        ) : regrasFiltradas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma regra neste módulo.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Automação</TableHead>
                <TableHead>Módulo</TableHead>
                <TableHead>Execuções</TableHead>
                <TableHead>Última execução</TableHead>
                <TableHead>Tempo médio</TableHead>
                <TableHead>Falhas</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Destinatários</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {regrasFiltradas.map((regra) => (
                <TableRow key={regra.rule_id}>
                  <TableCell className="font-medium">{regra.nome}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{moduloDaRegra(regra.event_type)}</Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">{regra.execucoes}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {regra.ultima_execucao
                      ? format(parseISO(regra.ultima_execucao), 'dd MMM HH:mm', { locale: pt })
                      : '—'}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {regra.duracao_media_ms != null
                      ? `${(regra.duracao_media_ms / 1000).toFixed(1)}s`
                      : '—'}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    <Badge variant={regra.falhas > 0 ? 'destructive' : 'secondary'}>
                      {regra.falhas}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={regra.ativo}
                      onCheckedChange={(checked) => handleToggle(regra.rule_id, checked)}
                      disabled={!podeGerir || toggleRule.isPending}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!podeGerir}
                      onClick={() => setRegraAConfigurar({ id: regra.rule_id, nome: regra.nome })}
                    >
                      <Settings2 className="h-3.5 w-3.5 mr-1.5" />
                      Configurar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <ConfigurarRegraSheet
        regra={regraAConfigurar}
        onOpenChange={(open) => !open && setRegraAConfigurar(null)}
      />
    </Card>
  );
}
