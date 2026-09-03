import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  RealFlow,
  RealFlowProvider,
  useRealFlow,
} from '@realflow/react';
import { AnimatePresence } from 'framer-motion';
import { LayoutGrid, Plus, Redo2, Undo2, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ExecucaoDrillDownSheet } from '../ExecucaoDrillDownSheet';
import { IdentidadeDoFluxo } from './IdentidadeDoFluxo';
import { criarNoDoTemplate, templatePorChave, type TemplateDeNo } from './catalogo';
import { useCoresDoCanvas } from './coresDoCanvas';
import type { AutomationEdge } from './dominio/tipos';
import { useEditorAutomacao } from './editorAutomacao.contexto';
import { edgeTypes } from './edges';
import { arrumarFluxo } from './arrumarFluxo';
import { inserirEntre, inserirSolto } from './inserirPasso';
import { nodeTypesBuilder } from './nodes';
import { PainelBlocos } from './PainelBlocos';
import { PainelPropriedades } from './sidebar/PainelPropriedades';
import { validarLigacao } from './validarLigacao';
import { deveIgnorarAtalho } from './atalhosDoCanvas';
import { TODOS_OS_MODULOS } from '../rotulos';
import '@realflow/react/styles.css';

/**
 * O canvas ocupa tudo. Não há painéis laterais permanentes: os blocos entram
 * por um painel que desliza da direita e a configuração abre por cima.
 *
 * Traço contínuo com seta no fim; o tracejado fica reservado a ramos
 * desactivados. A cor vem por prop porque o canvas desenha em SVG e não lê
 * variáveis CSS — ver `coresDoCanvas.ts`.
 */
function arestaPorOmissao(cor: string) {
  return {
    type: 'comMais',
    style: { strokeWidth: 2, stroke: cor },
    markerEnd: { type: 'arrowclosed' as const, color: cor, width: 18, height: 18 },
  };
}

function Construtor() {
  const {
    nodes,
    edges,
    setNodes,
    setEdges,
    onNodesChange,
    onEdgesChange,
    regraId,
    moduloFiltro,
    runADepurar,
    depurar,
    guardar,
    desfazer,
    refazer,
    podeDesfazer,
    podeRefazer,
    setVista,
  } = useEditorAutomacao();
  const cores = useCoresDoCanvas();
  const { fitView, screenToFlow, deleteSelection } = useRealFlow();

  /**
   * O `fitView` da prop só corre na montagem — e nessa altura o canvas ainda
   * está vazio, porque a regra vem de uma query. Sem este reenquadramento, o
   * zoom ficava no que estivesse e a automação aparecia perdida no meio.
   */
  const numeroDeNos = nodes.length;
  useEffect(() => {
    if (numeroDeNos === 0) return;
    // Um frame depois: o React Flow precisa de ter medido os nós para calcular
    // o enquadramento, e antes disso devolve zoom errado.
    const id = requestAnimationFrame(() => {
      fitView({ padding: 0.25, maxZoom: 1 });
    });
    return () => cancelAnimationFrame(id);
  }, [numeroDeNos, regraId, fitView]);

  const [idSeleccionado, setIdSeleccionado] = useState<string | null>(null);
  const [painelAberto, setPainelAberto] = useState(false);
  /** Aresta onde o passo vai entrar; null significa "na ponta". */
  const arestaAlvo = useRef<string | null>(null);
  const sequencia = useRef(0);

  /**
   * Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, e Delete/Backspace para apagar a selecção.
   *
   * A biblioteca traz os três de fábrica via `keyboardShortcuts`, mas esse
   * prop é um interruptor único — ligá-lo também liga o undo/redo *dela*,
   * que discorda do nosso (amarrado à assinatura do fluxo). Por isso o prop
   * fica desligado e os três atalhos são geridos aqui, incluindo o apagar,
   * que a biblioteca continua a fazer bem através de `deleteSelection`.
   *
   * Ignorados enquanto o foco está num campo de texto OU num controlo
   * interactivo (botão, chip, select) — não só `input`/`textarea`. Sem os
   * últimos, clicar em "Guardar", "Testar" ou no "x" de um chip de cargo, e
   * a seguir carregar em Backspace por hábito, apagava o nó que se estava a
   * editar: o foco ficava no botão, não num campo de texto, e o atalho
   * corria à mesma.
   */
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (deveIgnorarAtalho(e.target as HTMLElement | null)) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelection();
        return;
      }
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      if (e.shiftKey) refazer();
      else desfazer();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [desfazer, refazer, deleteSelection]);

  const arrumar = useCallback(() => {
    setNodes(arrumarFluxo(nodes, edges));
    // Depois de mover tudo, o enquadramento anterior deixa de fazer sentido.
    requestAnimationFrame(() => fitView({ padding: 0.25 }));
  }, [nodes, edges, setNodes, fitView]);

  // A biblioteca entrega a aresta já formada — não é preciso o addEdge.
  const onConnect = useCallback(
    (ligacao: AutomationEdge) => setEdges((atuais) => [...atuais, ligacao]),
    [setEdges]
  );

  const abrirPainel = useCallback((arestaId: string | null) => {
    arestaAlvo.current = arestaId;
    // Larga a selecção: os dois painéis partilham o mesmo espaço.
    setIdSeleccionado(null);
    setPainelAberto(true);
  }, []);

  const escolherBloco = useCallback(
    (template: TemplateDeNo) => {
      sequencia.current += 1;
      const alvo = arestaAlvo.current;

      if (alvo) {
        // Nós e arestas na mesma passagem: separá-las deixava o React Flow
        // renderizar um instante com uma aresta a apontar a um nó inexistente.
        const novo = criarNoDoTemplate(template, { x: 0, y: 0 }, sequencia.current);
        const resultado = inserirEntre(nodes, edges, alvo, novo);
        setNodes(resultado.nodes);
        setEdges(resultado.edges);
      } else {
        // Sem aresta-alvo (clicou "Passo" na barra de topo): larga o bloco
        // solto, ao lado do nó mais à direita — o utilizador liga à mão.
        // Com várias acções possíveis por gatilho, "ligar ao último" deixou
        // de ter um único significado correcto.
        const posicao =
          nodes.length === 0
            ? { x: 0, y: 0 }
            : nodes.reduce(
                (maisAFrente, n) => (n.position.x > maisAFrente.x ? n.position : maisAFrente),
                nodes[0].position
              );
        const resultado = inserirSolto(
          nodes,
          { x: posicao.x + 320, y: posicao.y },
          template,
          sequencia.current
        );
        setNodes(resultado.nodes);
      }
      setPainelAberto(false);
    },
    [nodes, edges, setNodes, setEdges]
  );

  /**
   * Aplica o rascunho do painel e grava na mesma passagem.
   *
   * O grafo alterado vai por argumento: chamar guardar() logo a seguir a um
   * setNodes gravava o estado ANTERIOR — a alteração perdia-se sem erro.
   */
  const aplicarEGuardar = useCallback(
    async (id: string, alteracao: Record<string, unknown>) => {
      const alterados = nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...alteracao } } : n
      );
      setNodes(alterados);
      await guardar(alterados);
    },
    [nodes, setNodes, guardar]
  );

  // O `+` de cada ligação chega ao componente da aresta por `data`.
  const arestasComAccao = edges.map((e) => ({
    ...e,
    data: { ...e.data, aoInserir: abrirPainel },
  }));

  const seleccionado = nodes.find((n) => n.id === idSeleccionado) ?? null;
  const gatilho = nodes.find((n) => n.type === 'trigger');
  const dadosDoGatilho = gatilho?.data as
    | { rotulo?: string; eventType?: string | null; ativo?: boolean }
    | undefined;

  return (
    <div
      className="relative h-full min-h-0 overflow-hidden rounded-xl border border-border bg-canvas"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('application/x-wegest-bloco')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(e) => {
        const chave = e.dataTransfer.getData('application/x-wegest-bloco');
        if (!chave) return;
        e.preventDefault();
        const template = templatePorChave(chave);
        if (!template) return;
        sequencia.current += 1;
        const posicao = screenToFlow({ x: e.clientX, y: e.clientY });
        const resultado = inserirSolto(nodes, posicao, template, sequencia.current);
        setNodes(resultado.nodes);
      }}
    >
      <RealFlow
        nodes={nodes}
        edges={arestasComAccao}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        validateConnection={(candidato) => validarLigacao(candidato, nodes, edges)}
        nodeTypes={nodeTypesBuilder}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={arestaPorOmissao(cores.aresta)}
        onNodeClick={(_, no) => {
          setPainelAberto(false);
          setIdSeleccionado(no.id);
        }}
        onPaneClick={() => setIdSeleccionado(null)}
        // Delete/Backspace, undo/redo: geridos no useEffect acima, não aqui —
        // `keyboardShortcuts` é um interruptor único e ligá-lo traria de
        // volta o undo/redo da biblioteca, que discorda do nosso.
        keyboardShortcuts={false}
        fitViewOnInit
        fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
        minZoom={0.3}
        maxZoom={1.5}
      >
        {/* A cor vem do CSS do canvas (ver index.css), não por prop. */}
        <Background variant="dots" gap={18} size={1} />
        <Controls
          position="bottom-left"
          // O undo/redo vive na barra do canvas, com o nosso histórico.
          showUndoRedo={false}
          className="!m-4 overflow-hidden rounded-lg border border-node-border !shadow-md"
        />
        <MiniMap
          position="bottom-right"
          className="!m-4 overflow-hidden rounded-lg border border-node-border shadow-md"
        />
      </RealFlow>

      {gatilho && dadosDoGatilho && (
        <IdentidadeDoFluxo
          nome={dadosDoGatilho.rotulo ?? 'Sem nome'}
          eventType={dadosDoGatilho.eventType ?? null}
          ativa={dadosDoGatilho.ativo !== false}
          onVoltar={() => setVista('tabela')}
        />
      )}

      {nodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
          <Workflow className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm font-medium text-foreground">Escolhe um gatilho para começar</p>
          <Button className="pointer-events-auto" size="sm" onClick={() => abrirPainel(null)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Adicionar passo
          </Button>
        </div>
      ) : (
        // O `+` da ponta: acrescentar ao fim da corrente sem passar por uma
        // ligação existente.
        <div className="absolute right-4 top-4 flex items-center gap-1 rounded-lg border border-node-border bg-panel p-1 shadow-sm">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            title="Desfazer (Ctrl+Z)"
            aria-label="Desfazer"
            disabled={!podeDesfazer}
            onClick={desfazer}
          >
            <Undo2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            title="Refazer (Ctrl+Shift+Z)"
            aria-label="Refazer"
            disabled={!podeRefazer}
            onClick={refazer}
          >
            <Redo2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            title="Arrumar os passos em linha"
            aria-label="Arrumar"
            onClick={arrumar}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </Button>
          <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
          <Button size="sm" className="h-7" onClick={() => abrirPainel(null)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Passo
          </Button>
        </div>
      )}

      {/* O "Depurar" do nó de erro abre o drill-down que já existia na
          monitorização — não uma experiência de debug nova. */}
      <ExecucaoDrillDownSheet runId={runADepurar} onOpenChange={(a) => !a && depurar(null)} />

      {/* Painéis, não modais: o canvas continua a funcionar por baixo — dá
          para arrastar, ampliar e escolher outro passo sem fechar.

          Os dois ocupam o mesmo lugar e nunca se sobrepõem: abrir um fecha o
          outro. Sem `mode="wait"`: os dois saem e entram pela mesma aresta,
          por isso o cruzamento não se vê — e esperar pela saída atrasava a
          abertura o suficiente para parecer um salto. */}
      <AnimatePresence>
        {painelAberto ? (
          <PainelBlocos
            key="blocos"
            onFechar={() => setPainelAberto(false)}
            onEscolher={escolherBloco}
            moduloFiltro={moduloFiltro === TODOS_OS_MODULOS ? undefined : moduloFiltro}
          />
        ) : (
          seleccionado && (
            <PainelPropriedades
              // `key` remonta ao mudar de passo: sem isso o rascunho de um
              // bloco arrastava-se para o seguinte.
              key={seleccionado.id}
              no={seleccionado}
              regraId={regraId}
              onFechar={() => setIdSeleccionado(null)}
              onGuardarFluxo={aplicarEGuardar}
            />
          )
        )}
      </AnimatePresence>
    </div>
  );
}

export function FluxoBuilder() {
  return (
    <RealFlowProvider>
      <Construtor />
    </RealFlowProvider>
  );
}
