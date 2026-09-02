import type { LucideIcon } from 'lucide-react';
import { Filter, Settings2, Timer, Zap } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { eventosDoModulo, OPERADORES, rotuloDoEvento } from '../catalogo';
import {
  accoesParaEvento,
  camposDoEvento,
  useAutomationCatalogo,
} from '@/hooks/automacao/useAutomationCatalogo';
import { paraTexto, paraValorJson, tipoDoCampo } from '../valorTipado';
import { Destinatarios } from './Destinatarios';
import { Mensagem } from './Mensagem';

/**
 * Os campos do passo, em secções.
 *
 * Numa coluna de 380px não cabem as três colunas do modal antigo — a entrada e
 * a pré-visualização passaram a secções recolhíveis dentro de `Mensagem`, junto
 * do campo a que dizem respeito, em vez de painéis a competir pelo espaço.
 */

export interface CamposDoPassoProps {
  tipo: string;
  noId: string;
  dados: Record<string, unknown>;
  onAlterar: (alteracao: Record<string, unknown>) => void;
  payload: Record<string, unknown> | null;
  corpo: string;
  onCorpo: (v: string) => void;
  regrasQueUsam: number;
  assuntoDoTemplate: string;
  /** O evento da regra. É ele que decide que campos podem ser condição e que
   * acções fazem sentido — as condições avaliam o payload dele. */
  eventType?: string;
}

export function Seccao({
  titulo,
  icone: Icone,
  extra,
  children,
}: {
  titulo: string;
  /** Ícone junto ao título — ajuda a percorrer o painel a olhar, não a ler. */
  icone?: LucideIcon;
  /** Selo/acção alinhada à direita do título — ex.: o canal, junto de "Destinatários". */
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 border-b border-border p-4 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/70">
          {Icone && <Icone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
          {titulo}
        </h3>
        {extra}
      </div>
      {children}
    </section>
  );
}

export function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function CamposDoPasso(props: CamposDoPassoProps) {
  const { tipo, noId, dados, onAlterar, eventType } = props;
  const accao = dados.accao as string | undefined;

  const { data: catalogo, isError: catalogoFalhou } = useAutomationCatalogo();
  const campos = camposDoEvento(catalogo, eventType);
  const tipoDoValor = tipoDoCampo(campos, dados.campo as string | undefined);

  const acaoTipo = (dados.acaoTipo as string) ?? 'notificacao';
  const interna = acaoTipo === 'automacao_interna';
  const accoes = accoesParaEvento(catalogo, eventType);
  const defAccao = accao && catalogo ? catalogo.accoes[accao] : undefined;

  return (
    <>
      <Seccao titulo="Identificação">
        <Campo label="Nome do passo">
          <Input
            value={String(dados.rotulo ?? '')}
            onChange={(e) => onAlterar({ rotulo: e.target.value })}
          />
        </Campo>
      </Seccao>

      {tipo === 'trigger' && (
        <Seccao titulo="Quando dispara" icone={Zap}>
          <Campo label="Evento">
            <Select
              value={(dados.eventType as string) ?? ''}
              onValueChange={(v) => onAlterar({ eventType: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Escolhe o evento" />
              </SelectTrigger>
              <SelectContent>
                {eventosDoModulo(String(dados.modulo ?? '')).map((e) => (
                  <SelectItem key={e} value={e}>
                    {/* Só o nome. O identificador continua no tooltip do nó,
                        para quem precisar dele a depurar. */}
                    {rotuloDoEvento(e)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
        </Seccao>
      )}

      {tipo === 'condicao' && (
        <Seccao titulo="Só continua se" icone={Filter}>
          <Campo label="Campo do evento">
            {campos.length > 0 ? (
              <Select
                value={String(dados.campo ?? '')}
                onValueChange={(v) =>
                  // Trocar de campo troca o tipo, e o valor antigo deixa de o
                  // respeitar — «alta» num campo numérico. Limpar é honesto:
                  // manter escrevia uma condição que nunca casaria.
                  onAlterar({ campo: v, valor: '' })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Escolhe o campo" />
                </SelectTrigger>
                <SelectContent>
                  {campos.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              // Só os campos que o evento traz no payload podem ser condição.
              // Um campo da entidade que o evento não carrega nunca casaria, e
              // oferecê-lo era prometer um filtro que não filtra.
              <p className="text-[11px] leading-snug text-muted-foreground">
                Este evento não traz campos que se possam filtrar. A automação corre sempre que ele
                acontece.
              </p>
            )}
          </Campo>
          <Campo label="Operador">
            <Select
              value={(dados.operador as string) ?? '='}
              onValueChange={(v) => onAlterar({ operador: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* Só os dois que o motor sabe avaliar — qualquer outro faz a
                    condição passar sempre, em silêncio. Ver catalogo.ts. */}
                {OPERADORES.map((o) => (
                  <SelectItem key={o.valor} value={o.valor}>
                    {o.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
          <Campo label="Valor">
            {tipoDoValor === 'boolean' ? (
              <Select
                value={paraTexto(dados.valor)}
                onValueChange={(v) => onAlterar({ valor: paraValorJson(v, 'boolean') })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sim ou não" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Sim</SelectItem>
                  <SelectItem value="false">Não</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Input
                // O tipo do input segue o do campo, e o valor é convertido
                // ANTES de ir para o rascunho. Gravar tudo como texto era o que
                // fazia uma condição sobre um número nunca casar: o avaliador
                // compara por tipo e não faz coerção.
                type={tipoDoValor === 'number' ? 'number' : 'text'}
                value={paraTexto(dados.valor)}
                placeholder={tipoDoValor === 'number' ? 'ex.: 500' : 'ex.: alta'}
                onChange={(e) => onAlterar({ valor: paraValorJson(e.target.value, tipoDoValor) })}
              />
            )}
          </Campo>
        </Seccao>
      )}

      {interna && (
        <Seccao titulo="Acção no sistema" icone={Settings2}>
          {/* Falha fechada: sem catálogo não se inventam acções localmente.
              Oferecer uma lista adivinhada levaria o utilizador a gravar
              configuração que o servidor recusa. */}
          {catalogoFalhou || !catalogo ? (
            <p className="text-[11px] leading-snug text-destructive">
              Não foi possível carregar o catálogo de acções. Recarrega a página — sem ele não é
              possível configurar uma acção no sistema.
            </p>
          ) : (
            <>
              <Campo label="Acção">
                <Select
                  value={accao ?? ''}
                  onValueChange={(v) => onAlterar({ accao: v, campo: '', valor: '' })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Escolhe a acção" />
                  </SelectTrigger>
                  <SelectContent>
                    {accoes.map(([id, a]) => (
                      <SelectItem key={id} value={id}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>

              {/* Acções que escrevem num campo: a allowlist vem do catálogo,
                  não daqui. */}
              {defAccao?.campos_permitidos && (
                <Campo label="Campo">
                  <Select
                    value={String(dados.campo ?? '')}
                    onValueChange={(v) => onAlterar({ campo: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Escolhe o campo" />
                    </SelectTrigger>
                    <SelectContent>
                      {defAccao.campos_permitidos.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Campo>
              )}

              {/* Acções com conjunto fechado: select, nunca texto livre — o
                  servidor recusaria um valor de fora, e o utilizador só o
                  descobriria ao gravar. */}
              {defAccao?.valores ? (
                <Campo label="Novo valor">
                  <Select
                    value={String(dados.valor ?? '')}
                    onValueChange={(v) => onAlterar({ valor: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Escolhe o valor" />
                    </SelectTrigger>
                    <SelectContent>
                      {defAccao.valores.map((v) => (
                        <SelectItem key={v} value={v}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Campo>
              ) : (
                defAccao && (
                  <Campo label="Valor a escrever">
                    <Input
                      value={String(dados.valor ?? '')}
                      placeholder="ex.: Verificar documentação pendente"
                      onChange={(e) => onAlterar({ valor: e.target.value })}
                    />
                  </Campo>
                )
              )}
            </>
          )}
        </Seccao>
      )}

      {tipo === 'accao' && (acaoTipo === 'notificacao' || acaoTipo === 'email') && (
        <>
          {/* Notificação e email escolhem destinatários da mesma forma — só
              o canal (badge dentro de Destinatarios) muda. Sem o `tipo ===
              'accao'` aqui, um nó de gatilho — que não tem `acaoTipo` e por
              isso cai no valor por omissão 'notificacao' — mostrava esta
              secção também. */}
          <Destinatarios
            noId={noId}
            dados={dados}
            onAlterar={onAlterar}
            canal={acaoTipo === 'email' ? 'email' : 'notificacao'}
          />
          {/* O corpo só existe para o email. O motor escreve `mensagem = null`
              na notificação in-app, portanto este campo não tinha efeito
              nenhum numa acção de notificação — e, pior, como a gémea de
              email partilha o mesmo `template_codigo`, editá-lo aqui mudava
              em silêncio o email da OUTRA automação. */}
          {acaoTipo === 'email' && (
            <Mensagem
              payload={props.payload}
              corpo={props.corpo}
              onCorpo={props.onCorpo}
              regrasQueUsam={props.regrasQueUsam}
              assunto={props.assuntoDoTemplate}
            />
          )}
        </>
      )}

      {tipo === 'accao' && (
        <Seccao titulo="Frequência" icone={Timer}>
          <Campo label="Cooldown (minutos)">
            <Input
              type="number"
              min={0}
              value={Number(dados.cooldownMinutos ?? 0)}
              // Campo numérico vazio dá NaN; sem o guarda o payload saía inválido.
              onChange={(e) => onAlterar({ cooldownMinutos: Number(e.target.value) || 0 })}
            />
            <p className="text-[11px] leading-snug text-muted-foreground">
              Tempo mínimo entre dois avisos para a mesma entidade.
            </p>
          </Campo>
        </Seccao>
      )}
    </>
  );
}
