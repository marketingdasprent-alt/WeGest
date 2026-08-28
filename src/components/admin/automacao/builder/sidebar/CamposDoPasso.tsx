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
}

export function Seccao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-b border-border p-4 last:border-b-0">
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {titulo}
      </h3>
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
  const { tipo, noId, dados, onAlterar } = props;
  const accao = dados.accao as string | undefined;

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
        <Seccao titulo="Quando dispara">
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
        <Seccao titulo="Só continua se">
          <Campo label="Campo do evento">
            <Input
              value={String(dados.campo ?? '')}
              placeholder="ex.: severidade"
              onChange={(e) => onAlterar({ campo: e.target.value })}
            />
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
            <Input
              value={String(dados.valor ?? '')}
              placeholder="ex.: alta"
              onChange={(e) => onAlterar({ valor: e.target.value })}
            />
          </Campo>
        </Seccao>
      )}

      {accao === 'notificacao' && (
        <>
          <Destinatarios noId={noId} dados={dados} onAlterar={onAlterar} />
          <Mensagem
            payload={props.payload}
            corpo={props.corpo}
            onCorpo={props.onCorpo}
            regrasQueUsam={props.regrasQueUsam}
            assunto={props.assuntoDoTemplate}
          />
        </>
      )}

      {accao === 'alterar_estado' && (
        <Seccao titulo="Alteração">
          <Campo label="Campo a alterar">
            <Input
              value={String(dados.campo ?? '')}
              placeholder="ex.: estado"
              onChange={(e) => onAlterar({ campo: e.target.value })}
            />
          </Campo>
          <Campo label="Novo valor">
            <Input
              value={String(dados.valor ?? '')}
              placeholder="ex.: inativo"
              onChange={(e) => onAlterar({ valor: e.target.value })}
            />
          </Campo>
        </Seccao>
      )}

      {tipo === 'accao' && (
        <Seccao titulo="Frequência">
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
