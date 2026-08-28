import { CorrerAgoraButton } from '../CorrerAgoraButton';
import { VisaoGeralTab } from '../VisaoGeralTab';
import { HistoricoExecucoes } from './HistoricoExecucoes';

/**
 * Tudo o que é observação num só ecrã: métricas e gráfico em cima, o histórico
 * consolidado por baixo.
 *
 * As antigas tabs Atividade, Fila e Falhas desapareceram como navegação — as
 * três mostravam a mesma fila em fases diferentes, e obrigavam a saltar entre
 * separadores para perceber o percurso de uma execução. Agora são estados na
 * mesma tabela.
 */
export function MonitorizacaoView() {
  return (
    <div className="space-y-6">
      {/* "Correr agora" arranca o motor INTEIRO (todos os scans + rule engine),
          com rate limit de 5 min no servidor. É operação, não edição — por isso
          vive aqui e não na barra do editor. */}
      <div className="flex justify-end">
        <CorrerAgoraButton />
      </div>
      <VisaoGeralTab />
      <HistoricoExecucoes />
    </div>
  );
}
