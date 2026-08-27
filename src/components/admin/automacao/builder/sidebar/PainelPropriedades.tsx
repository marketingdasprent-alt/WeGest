import { useEffect, useState } from 'react';
import type { AutomationNode as Node } from '../dominio/tipos';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useAutomationRuleConfig } from '@/hooks/automacao/useAutomationRulesConfig';
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

  const alterar = (alteracao: Record<string, unknown>) =>
    setRascunho((r) => ({ ...r, ...alteracao }));

  const guardar = async () => {
    setAGuardar(true);
    try {
      // O corpo vive noutra tabela e não passa pelo gravar da regra.
      if (codigo && template && corpo !== template.corpo) {
        await guardarTemplate.mutateAsync({ codigo, assunto: template.assunto, corpo });
      }
      await onGuardarFluxo(no.id, rascunho);
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
        />
      </div>

      <Separator />
      <div className="flex items-center justify-end gap-2 p-3">
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
