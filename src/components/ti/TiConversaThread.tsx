import { Fragment, useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  agruparAnexos,
  rotuloDia,
  type LadoConversa,
  type TiAnexoVisivel,
  type TiMensagem,
} from '@/lib/tiTicketChat';
import { TiMensagemBolha } from './TiMensagemBolha';

interface TiConversaThreadProps {
  descricao: string;
  autorNome: string;
  criadoEm: string;
  mensagens: TiMensagem[];
  anexos: TiAnexoVisivel[];
  meuLado: LadoConversa;
  /** Aviso no fim da conversa (ex.: pedido resolvido). */
  rodape?: ReactNode;
}

/**
 * A conversa toda, com o pedido inicial como primeira mensagem de quem pediu.
 * Desce sozinha ao fundo quando chega mensagem nova.
 */
export function TiConversaThread({
  descricao,
  autorNome,
  criadoEm,
  mensagens,
  anexos,
  meuLado,
  rodape,
}: TiConversaThreadProps) {
  const fundo = useRef<HTMLDivElement>(null);
  const { iniciais, porMensagem } = useMemo(() => agruparAnexos(anexos), [anexos]);

  useEffect(() => {
    fundo.current?.scrollIntoView?.({ block: 'end' });
  }, [mensagens.length, anexos.length]);

  const itens = [
    {
      id: 'pedido',
      nome: autorNome,
      texto: descricao,
      em: criadoEm,
      lado: 'autor' as const,
      anexos: iniciais,
      etiqueta: 'Pedido inicial',
    },
    ...mensagens.map((m) => ({
      id: m.id,
      nome: m.criado_por_nome,
      texto: m.texto,
      em: m.created_at,
      lado: m.autor_tipo,
      anexos: porMensagem.get(m.id) ?? [],
      etiqueta: undefined,
    })),
  ];

  return (
    <div className="flex flex-col gap-4 px-4 py-5 sm:px-6">
      {itens.map((item, i) => {
        const dia = rotuloDia(item.em);
        const novoDia = i === 0 || rotuloDia(itens[i - 1].em) !== dia;
        return (
          <Fragment key={item.id}>
            {novoDia && (
              <div className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                {dia}
                <span className="h-px flex-1 bg-border" />
              </div>
            )}
            <TiMensagemBolha {...item} minha={item.lado === meuLado} />
          </Fragment>
        );
      })}
      {mensagens.length === 0 && (
        <p className="text-center text-xs text-muted-foreground">
          {meuLado === 'autor'
            ? 'Ainda sem resposta do suporte. A resposta aparece aqui.'
            : 'Ainda ninguém respondeu. Escreva abaixo para falar com quem pediu.'}
        </p>
      )}
      {rodape}
      <div ref={fundo} />
    </div>
  );
}
