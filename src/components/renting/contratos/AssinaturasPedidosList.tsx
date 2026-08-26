import { useState } from 'react';
import { CheckCircle2, Clock, Download, PenLine } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getDocumentoAssinadoUrl, type AssinaturaPedido } from '@/hooks/useAssinaturaPedidos';

export interface AssinaturasPedidosListProps {
  pedidos: AssinaturaPedido[];
  /** Injectáveis para testar sem rede. */
  obterUrl?: (path: string) => Promise<string | null>;
  abrirUrl?: (url: string) => void;
  /** Só para testes: fixa o "agora" que decide se um prazo já passou. */
  agora?: Date;
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
  obterUrl = getDocumentoAssinadoUrl,
  abrirUrl = (url) => window.open(url, '_blank', 'noopener'),
  agora = new Date(),
}: AssinaturasPedidosListProps) {
  const [aAbrir, setAAbrir] = useState<string | null>(null);

  // Um contrato sem pedidos nenhuns é o caso normal — não se ocupa o ecrã com
  // uma secção vazia.
  if (pedidos.length === 0) return null;

  const abrir = async (pedido: AssinaturaPedido) => {
    if (!pedido.documento_assinado_path) return;
    setAAbrir(pedido.id);
    try {
      const url = await obterUrl(pedido.documento_assinado_path);
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
          const expirou = !assinado && new Date(pedido.expires_at) <= agora;

          return (
            <div
              key={pedido.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border p-3 text-sm"
            >
              <span className="font-medium">{pedido.signatario_nome}</span>
              <span className="text-muted-foreground">({ROTULO_PAPEL[pedido.papel]})</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {pedido.documento_nome}
              </span>

              <span className="whitespace-nowrap text-xs text-muted-foreground">
                Enviado a {data(pedido.created_at)}
              </span>

              {assinado ? (
                <Badge variant="outline" className="gap-1 border-emerald-500/40">
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                  Assinado a {data(pedido.assinado_em as string)}
                </Badge>
              ) : expirou ? (
                <Badge variant="outline" className="gap-1 border-amber-500/40">
                  <Clock className="h-3 w-3 text-amber-600" />
                  Prazo terminado
                </Badge>
              ) : (
                <Badge variant="secondary">Por assinar</Badge>
              )}

              {assinado && pedido.documento_assinado_path && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1"
                  disabled={aAbrir === pedido.id}
                  onClick={() => void abrir(pedido)}
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
