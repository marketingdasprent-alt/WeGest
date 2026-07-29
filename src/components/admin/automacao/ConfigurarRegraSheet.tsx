import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  useAutomationRuleConfig,
  useCargosDisponiveis,
  useUtilizadoresPorCargo,
  useAtualizarConfigRegra,
  type AutomationRuleAcaoConfig,
  type UtilizadorPorCargo,
} from '@/hooks/useAutomationQueue';
import { usePermissions } from '@/hooks/usePermissions';
import { RECURSOS } from '@/utils/permissions';

// Referência estável — um `[]` inline como default de desestruturação cria
// um array novo a cada render, o que fazia o useEffect de limpeza (que
// depende de utilizadoresDoCargo) disparar para sempre.
const SEM_UTILIZADORES: UtilizadorPorCargo[] = [];

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeiras = partes.length > 1 ? [partes[0], partes[partes.length - 1]] : [partes[0]];
  return primeiras.map((p) => p[0]?.toUpperCase() ?? '').join('');
}

export function ConfigurarRegraSheet({
  regra,
  onOpenChange,
}: {
  regra: { id: string; nome: string } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const { canEdit } = usePermissions();
  const podeGerir = canEdit(RECURSOS.AUTOMACOES);
  const { data: config, isLoading } = useAutomationRuleConfig(regra?.id ?? null);
  const { data: cargos = [] } = useCargosDisponiveis();
  const atualizar = useAtualizarConfigRegra();

  const [destinatariosCargoIds, setDestinatariosCargoIds] = useState<string[]>([]);
  const [destinatariosModo, setDestinatariosModo] = useState<'grupo' | 'individual'>('grupo');
  const [destinatariosUserIds, setDestinatariosUserIds] = useState<string[]>([]);
  const { data: utilizadoresDoCargo = SEM_UTILIZADORES } =
    useUtilizadoresPorCargo(destinatariosCargoIds);
  const [enviarEmail, setEnviarEmail] = useState(false);
  const [enviarEmailDigest, setEnviarEmailDigest] = useState(false);
  const [cooldownMinutos, setCooldownMinutos] = useState(0);

  useEffect(() => {
    if (!config) return;
    setDestinatariosCargoIds(config.acao_config.destinatarios_cargo_ids ?? []);
    setDestinatariosModo(config.acao_config.destinatarios_modo ?? 'grupo');
    setDestinatariosUserIds(config.acao_config.destinatarios_user_ids ?? []);
    setEnviarEmail(config.acao_config.enviar_email ?? false);
    setEnviarEmailDigest(config.acao_config.enviar_email_digest ?? false);
    setCooldownMinutos(config.cooldown_minutos);
  }, [config]);

  // Se um cargo for desmarcado, tira também da seleção individual quem já
  // não pertence a nenhum dos cargos escolhidos (evita lixo escondido).
  useEffect(() => {
    setDestinatariosUserIds((prev) =>
      prev.filter((id) => utilizadoresDoCargo.some((u) => u.id === id))
    );
  }, [utilizadoresDoCargo]);

  const handleGuardar = async () => {
    if (!regra || !config) return;
    if (!podeGerir) {
      toast({
        title: 'Sem permissão',
        description: 'Não tens permissão para configurar automações.',
        variant: 'destructive',
      });
      return;
    }
    const novoAcaoConfig: AutomationRuleAcaoConfig = {
      ...config.acao_config,
      destinatarios_cargo_ids: destinatariosCargoIds,
      destinatarios_estrategia: 'cargo',
      destinatarios_modo: destinatariosModo,
      destinatarios_user_ids: destinatariosModo === 'individual' ? destinatariosUserIds : undefined,
      enviar_email: enviarEmail,
      enviar_email_digest: enviarEmail ? enviarEmailDigest : false,
    };
    try {
      await atualizar.mutateAsync({ id: regra.id, acaoConfig: novoAcaoConfig, cooldownMinutos });
      toast({ title: 'Configuração guardada' });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Erro',
        description:
          error instanceof Error ? error.message : 'Não foi possível guardar a configuração.',
        variant: 'destructive',
      });
    }
  };

  const cooldownTexto =
    cooldownMinutos <= 0
      ? 'Sem cooldown — reage sempre que a condição for satisfeita'
      : cooldownMinutos % 1440 === 0
        ? `${cooldownMinutos / 1440} dia(s)`
        : cooldownMinutos % 60 === 0
          ? `${cooldownMinutos / 60} hora(s)`
          : `${cooldownMinutos} minuto(s)`;

  return (
    <Sheet open={!!regra} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col">
        <SheetHeader className="shrink-0">
          <SheetTitle>Configurar: {regra?.nome}</SheetTitle>
          <SheetDescription>Quem recebe esta automação e com que frequência</SheetDescription>
        </SheetHeader>

        {isLoading || !config ? (
          <Skeleton className="mt-6 h-64 w-full" />
        ) : (
          <div className="mt-6 min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label>Grupos que recebem (além dos admins)</Label>
              <div className="flex flex-wrap gap-2">
                {cargos.map((c) => {
                  const selecionado = destinatariosCargoIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={selecionado}
                      onClick={() =>
                        setDestinatariosCargoIds((prev) =>
                          selecionado ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                        )
                      }
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                        selecionado
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                      )}
                    >
                      {c.nome}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Quem pertencer a um destes grupos (Definições → Grupos) recebe a notificação, além
                de qualquer administrador.
              </p>
            </div>

            {destinatariosCargoIds.length > 0 && (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label className="text-sm">Escolher pessoas específicas</Label>
                  <p className="text-xs text-muted-foreground">
                    Em vez de todos os utilizadores destes grupos, escolhe só quem deve receber.
                  </p>
                </div>
                <Switch
                  checked={destinatariosModo === 'individual'}
                  onCheckedChange={(checked) =>
                    setDestinatariosModo(checked ? 'individual' : 'grupo')
                  }
                />
              </div>
            )}

            {destinatariosModo === 'individual' && utilizadoresDoCargo.length > 0 && (
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
                {utilizadoresDoCargo.map((u) => {
                  const selecionado = destinatariosUserIds.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      aria-pressed={selecionado}
                      onClick={() =>
                        setDestinatariosUserIds((prev) =>
                          selecionado ? prev.filter((id) => id !== u.id) : [...prev, u.id]
                        )
                      }
                      className={cn(
                        'flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors',
                        selecionado ? 'bg-primary/10 ring-1 ring-primary/40' : 'hover:bg-muted'
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                          selecionado
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {iniciais(u.nome)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{u.nome}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {u.email}
                        </span>
                      </span>
                      {selecionado && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="text-sm">Enviar também por email</Label>
                <p className="text-xs text-muted-foreground">
                  Requer um template de email configurado para este código.
                </p>
              </div>
              <Switch checked={enviarEmail} onCheckedChange={setEnviarEmail} />
            </div>

            {enviarEmail && (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label className="text-sm">Agrupar num resumo diário</Label>
                  <p className="text-xs text-muted-foreground">
                    Em vez de 1 email por aviso, junta tudo o que a pessoa tem pendente num único
                    email por dia. Recomendado sempre que muitos itens possam ficar prontos de uma
                    vez (ex.: um backlog).
                  </p>
                </div>
                <Switch checked={enviarEmailDigest} onCheckedChange={setEnviarEmailDigest} />
              </div>
            )}

            <div className="space-y-2">
              <Label>Cooldown (minutos entre avisos repetidos para a mesma entidade)</Label>
              <Input
                type="number"
                min={0}
                step={60}
                value={cooldownMinutos}
                onChange={(e) => setCooldownMinutos(Math.max(0, Number(e.target.value) || 0))}
              />
              <p className="text-xs text-muted-foreground">{cooldownTexto}</p>
            </div>

            <Button
              onClick={handleGuardar}
              disabled={!podeGerir || atualizar.isPending}
              className="w-full"
            >
              {atualizar.isPending ? 'A guardar…' : 'Guardar'}
            </Button>
            {!podeGerir && (
              <p className="text-center text-xs text-muted-foreground">
                Não tens permissão para configurar automações.
              </p>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
