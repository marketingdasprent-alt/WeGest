import type { AutomationEdge as Edge, AutomationNode as Node } from './dominio/tipos';
import { moduloDoEventType } from './catalogo';

export interface CondicaoGravada {
  campo: string;
  operador: string;
  valor: string | number | boolean;
}

export interface FalhaConhecida {
  runId: string;
  erro: string;
  quando: string;
}

export interface RegraParaEditar {
  ruleId: string;
  nome: string;
  eventType: string;
  cooldownMinutos: number;
  cargoIds: string[];
  modo: 'grupo' | 'individual';
  userIds: string[];
  condicoes: CondicaoGravada[];
  acaoTipo: string;
  // Preserve toda a configuração para não apagar campos ainda sem painel.
  acaoConfig: Record<string, unknown>;
  ativo: boolean;
  ultimaExecucao: string | null;
  duracaoMediaMs: number | null;
  falhas: number;
  ultimaFalha: FalhaConhecida | null;
}

const PASSO_X = 320;

function ligar(origem: string, destino: string): Edge {
  return { id: `${origem}--${destino}`, source: origem, target: destino };
}

function estadoDaAccao(regra: RegraParaEditar): 'normal' | 'sucesso' | 'erro' {
  if (regra.ultimaFalha) return 'erro';
  if (regra.ultimaExecucao) return 'sucesso';
  return 'normal';
}

// Regras-irmãs partilham o gatilho, mas mantêm condições próprias por `ruleId`.
export function fluxoDaRegra(regras: RegraParaEditar[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const primeira = regras[0];
  const idGatilho = `trigger-${primeira.ruleId}`;
  nodes.push({
    id: idGatilho,
    type: 'trigger',
    position: { x: 0, y: 0 },
    data: {
      modulo: moduloDoEventType(primeira.eventType),
      rotulo: primeira.nome,
      eventType: primeira.eventType,
      ativo: regras.some((r) => r.ativo),
    },
  });

  let passoY = 0;

  for (const regra of regras) {
    let passo = 1;
    let anterior = idGatilho;

    regra.condicoes.forEach((condicao, i) => {
      // O índice impede que condições repetidas colidam no React Flow.
      const id = `condicao-${regra.ruleId}-${i}`;
      nodes.push({
        id,
        type: 'condicao',
        position: { x: passo * PASSO_X, y: passoY },
        data: {
          rotulo: 'Só se',
          campo: condicao.campo,
          operador: condicao.operador,
          valor: condicao.valor,
        },
      });
      edges.push(ligar(anterior, id));
      anterior = id;
      passo += 1;
    });

    const idAccao = `accao-${regra.ruleId}`;
    nodes.push({
      id: idAccao,
      type: 'accao',
      position: { x: passo * PASSO_X, y: passoY },
      data: {
        accao:
          regra.acaoTipo === 'automacao_interna'
            ? ((regra.acaoConfig.accao as string) ?? '')
            : regra.acaoTipo === 'email'
              ? 'email'
              : 'notificacao',
        acaoTipo: regra.acaoTipo,
        rotulo:
          regra.acaoTipo === 'automacao_interna'
            ? 'Executar acção'
            : regra.acaoTipo === 'email'
              ? 'Enviar email'
              : 'Enviar notificação',
        campo: (regra.acaoConfig.campo as string) ?? '',
        valor: (regra.acaoConfig.valor as string) ?? '',
        cargoIds: regra.cargoIds,
        modo: regra.modo,
        userIds: regra.userIds,
        emailsLivres: (regra.acaoConfig.destinatarios_emails_livres as string[] | undefined) ?? [],
        cooldownMinutos: regra.cooldownMinutos,
        ativo: regra.ativo,
        estado: estadoDaAccao(regra),
        ultimaExecucao: regra.ultimaExecucao,
        duracaoMediaMs: regra.duracaoMediaMs,
      },
    });
    edges.push(ligar(anterior, idAccao));
    passo += 1;

    if (regra.ultimaFalha) {
      const idErro = `erro-${regra.ruleId}`;
      nodes.push({
        id: idErro,
        type: 'erro',
        position: { x: passo * PASSO_X, y: passoY },
        data: {
          runId: regra.ultimaFalha.runId,
          erro: regra.ultimaFalha.erro,
          quando: regra.ultimaFalha.quando,
          falhas: regra.falhas,
        },
      });
      edges.push(ligar(idAccao, idErro));
    }

    passoY += 160;
  }

  return { nodes, edges };
}
