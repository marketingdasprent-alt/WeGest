import { Eye, EyeOff, AlertTriangle, Info, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  AMBIENTES_SERVICO,
  EMPRESAS_SERVICO_DICA,
  METODOS_PAGAMENTO_SERVICO,
  type AmbienteServico,
  type ErrosServicoPrimavera,
  type MetodoPagamentoServico,
} from './faturacaoIntegracaoConfig';

interface ServicoProps {
  /** Integração gravada com o agente antigo (sem endereço do serviço). */
  integracaoAntiga?: boolean;
  servicoUrl: string;
  onServicoUrlChange: (v: string) => void;
  ambiente: AmbienteServico | '';
  onAmbienteChange: (v: AmbienteServico) => void;
  empresa: string;
  onEmpresaChange: (v: string) => void;
  metodoPagamento: MetodoPagamentoServico;
  onMetodoPagamentoChange: (v: MetodoPagamentoServico) => void;
  apiKey: string;
  onApiKeyChange: (v: string) => void;
  showKey: boolean;
  onToggleShowKey: () => void;
  /** Só há mensagens depois de uma tentativa de testar ou guardar. */
  erros: ErrosServicoPrimavera;
  /** Resposta do servidor ao "Testar ligação", mostrada tal como vem. */
  resultadoTeste: { ok: boolean; mensagem: string } | null;
  disabled?: boolean;
}

function MensagemErro({ id, texto }: { id: string; texto?: string }) {
  if (!texto) return null;
  return (
    <p id={id} role="alert" className="text-xs font-medium text-destructive">
      {texto}
    </p>
  );
}

/** Campos do Primavera pelo serviço. O ambiente nunca vem pré-escolhido. */
export function PrimaveraServicoFields({
  integracaoAntiga,
  servicoUrl,
  onServicoUrlChange,
  ambiente,
  onAmbienteChange,
  empresa,
  onEmpresaChange,
  metodoPagamento,
  onMetodoPagamentoChange,
  apiKey,
  onApiKeyChange,
  showKey,
  onToggleShowKey,
  erros,
  resultadoTeste,
  disabled,
}: ServicoProps) {
  return (
    <div className="space-y-4">
      {integracaoAntiga && (
        <div
          role="status"
          className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 translate-y-0.5" />
          <p>
            Esta integração usava o agente antigo, que já não existe. Preencha o serviço e guarde.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="primavera-servico-url">
          Endereço do serviço <span className="text-destructive">*</span>
        </Label>
        <Input
          id="primavera-servico-url"
          type="url"
          inputMode="url"
          placeholder="https://primavera.exemplo.pt"
          value={servicoUrl}
          onChange={(e) => onServicoUrlChange(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          disabled={disabled}
          aria-invalid={!!erros.servicoUrl}
          aria-describedby={erros.servicoUrl ? 'primavera-servico-url-erro' : undefined}
        />
        <MensagemErro id="primavera-servico-url-erro" texto={erros.servicoUrl} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="primavera-ambiente">
          Ambiente <span className="text-destructive">*</span>
        </Label>
        <Select
          value={ambiente || undefined}
          onValueChange={(v) => onAmbienteChange(v as AmbienteServico)}
          disabled={disabled}
        >
          <SelectTrigger
            id="primavera-ambiente"
            aria-invalid={!!erros.ambiente}
            aria-describedby={erros.ambiente ? 'primavera-ambiente-erro' : undefined}
          >
            <SelectValue placeholder="Escolha o ambiente" />
          </SelectTrigger>
          <SelectContent>
            {AMBIENTES_SERVICO.map((a) => (
              <SelectItem key={a.valor} value={a.valor}>
                {a.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <MensagemErro id="primavera-ambiente-erro" texto={erros.ambiente} />
        {ambiente === 'producao' && (
          <div
            role="status"
            className="flex gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-xs font-medium text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 translate-y-0.5" />
            <p>Esta integração emite documentos fiscais reais.</p>
          </div>
        )}
        {ambiente === 'teste' && (
          <div
            role="status"
            className="flex gap-2 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground"
          >
            <Info className="h-3.5 w-3.5 shrink-0 translate-y-0.5" />
            <p>Os documentos de teste não têm valor fiscal.</p>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="primavera-empresa">
          Empresa no serviço <span className="text-destructive">*</span>
        </Label>
        <Input
          id="primavera-empresa"
          placeholder="Ex.: dasprent"
          value={empresa}
          onChange={(e) => onEmpresaChange(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          disabled={disabled}
          aria-invalid={!!erros.empresa}
          aria-describedby={
            erros.empresa
              ? 'primavera-empresa-erro primavera-empresa-ajuda'
              : 'primavera-empresa-ajuda'
          }
        />
        <MensagemErro id="primavera-empresa-erro" texto={erros.empresa} />
        <p id="primavera-empresa-ajuda" className="text-xs text-muted-foreground">
          Código curto, em minúsculas, que faz parte do endereço do serviço (
          <span className="font-mono">/empresa/faturas</span>). {EMPRESAS_SERVICO_DICA}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="primavera-metodo">Método de pagamento</Label>
        <Select
          value={metodoPagamento}
          onValueChange={(v) => onMetodoPagamentoChange(v as MetodoPagamentoServico)}
          disabled={disabled}
        >
          <SelectTrigger id="primavera-metodo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {METODOS_PAGAMENTO_SERVICO.map((m) => (
              <SelectItem key={m.valor} value={m.valor}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Usado nos recibos e nas faturas-recibo emitidos por esta integração.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="primavera-chave-servico">
          Chave do serviço <span className="text-destructive">*</span>
        </Label>
        <div className="relative">
          <Input
            id="primavera-chave-servico"
            type={showKey ? 'text' : 'password'}
            placeholder="Cole aqui a chave do serviço"
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            className="pr-11"
            aria-invalid={!!erros.chave}
            aria-describedby={erros.chave ? 'primavera-chave-servico-erro' : undefined}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-2 top-1/2 h-7 w-7 -translate-y-1/2"
            onClick={onToggleShowKey}
            aria-label={showKey ? 'Ocultar a chave' : 'Mostrar a chave'}
            aria-pressed={showKey}
          >
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
        <MensagemErro id="primavera-chave-servico-erro" texto={erros.chave} />
        <p className="text-xs text-muted-foreground">
          É a chave que o serviço do Primavera dá a esta empresa. Não é gerada pelo WeGest.
        </p>
      </div>

      {resultadoTeste && (
        <div
          role={resultadoTeste.ok ? 'status' : 'alert'}
          className={cn(
            'flex gap-2 rounded-md border p-3 text-xs',
            resultadoTeste.ok
              ? 'border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950/40 dark:text-green-200'
              : 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200'
          )}
        >
          {resultadoTeste.ok ? (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 translate-y-0.5" />
          ) : (
            <XCircle className="h-3.5 w-3.5 shrink-0 translate-y-0.5" />
          )}
          <p className="min-w-0 break-words">{resultadoTeste.mensagem}</p>
        </div>
      )}
    </div>
  );
}
