import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';

import { EditorAutomacaoProvider } from './EditorAutomacaoProvider';
import { useEditorAutomacao } from './editorAutomacao.contexto';
import type { AutomationRuleConfigComGrupo } from '@/hooks/automacao/useAutomationRulesConfig';
import type { RegraEstatistica } from '@/hooks/automacao/useAutomacaoStats';

// ─────────────────────────────────────────────────────────────────────────────
// `useAutomacaoEstatisticasPorRegra` sondeia a cada 30s (refetchInterval) e
// devolve um array NOVO a cada resposta — mesmo quando os números não
// mudaram (`const { data: estatisticas = [] } = ...`). Antes da correcção,
// esse array era dependência directa do efeito de hidratação do canvas: cada
// sondagem recarregava o grafo do zero e qualquer edição por gravar
// desaparecia sem aviso nenhum. Este ficheiro reproduz exactamente essa
// sequência — sondagem com valores iguais, referência nova.
// ─────────────────────────────────────────────────────────────────────────────
let estatisticasDoServidor: RegraEstatistica[] = [];

vi.mock('@/hooks/useAutomationQueue', () => ({
  useAutomacaoEstatisticasPorRegra: () => ({ data: estatisticasDoServidor }),
}));

const GRUPO_R1: AutomationRuleConfigComGrupo[] = [
  {
    id: 'r1',
    nome: 'Seguro a expirar',
    event_type: 'viatura.seguro_expirando',
    condicoes: [],
    acao_tipo: 'notificacao',
    acao_config: { template_codigo: 'zz', titulo: 'Aviso', destinatarios_cargo_ids: ['c1'] },
    cooldown_minutos: 1440,
    grupo_id: 'g1',
    ativo: true,
    org_id: 'org-1',
  },
];

vi.mock('@/hooks/automacao/useAutomationRulesConfig', () => ({
  useGrupoDeRegras: (ruleId: string | null) => ({ data: ruleId ? GRUPO_R1 : undefined }),
  useSincronizarGrupo: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/automacao/useUltimaFalhaDaRegra', () => ({
  useUltimaFalhaDaRegra: () => ({ data: null }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

function wrapper({ children }: { children: ReactNode }) {
  return <EditorAutomacaoProvider>{children}</EditorAutomacaoProvider>;
}

function estatistica(over: Partial<RegraEstatistica> = {}): RegraEstatistica {
  return {
    rule_id: 'r1',
    nome: 'Seguro a expirar',
    event_type: 'viatura.seguro_expirando',
    ativo: true,
    cooldown_minutos: 1440,
    execucoes: 3,
    falhas: 0,
    ultima_execucao: '2026-09-01T10:00:00.000Z',
    duracao_media_ms: 120,
    grupo_id: 'g1',
    acao_tipo: 'notificacao',
    ...over,
  };
}

beforeEach(() => {
  estatisticasDoServidor = [estatistica()];
});

describe('EditorAutomacaoProvider — hidratação do canvas', () => {
  it('não recarrega o canvas quando a sondagem de estatísticas devolve os mesmos números', () => {
    const { result, rerender } = renderHook(() => useEditorAutomacao(), { wrapper });

    act(() => result.current.abrirRegra('r1'));
    expect(result.current.nodes.length).toBeGreaterThan(0);

    // Edição em curso, ainda por gravar.
    act(() => {
      result.current.setNodes(
        result.current.nodes.map((n) => (n.type === 'trigger' ? n : { ...n, position: { x: 999, y: 999 } }))
      );
    });
    const nosEditados = result.current.nodes;
    expect(nosEditados.some((n) => n.position.x === 999)).toBe(true);

    // Sondagem de 30s: mesmos valores, array novo.
    estatisticasDoServidor = [estatistica()];
    rerender();

    expect(result.current.nodes).toBe(nosEditados);
  });

  it('continua a acompanhar estatísticas que mudam de facto', () => {
    const { result, rerender } = renderHook(() => useEditorAutomacao(), { wrapper });

    act(() => result.current.abrirRegra('r1'));
    const noInicial = result.current.nodes.find((n) => n.type === 'accao');
    expect(noInicial?.data).toMatchObject({ duracaoMediaMs: 120 });

    estatisticasDoServidor = [estatistica({ duracao_media_ms: 9000 })];
    rerender();

    const noAtualizado = result.current.nodes.find((n) => n.type === 'accao');
    expect(noAtualizado?.data).toMatchObject({ duracaoMediaMs: 9000 });
  });
});
