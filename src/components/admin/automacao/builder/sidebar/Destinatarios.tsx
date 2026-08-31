import { useState } from 'react';
import { Bell, Mail, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  useCargosDisponiveis,
  useUtilizadoresPorCargo,
} from '@/hooks/automacao/useAutomationRulesConfig';
import { Campo, Seccao } from './CamposDoPasso';

/**
 * Quem recebe e por onde.
 *
 * Absorveu a Sheet separada que existia antes: ter dois ecrãs a escrever os
 * mesmos campos era a duplicação que este redesenho veio eliminar.
 *
 * O CANAL DEIXOU DE SER UMA ESCOLHA. Até à divisão entre notificação e email
 * (2026-09-01), esta secção tinha um interruptor: a notificação na app era
 * sempre criada, e o email era opcional por cima dela. Agora são duas acções
 * diferentes — quem quer as duas cria dois blocos — e o canal de cada uma é
 * fixo. O que era um `Switch` passa a um selo informativo.
 */
export function Destinatarios({
  noId,
  dados,
  onAlterar,
  canal,
}: {
  noId: string;
  dados: Record<string, unknown>;
  onAlterar: (alteracao: Record<string, unknown>) => void;
  /** 'notificacao' → só na aplicação. 'email' → só por correio. */
  canal: 'notificacao' | 'email';
}) {
  const { data: cargos = [] } = useCargosDisponiveis();
  const escolhidos = (dados.cargoIds as string[]) ?? [];
  const userIds = (dados.userIds as string[]) ?? [];
  const individual = dados.modo === 'individual';
  // Só faz sentido escolher pessoas DENTRO dos cargos já marcados.
  const { data: pessoas = [] } = useUtilizadoresPorCargo(escolhidos);

  const alternarCargo = (id: string) =>
    onAlterar({
      cargoIds: escolhidos.includes(id) ? escolhidos.filter((c) => c !== id) : [...escolhidos, id],
    });

  const emailsLivres = (dados.emailsLivres as string[]) ?? [];
  const [novoEmail, setNovoEmail] = useState('');
  const [erroEmail, setErroEmail] = useState<string | null>(null);

  // Sanidade de formato — a mesma que fn_validar_acao_config usa no servidor.
  // O servidor continua a ser a autoridade; isto é só feedback imediato.
  const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/i;

  const acrescentarEmail = () => {
    const valor = novoEmail.trim().toLowerCase();
    if (!valor) return;
    if (!EMAIL_REGEX.test(valor)) {
      setErroEmail('Não parece um endereço de email válido.');
      return;
    }
    if (emailsLivres.includes(valor)) {
      setErroEmail('Esse endereço já está na lista.');
      return;
    }
    setErroEmail(null);
    onAlterar({ emailsLivres: [...emailsLivres, valor] });
    setNovoEmail('');
  };

  return (
    <>
      <Seccao titulo="Canal">
        {/* Estado, não interruptor: o canal é o que a acção É, não uma opção
            dentro dela. Duas automações separadas cobrem quem precisa das
            duas — ver o cabeçalho deste ficheiro. */}
        {canal === 'email' ? (
          <Badge variant="secondary" className="gap-1.5">
            <Mail className="h-3.5 w-3.5" />
            Por email
          </Badge>
        ) : (
          <Badge variant="secondary" className="gap-1.5">
            <Bell className="h-3.5 w-3.5" />
            Na aplicação
          </Badge>
        )}
      </Seccao>

      <Seccao titulo="Destinatários">
        <Campo label="Grupos que recebem">
          <div className="flex flex-wrap gap-1.5">
            {escolhidos.map((id) => {
              const nome = cargos.find((c) => c.id === id)?.nome ?? id;
              return (
                <Badge key={id} variant="secondary" className="gap-1 pr-1">
                  {nome}
                  <button
                    type="button"
                    aria-label={`Remover ${nome}`}
                    onClick={() => alternarCargo(id)}
                    className="rounded-full p-0.5 transition-colors hover:bg-background/60"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              );
            })}
            {escolhidos.length === 0 && (
              <span className="text-xs text-muted-foreground">Ninguém escolhido</span>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5 pt-1.5">
            {cargos
              .filter((c) => !escolhidos.includes(c.id))
              .map((c) => (
                <Button
                  key={c.id}
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[11px] font-normal"
                  onClick={() => alternarCargo(c.id)}
                >
                  + {c.nome}
                </Button>
              ))}
          </div>
        </Campo>

        {escolhidos.length > 0 && (
          <div className="space-y-2 rounded-lg border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={`individual-${noId}`} className="text-xs">
                Escolher pessoas específicas
              </Label>
              <Switch
                id={`individual-${noId}`}
                checked={individual}
                onCheckedChange={(v) =>
                  onAlterar({ modo: v ? 'individual' : 'grupo', userIds: v ? userIds : [] })
                }
              />
            </div>

            {individual && (
              <>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Em vez de todos os utilizadores destes grupos, recebe só quem estiver marcado.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {pessoas.map((u) => {
                    const marcado = userIds.includes(u.id);
                    return (
                      <Button
                        key={u.id}
                        size="sm"
                        variant={marcado ? 'secondary' : 'outline'}
                        className="h-6 px-2 text-[11px] font-normal"
                        onClick={() =>
                          onAlterar({
                            userIds: marcado
                              ? userIds.filter((x) => x !== u.id)
                              : [...userIds, u.id],
                          })
                        }
                      >
                        {u.nome}
                      </Button>
                    );
                  })}
                  {pessoas.length === 0 && (
                    <span className="text-[11px] text-muted-foreground">
                      Nenhum utilizador nestes grupos.
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {canal === 'email' && (
          <Campo label="Emails avulsos">
            <div className="flex flex-wrap gap-1.5">
              {emailsLivres.map((email) => (
                <Badge key={email} variant="secondary" className="gap-1 pr-1">
                  {email}
                  <button
                    type="button"
                    aria-label={`Remover ${email}`}
                    onClick={() =>
                      onAlterar({ emailsLivres: emailsLivres.filter((e) => e !== email) })
                    }
                    className="rounded-full p-0.5 transition-colors hover:bg-background/60"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {emailsLivres.length === 0 && (
                <span className="text-xs text-muted-foreground">Nenhum endereço acrescentado</span>
              )}
            </div>

            <div className="flex gap-1.5 pt-1.5">
              <Input
                value={novoEmail}
                onChange={(e) => {
                  setNovoEmail(e.target.value);
                  setErroEmail(null);
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  acrescentarEmail();
                }}
                placeholder="fornecedor@exemplo.pt"
                className="h-8 text-xs"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 shrink-0"
                onClick={acrescentarEmail}
              >
                Acrescentar
              </Button>
            </div>

            {erroEmail && <p className="text-[11px] text-destructive">{erroEmail}</p>}

            <p className="text-[11px] leading-snug text-muted-foreground">
              Endereços fora da WeGest — fornecedores, clientes sem conta.
            </p>
          </Campo>
        )}
      </Seccao>
    </>
  );
}
