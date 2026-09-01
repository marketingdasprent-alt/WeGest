import { lazy, Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  useAutomacaoEstatisticasPorRegra,
  useToggleAutomationRule,
} from '@/hooks/useAutomationQueue';
import { usePermissions } from '@/hooks/usePermissions';
import { RECURSOS } from '@/utils/permissions';
import { useEditorAutomacao } from './builder/editorAutomacao.contexto';
import { RegrasTabela } from './RegrasTabela';
import { agruparPorModulo, outrasAccoesDoGrupo } from './agrupamento';
import { chaveDoEvento, TODOS_OS_MODULOS } from './rotulos';

/**
 * O conteúdo da tab "Editor visual": a lista de automações ou o canvas.
 *
 * Sem cabeçalho próprio de propósito — era o terceiro cabeçalho empilhado, e
 * dizia o que a tab já diz. O título, o filtro, o alternador e o Guardar vivem
 * todos na barra de acções, uma linha acima.
 */
const FluxoBuilder = lazy(() =>
  import('./builder/FluxoBuilder').then((m) => ({ default: m.FluxoBuilder }))
);

export function RegrasTab() {
  const { canEdit } = usePermissions();
  const podeGerir = canEdit(RECURSOS.AUTOMACOES);
  const { data: regras = [], isLoading } = useAutomacaoEstatisticasPorRegra();
  const toggleRule = useToggleAutomationRule();
  const { toast } = useToast();
  const { vista, moduloFiltro, abrirRegra } = useEditorAutomacao();

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

  if (vista === 'construtor') {
    return (
      <Suspense fallback={<Skeleton className="h-full w-full" />}>
        <FluxoBuilder />
      </Suspense>
    );
  }

  // O filtro guarda a CHAVE do módulo ('viatura'), não o nome legível. Guardava
  // o nome, e o painel de blocos do construtor — que recebe o mesmo valor —
  // compara-o com a chave: nunca coincidiam, e filtrar por módulo deixava a
  // paleta do canvas sem um único gatilho.
  const regrasFiltradas =
    moduloFiltro === TODOS_OS_MODULOS
      ? regras
      : regras.filter((r) => chaveDoEvento(r.event_type) === moduloFiltro);

  // Com um módulo escolhido sobra um grupo, e a tabela não desenha cabeçalhos.
  const grupos = agruparPorModulo(regrasFiltradas);
  // Sobre TODAS as regras, não só as filtradas: uma acção-irmã pode ter
  // ficado fora do módulo escolhido, mas o badge continua a fazer sentido.
  const outrasAccoes = outrasAccoesDoGrupo(regras);

  return (
    // Só esta vista tem scroll próprio: é uma lista. O canvas não scrolla.
    <div className="h-full min-h-0 overflow-y-auto rounded-xl border border-border">
      {isLoading ? (
        <Skeleton className="m-4 h-24" />
      ) : regras.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">Ainda sem regras configuradas.</p>
      ) : regrasFiltradas.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">Nenhuma regra neste módulo.</p>
      ) : (
        <RegrasTabela
          grupos={grupos}
          podeGerir={podeGerir}
          toggleOcupado={toggleRule.isPending}
          onToggle={handleToggle}
          onAbrir={(regra) => abrirRegra(regra.id)}
          outrasAccoes={outrasAccoes}
        />
      )}
    </div>
  );
}
