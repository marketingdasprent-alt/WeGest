import { Plus, Save, Table2, Workflow } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/usePermissions';
import { RECURSOS } from '@/utils/permissions';
import { useAutomacaoEstatisticasPorRegra } from '@/hooks/useAutomationQueue';
import { contagemPorModulo } from '../agrupamento';
import { ChipsDeModulo } from '../ChipsDeModulo';
import { useEditorAutomacao, type VistaDoEditor } from './editorAutomacao.contexto';

/**
 * Estado de gravação + Guardar, na mesma linha das tabs.
 *
 * Substitui a frase "Ainda não grava no servidor" que estava no subtítulo: em
 * vez de um aviso permanente que ninguém lê ao fim de dois dias, o badge diz o
 * que se passa AGORA com este fluxo.
 */
function horaCurta(d: Date): string {
  return d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
}

export function BarraAccoes() {
  const {
    sujo,
    guardadoEm,
    guardar,
    aGuardar,
    podeGuardar,
    vista,
    setVista,
    moduloFiltro,
    setModuloFiltro,
    novaAutomacao,
  } = useEditorAutomacao();
  // A mesma query da tabela — o React Query devolve a cache, não pede outra vez.
  const { data: regras = [] } = useAutomacaoEstatisticasPorRegra();
  // Já vem pela ordem das secções — chips e lista não podem discordar sobre
  // qual é o primeiro módulo.
  const contagens = contagemPorModulo(regras);
  const { canEdit } = usePermissions();
  const podeGerir = canEdit(RECURSOS.AUTOMACOES);

  if (!podeGerir) return null;

  return (
    <>
      {/* O filtro só faz sentido sobre a lista; no canvas não há o que filtrar.
          Com um módulo só, os chips não decidem nada e ocupavam espaço. */}
      {vista === 'tabela' && contagens.length > 1 && (
        <ChipsDeModulo
          contagens={contagens}
          valor={moduloFiltro}
          onEscolher={setModuloFiltro}
          total={regras.length}
        />
      )}

      {/* Sem esta porta de entrada, abrir o construtor pela lista mostrava a
          última automação carregada — parecia que se estava a criar uma nova
          e estava-se a editar uma existente. */}
      {vista === 'tabela' && (
        <Button size="sm" variant="outline" onClick={novaAutomacao}>
          <Plus className="mr-1.5 h-4 w-4" />
          Nova automação
        </Button>
      )}

      <ToggleGroup
        type="single"
        value={vista}
        // `type="single"` devolve '' ao carregar no item já activo; sem o
        // guarda, o segundo clique deixava a vista em branco.
        onValueChange={(v) => v && setVista(v as VistaDoEditor)}
        variant="outline"
        size="sm"
      >
        <ToggleGroupItem value="tabela" aria-label="Ver a lista de automações">
          <Table2 className="h-4 w-4" />
        </ToggleGroupItem>
        <ToggleGroupItem value="construtor" aria-label="Ver o editor visual">
          <Workflow className="h-4 w-4" />
        </ToggleGroupItem>
      </ToggleGroup>

      {vista === 'construtor' && sujo ? (
        <Badge variant="outline" className="border-warning/40 text-warning">
          Alterações por guardar
        </Badge>
      ) : (
        vista === 'construtor' &&
        guardadoEm && (
          <Badge variant="outline" className="text-muted-foreground">
            Guardado às {horaCurta(guardadoEm)}
          </Badge>
        )
      )}

      {vista === 'construtor' && (
        <Button
          size="sm" // Sem a seta, o evento do rato ia como se fosse o grafo alterado.
          onClick={() => void guardar()}
          disabled={!podeGuardar || aGuardar}
        >
          <Save className="mr-1.5 h-3.5 w-3.5" />
          {aGuardar ? 'A guardar…' : 'Guardar'}
        </Button>
      )}
    </>
  );
}
