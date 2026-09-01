import { useEffect, useState } from 'react';
import type { AutomationNode as Node } from '../dominio/tipos';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useAutomationRuleConfig, useTestarRegra } from '@/hooks/automacao/useAutomationRulesConfig';
import { useUltimoPayloadDaRegra } from '@/hooks/automacao/useUltimoPayloadDaRegra';
import { useGuardarTemplate, useTemplateDaRegra } from '@/hooks/automacao/useTemplateDaRegra';
import { useToast } from '@/hooks/use-toast';
import { visualDoBloco } from '../catalogo';
import { CamposDoPasso } from './CamposDoPasso';
import { CabecalhoDoPasso } from './CabecalhoDoPasso';

/**
 * Painel de propriedades do passo seleccionado.
 *
 * Desliza da direita e o canvas continua vivo por baixo — não há overlay a
 * bloquear, ao contrário do modal que isto substitui. Dá para arrastar,
 * ampliar e escolher outro nó sem fechar o painel.
 *
 * As alterações ficam num rascunho local até `Guardar`. Sem isso, `Cancelar`
 * não tinha o que cancelar: o canvas já estaria alterado.
 */
export function PainelPropriedades({
  no,
  regraId,
  onFechar,
  onGuardarFluxo,
}: {
  no: Node;
  regraId: string | null;
  onFechar: () => void;
  /** Aplica ao canvas E persiste, numa só passagem. */
  onGuardarFluxo: (id: string, alteracao: Record<string, unknown>) => Promise<void>;
}) {
  const { toast } = useToast();
  const { data: config } = useAutomationRuleConfig(regraId);
  const { data: payload = null } = useUltimoPayloadDaRegra(regraId);
  const codigo = config?.acao_config?.template_codigo ?? null;
  const { data: template } = useTemplateDaRegra(codigo);
  const guardarTemplate = useGuardarTemplate();
  const testar = useTestarRegra();

  // Inicializado na montagem, não num efeito: com um efeito, o primeiro
  // render tinha o rascunho vazio e a secção de destinatários nem existia.
  // O componente é remontado por `key` quando se muda de passo.
  const [rascunho, setRascunho] = useState<Record<string, unknown>>(() => ({
    ...(no.data as Record<string, unknown>),
  }));
  const [corpo, setCorpo] = useState('');
  const [aGuardar, setAGuardar] = useState(false);

  // O corpo vem de outra tabela e chega depois — daí ainda precisar de efeito.
  useEffect(() => setCorpo(template?.corpo ?? ''), [template?.corpo]);

  const visual = visualDoBloco(
    (no.type ?? 'accao') as 'trigger' | 'condicao' | 'accao',
    rascunho as { modulo?: string; accao?: string }
  );

  const acaoTipo = (rascunho.acaoTipo as string) ?? 'notificacao';
  const podeTestar = no.type === 'accao' && (acaoTipo === 'notificacao' || acaoTipo === 'email');

  const alterar = (alteracao: Record<string, unknown>) =>
    setRascunho((r) => ({ ...r, ...alteracao }));

  // O corpo vive noutra tabela e não passa pelo gravar da regra — partilhado
  // entre `guardar` (fecha o painel a seguir) e `testarAgora` (continua para
  // o teste em vez de fechar).
  const persistir = async () => {
    if (codigo && template && corpo !== template.corpo) {
      await guardarTemplate.mutateAsync({ codigo, assunto: template.assunto, corpo });
    }
    await onGuardarFluxo(no.id, rascunho);
  };

  const guardar = async () => {
    setAGuardar(true);
    try {
      await persistir();
      onFechar();
    } catch (erro) {
      toast({
        title: 'Erro',
        description: erro instanceof Error ? erro.message : 'Não foi possível guardar.',
        variant: 'destructive',
      });
    } finally {
      setAGuardar(false);
    }
  };

  const testarAgora = async () => {
    if (!regraId) return;
    setAGuardar(true);
    try {
      await persistir();
    } catch (erro) {
      toast({
        title: 'Erro',
        description: erro instanceof Error ? erro.message : 'Não foi possível guardar.',
        variant: 'destructive',
      });
      setAGuardar(false);
      return;
    }
    try {
      const resultado = await testar.mutateAsync(regraId);
      const nomes = resultado.destinatarios_reais.slice(0, 3).map((d) => d.nome);
      const resto = resultado.destinatarios_reais.length - nomes.length;
      const listaDestinatarios =
        nomes.length > 0
          ? `Iria também para: ${nomes.join(', ')}${resto > 0 ? ` e mais ${resto}` : ''}.`
          : 'Ninguém mais está configurado para receber.';
      toast({
        title: `Teste enviado${resultado.email_enviado ? ' por email' : ''}.`,
        description: `${resultado.email_teste ? `Para ${resultado.email_teste}. ` : ''}${listaDestinatarios}`,
      });
    } catch (erro) {
      toast({
        title: 'Não foi possível testar',
        description: erro instanceof Error ? erro.message : 'Erro desconhecido.',
        variant: 'destructive',
      });
    } finally {
      setAGuardar(false);
    }
  };

  return (
    <motion.aside
      initial={{ x: '100%', opacity: 0.6 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0.6 }}
      transition={{ type: 'tween', duration: 0.18, ease: 'easeOut' }}
      role="complementary"
      aria-label="Propriedades do passo"
      className="absolute inset-y-0 right-0 z-10 flex w-full max-w-[380px] flex-col border-l border-node-border bg-panel shadow-xl sm:w-[380px]"
    >
      {/* Liga visualmente o painel ao nó que está a editar — a mesma cor do
          chip do cabeçalho, só que espalhada pela largura toda. */}
      <div className="h-1 shrink-0" style={{ backgroundColor: `hsl(var(${visual.cor}))` }} />
      <div className="flex items-start justify-between gap-2 border-b border-node-border p-4">
        <CabecalhoDoPasso
          cor={visual.cor}
          Icone={visual.Icone}
          tipo={no.type ?? 'accao'}
          nome={String(rascunho.rotulo ?? '')}
        />
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onFechar}>
          <X className="h-4 w-4" />
          <span className="sr-only">Fechar painel</span>
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <CamposDoPasso
          tipo={no.type ?? 'accao'}
          noId={no.id}
          dados={rascunho}
          onAlterar={alterar}
          payload={payload}
          corpo={corpo}
          onCorpo={setCorpo}
          regrasQueUsam={template?.regrasQueUsam ?? 0}
          assuntoDoTemplate={template?.assunto ?? ''}
          // O evento é da REGRA, não deste passo: é ele que decide que campos
          // podem ser condição e que acções fazem sentido. Ler do nó do
          // gatilho obrigaria o painel a conhecer o canvas inteiro.
          eventType={config?.event_type}
        />
      </div>

      <Separator />
      <div className="flex items-center justify-end gap-2 p-3">
        {podeTestar && (
          <Button
            variant="outline"
            size="sm"
            onClick={testarAgora}
            disabled={aGuardar || !payload}
            title={!payload ? 'Esta automação ainda não correu — não há dados para testar.' : undefined}
          >
            Testar
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onFechar} disabled={aGuardar}>
          Cancelar
        </Button>
        <Button size="sm" onClick={guardar} disabled={aGuardar}>
          {aGuardar ? 'A guardar…' : 'Guardar'}
        </Button>
      </div>
    </motion.aside>
  );
}
