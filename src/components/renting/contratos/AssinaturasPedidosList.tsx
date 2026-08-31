import { useState } from 'react';
import { CheckCircle2, Download, FileText, PenLine } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getDocumentoUrl, type AssinaturaPedido } from '@/hooks/useAssinaturaPedidos';

export interface AssinaturasPedidosListProps {
  pedidos: AssinaturaPedido[];
  /** Injectáveis para testar sem rede. */
  obterUrl?: (path: string) => Promise<string | null>;
  abrirUrl?: (url: string) => void;
}

const ROTULO_PAPEL: Record<AssinaturaPedido['papel'], string> = {
  cliente: 'cliente',
  condutor: 'condutor',
  motorista: 'motorista',
};

function data(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-PT');
}

/**
 * Pedidos de assinatura de um contrato.
 *
 * Responde a "já assinou?" sem obrigar a procurar no email. Diz **enviado**, e
 * nunca entregue: não há forma de saber se o email chegou à caixa de correio de
 * alguém, e escrever "entregue" faria quem está a olhar decidir com base numa
 * coisa que não sabemos.
 */
export function AssinaturasPedidosList({
  pedidos,
  obterUrl = getDocumentoUrl,
  abrirUrl = (url) => window.open(url, '_blank', 'noopener'),
}: AssinaturasPedidosListProps) {
  const [aAbrir, setAAbrir] = useState<string | null>(null);

  // Um contrato sem pedidos nenhuns é o caso normal — não se ocupa o ecrã com
  // uma secção vazia.
  if (pedidos.length === 0) return null;

  /** `chave` distingue os dois botões do mesmo pedido no estado de "a abrir". */
  const abrir = async (chave: string, path: string | null) => {
    if (!path) return;
    setAAbrir(chave);
    try {
      const url = await obterUrl(path);
      if (url) abrirUrl(url);
    } finally {
      setAAbrir(null);
    }
  };

  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <PenLine className="h-4 w-4 text-primary" />
        Pedidos de assinatura
      </h3>

      <div className="space-y-2">
        {pedidos.map((pedido) => {
          const assinado = !!pedido.assinado_em;

          return (
            <div
              key={pedido.id}
              className={
                pedido.de_versao_anterior
                  ? 'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-dashed bg-muted/30 p-3 text-sm'
                  : 'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border p-3 text-sm'
              }
            >
              <span className="font-medium">{pedido.signatario_nome}</span>
              <span className="text-muted-foreground">({ROTULO_PAPEL[pedido.papel]})</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {pedido.documento_nome}
              </span>

              <span className="whitespace-nowrap text-xs text-muted-foreground">
                Enviado a {data(pedido.created_at)}
              </span>

              {/* Assinado sobre uma versão anterior deste contrato. Fica à
                  vista, mas assinalado: o que a pessoa assinou foi o contrato
                  como ele era nessa altura, não necessariamente este. */}
              {pedido.de_versao_anterior && (
                <Badge variant="outline" className="border-dashed">
                  Versão anterior do contrato
                </Badge>
              )}

              {/* Sem "prazo terminado": o link não expira. O que o fecha é ser
                  usado — e por isso um pedido antigo por assinar continua
                  simplesmente por assinar. */}
              {assinado ? (
                <Badge
                  variant="outline"
                  className={pedido.substituida ? 'gap-1' : 'gap-1 border-emerald-500/40'}
                >
                  <CheckCircle2
                    className={
                      pedido.substituida
                        ? 'h-3 w-3 text-muted-foreground'
                        : 'h-3 w-3 text-emerald-600'
                    }
                  />
                  Assinado a {data(pedido.assinado_em as string)}
                </Badge>
              ) : (
                <Badge variant="secondary">Por assinar</Badge>
              )}

              {/* Houve uma assinatura mais recente do mesmo documento, por um
                  pedido posterior. Esta continua a poder ver-se, mas já não é a
                  que vale. */}
              {pedido.substituida && <Badge variant="outline">Substituída</Badge>}

              {/* O original está sempre disponível, assinado ou não: é o que
                  foi enviado, e serve para conferir e para imprimir. */}
              <Button
                size="sm"
                variant="ghost"
                className="gap-1"
                disabled={aAbrir === `${pedido.id}:original`}
                onClick={() => void abrir(`${pedido.id}:original`, pedido.documento_path)}
              >
                <FileText className="h-3.5 w-3.5" />
                Original
              </Button>

              {assinado && pedido.documento_assinado_path && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1"
                  disabled={aAbrir === `${pedido.id}:assinado`}
                  onClick={() =>
                    void abrir(`${pedido.id}:assinado`, pedido.documento_assinado_path)
                  }
                >
                  <Download className="h-3.5 w-3.5" />
                  Documento assinado
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
