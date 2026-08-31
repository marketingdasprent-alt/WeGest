import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AutomationEdge as Edge, AutomationNode as Node } from './dominio/tipos';
import { useToast } from '@/hooks/use-toast';
import {
  useAtualizarConfigRegra,
  useAutomationRuleConfig,
  type AutomationRuleAcaoConfig,
} from '@/hooks/automacao/useAutomationRulesConfig';
import { useAutomacaoEstatisticasPorRegra } from '@/hooks/useAutomationQueue';
import { useUltimaFalhaDaRegra } from '@/hooks/automacao/useUltimaFalhaDaRegra';
import { Contexto, type EditorAutomacao, type VistaDoEditor } from './editorAutomacao.contexto';
import { assinaturaDoFluxo } from './assinaturaDoFluxo';
import {
  criarPilha,
  desfazer as desfazerPilha,
  podeDesfazer as temPassado,
  podeRefazer as temFuturo,
  refazer as refazerPilha,
  registar,
  type PilhaDeEdicoes,
} from './pilhaDeEdicoes';
import { configDoFluxo } from './configDoFluxo';
import { fluxoDaRegra, type CondicaoGravada } from './fluxoDaRegra';
import { serializarFluxo } from './serializar';
import { TODOS_OS_MODULOS } from '../rotulos';

/**
 * A config sem as chaves de email antigas.
 *
 * Só usada ao gravar uma NOTIFICAÇÃO: `enviar_email` deixou de ser válido aí
 * desde a divisão de 2026-09-01, e o validador do servidor recusa a chave.
 * Uma regra anterior à migração que ainda a tivesse na `acao_config` ficava
 * presa — gravar qualquer alteração seria recusado por um campo que o próprio
 * editor já não escreve.
 */
export function semChavesDeEmailAntigo(
  config: AutomationRuleAcaoConfig
): Omit<
  AutomationRuleAcaoConfig,
  'enviar_email' | 'enviar_email_digest' | 'destinatarios_emails_livres'
> {
  const {
    enviar_email: _enviarEmail,
    enviar_email_digest: _enviarEmailDigest,
    destinatarios_emails_livres: _emailsLivres,
    ...resto
  } = config;
  return resto;
}

export function EditorAutomacaoProvider({ children }: { children: ReactNode }) {
  // `useState` simples em vez dos hooks da biblioteca: o canvas trabalha em
  // modo controlado e devolve o array já actualizado, por isso não é preciso
  // um redutor de `changes` no meio.
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [regraId, setRegraId] = useState<string | null>(null);
  const [vista, setVista] = useState<VistaDoEditor>('tabela');
  const [moduloFiltro, setModuloFiltro] = useState(TODOS_OS_MODULOS);
  const [guardadoEm, setGuardadoEm] = useState<Date | null>(null);
  const [runADepurar, setRunADepurar] = useState<string | null>(null);

  /**
   * Histórico de edição.
   *
   * Guarda o grafo inteiro, mas o passo só é registado quando a ASSINATURA
   * muda — arrastar um bloco não é uma edição para desfazer, pela mesma
   * razão que não acende o badge de alterações por guardar.
   */
  type Instantaneo = { nodes: Node[]; edges: Edge[]; assinatura: string };
  const [pilha, setPilha] = useState<PilhaDeEdicoes<Instantaneo>>(() =>
    criarPilha({ nodes: [], edges: [], assinatura: assinaturaDoFluxo([], []) })
  );
  // Evita registar o que acabou de ser aplicado por desfazer/refazer.
  const aRestaurar = useRef(false);
  const { toast } = useToast();

  const { data: config } = useAutomationRuleConfig(regraId);
  const atualizar = useAtualizarConfigRegra();
  // Mesma query da lista — o React Query devolve a cache, sem pedido novo.
  const { data: estatisticas = [] } = useAutomacaoEstatisticasPorRegra();
  const { data: ultimaFalha = null } = useUltimaFalhaDaRegra(regraId);
  const estatistica = estatisticas.find((e) => e.rule_id === regraId) ?? null;

  /** Assinatura do que está gravado. Comparada com a actual para saber se há alterações. */
  const referencia = useRef<string>(assinaturaDoFluxo([], []));

  /**
   * Carrega a regra escolhida na tabela.
   *
   * Depende da config e não só do id: reagir ao id sozinho limpava o canvas
   * antes de a query responder, e via-se o editor a piscar vazio.
   */
  useEffect(() => {
    if (!regraId || !config) return;

    const condicoes = Array.isArray(config.condicoes)
      ? (config.condicoes as CondicaoGravada[])
      : [];
    const fluxo = fluxoDaRegra({
      ruleId: config.id,
      nome: config.nome,
      eventType: config.event_type,
      cooldownMinutos: config.cooldown_minutos,
      cargoIds: config.acao_config?.destinatarios_cargo_ids ?? [],
      modo: config.acao_config?.destinatarios_modo ?? 'grupo',
      userIds: config.acao_config?.destinatarios_user_ids ?? [],
      condicoes,
      acaoTipo: config.acao_tipo,
      acaoConfig: (config.acao_config ?? {}) as unknown as Record<string, unknown>,
      // Estado vem das estatísticas, não da config: é o que já correu.
      ativo: estatistica?.ativo ?? true,
      ultimaExecucao: estatistica?.ultima_execucao ?? null,
      duracaoMediaMs: estatistica?.duracao_media_ms ?? null,
      falhas: estatistica?.falhas ?? 0,
      ultimaFalha,
    });
    setNodes(fluxo.nodes);
    setEdges(fluxo.edges);
    // Acabado de carregar não é "por guardar": a referência passa a ser isto.
    referencia.current = assinaturaDoFluxo(fluxo.nodes, fluxo.edges);
    setGuardadoEm(null);
  }, [regraId, config, estatistica, ultimaFalha, setNodes, setEdges]);

  const assinatura = assinaturaDoFluxo(nodes, edges);
  const sujo = assinatura !== referencia.current;

  useEffect(() => {
    if (aRestaurar.current) {
      aRestaurar.current = false;
      return;
    }
    setPilha((p) =>
      p.presente.assinatura === assinatura ? p : registar(p, { nodes, edges, assinatura })
    );
  }, [assinatura, nodes, edges]);

  const aplicarInstantaneo = useCallback(
    (proxima: PilhaDeEdicoes<Instantaneo>) => {
      aRestaurar.current = true;
      setPilha(proxima);
      setNodes(proxima.presente.nodes);
      setEdges(proxima.presente.edges);
    },
    [setNodes, setEdges]
  );

  /** Clicar numa linha da tabela é o caminho para editar uma automação. */
  const abrirRegra = useCallback((id: string) => {
    setRegraId(id);
    setVista('construtor');
  }, []);

  /**
   * Canvas limpo para desenhar de raiz.
   *
   * Sem isto, voltar à lista e abrir o construtor mostrava a última automação
   * carregada — parecia que se estava a criar uma nova e estava-se a editar
   * uma existente.
   */
  const novaAutomacao = useCallback(() => {
    setRegraId(null);
    setNodes([]);
    setEdges([]);
    referencia.current = assinaturaDoFluxo([], []);
    setGuardadoEm(null);
    setVista('construtor');
  }, [setNodes, setEdges]);

  // O canvas entrega o array novo; guardá-lo é tudo o que há a fazer.
  const onNodesChange = useCallback((nos: Node[]) => setNodes(nos), []);
  const onEdgesChange = useCallback((ligacoes: Edge[]) => setEdges(ligacoes), []);

  const desfazer = useCallback(
    () => aplicarInstantaneo(desfazerPilha(pilha)),
    [pilha, aplicarInstantaneo]
  );
  const refazer = useCallback(
    () => aplicarInstantaneo(refazerPilha(pilha)),
    [pilha, aplicarInstantaneo]
  );

  const guardar = useCallback(
    async (nosAlterados?: Node[]) => {
      const nos = nosAlterados ?? nodes;
      const payload = serializarFluxo(nos, edges);
      console.log('[WeGest] Automação:', JSON.stringify(payload, null, 2));

      // Sem regra carregada não há onde gravar: criar automações de raiz precisa
      // de um endpoint que ainda não existe.
      if (!regraId || !config) {
        toast({
          title: 'Payload gerado',
          description: 'Criar automações novas ainda não grava — o payload está na consola.',
        });
        return;
      }

      const extraida = configDoFluxo(nos);
      if (!extraida) {
        toast({
          title: 'Nada para guardar',
          description: 'O fluxo precisa de exactamente uma acção — notificação, email ou interna.',
          variant: 'destructive',
        });
        return;
      }

      try {
        await atualizar.mutateAsync({
          id: regraId,
          acaoTipo: extraida.acaoTipo,
          // Uma acção interna SUBSTITUI a config em vez de fundir. Fundir
          // arrastaria `template_codigo`, `destinatarios_*` e o resto da
          // configuração de notificação para dentro de uma acção que não os
          // usa — e o validador do servidor recusa chaves que não conhece.
          //
          // Notificação e email continuam a FUNDIR: o editor não mostra tudo o
          // que lá está (ex.: `enviar_email_digest`, sem controlo na UI), e
          // substituir apagava em silêncio o que não mostra.
          acaoConfig: extraida.acaoInterna
            ? extraida.acaoInterna
            : {
                // `enviar_email` deixou de ser válido numa notificação — o
                // email tem acção própria desde 2026-09-01, e o validador do
                // servidor recusa a chave. Uma regra anterior à divisão que
                // ainda a tivesse perde-a aqui; uma acção de email nunca a
                // teve. `enviar_email_digest` sai com ela só para
                // notificação — para email continua válido.
                ...(extraida.acaoTipo === 'notificacao'
                  ? semChavesDeEmailAntigo(config.acao_config)
                  : config.acao_config),
                destinatarios_cargo_ids: extraida.cargoIds,
                // O editor passou a cobrir a escolha de pessoas — já não há
                // Sheet separada a escrevê-las por trás.
                destinatarios_modo: extraida.modo,
                destinatarios_user_ids: extraida.userIds,
                // Só entra quando a acção É de email — extraida.emailsLivres
                // é null nos outros tipos precisamente para isto nunca correr.
                ...(extraida.emailsLivres !== null
                  ? { destinatarios_emails_livres: extraida.emailsLivres }
                  : {}),
              },
          cooldownMinutos: extraida.cooldownMinutos,
          condicoes: extraida.condicoes,
        });
        referencia.current = assinaturaDoFluxo(nos, edges);
        setGuardadoEm(new Date());
      } catch (erro) {
        toast({
          title: 'Erro',
          description: erro instanceof Error ? erro.message : 'Não foi possível guardar.',
          variant: 'destructive',
        });
      }
    },
    [nodes, edges, regraId, config, atualizar, toast]
  );

  const valor = useMemo<EditorAutomacao>(
    () => ({
      nodes,
      edges,
      onNodesChange,
      onEdgesChange,
      setNodes,
      setEdges,
      regraId,
      abrirRegra,
      novaAutomacao,
      desfazer,
      refazer,
      podeDesfazer: temPassado(pilha),
      podeRefazer: temFuturo(pilha),
      runADepurar,
      depurar: setRunADepurar,
      vista,
      setVista,
      moduloFiltro,
      setModuloFiltro,
      sujo,
      guardadoEm,
      guardar,
      aGuardar: atualizar.isPending,
      podeGuardar: nodes.length > 0,
    }),
    [
      nodes,
      edges,
      onNodesChange,
      onEdgesChange,
      setNodes,
      setEdges,
      regraId,
      abrirRegra,
      novaAutomacao,
      desfazer,
      refazer,
      pilha,
      runADepurar,
      vista,
      moduloFiltro,
      sujo,
      guardadoEm,
      guardar,
      atualizar.isPending,
    ]
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}
