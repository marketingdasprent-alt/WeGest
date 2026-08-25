import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Clock, FileText, Loader2, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SignaturePad, type SignaturePadHandle } from '@/components/assinatura/SignaturePad';
import { useRascunho } from '@/hooks/useRascunho';
import {
  base64Puro,
  carregarPedido as carregarPedidoPadrao,
  submeterAssinatura as submeterAssinaturaPadrao,
  type RespostaPedido,
  type SubmeterAssinaturaArgs,
} from '@/lib/assinaturaApi';
import { gerarDeSnapshot } from '@/utils/document-template/snapshot';

export interface AssinarDocumentoProps {
  /** Injectáveis para testar sem rede; em produção falam com as edge functions. */
  carregar?: (token: string) => Promise<RespostaPedido>;
  submeter?: (args: SubmeterAssinaturaArgs) => Promise<void>;
  /** Assinatura já desenhada — é assim que o rascunho volta depois de um refresh. */
  assinaturaInicial?: string | null;
}

function dataLegivel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-PT');
}

/**
 * A página onde o cliente, condutor ou motorista assina um documento.
 *
 * É a única parte do WeGest que corre para gente sem sessão. Nunca fala com a
 * base de dados: pede tudo à edge function, que valida o token com chave de
 * serviço e devolve só a fotografia daquele documento.
 *
 * O documento assinado nasce aqui, no browser de quem assina, a partir dessa
 * fotografia — é o que garante que o que é assinado é o que foi enviado, mesmo
 * que o contrato tenha mudado entretanto.
 */
export function AssinarDocumento({
  carregar = carregarPedidoPadrao,
  submeter = submeterAssinaturaPadrao,
  assinaturaInicial = null,
}: AssinarDocumentoProps) {
  const { token = '' } = useParams<{ token: string }>();
  const padRef = useRef<SignaturePadHandle>(null);

  const [pedido, setPedido] = useState<RespostaPedido | null>(null);
  const [erroCarregar, setErroCarregar] = useState<string | null>(null);
  const [assinatura, setAssinatura] = useState<string | null>(assinaturaInicial);
  const [erroSubmeter, setErroSubmeter] = useState<string | null>(null);
  const [aEnviar, setAEnviar] = useState(false);
  const [concluido, setConcluido] = useState(false);

  // O rascunho é a rede de segurança de quem assina no telemóvel: um refresh
  // sem querer, ou a aplicação a ir para segundo plano, não pode obrigar a
  // desenhar outra vez.
  const { limpar: limparRascunho } = useRascunho<string | null>({
    chave: `assinatura-documento:${token}`,
    valor: assinatura,
    restaurar: (guardado) => {
      if (guardado) setAssinatura(guardado);
    },
  });

  useEffect(() => {
    let cancelado = false;

    carregar(token)
      .then((resposta) => {
        if (!cancelado) setPedido(resposta);
      })
      .catch((erro: unknown) => {
        if (!cancelado) {
          setErroCarregar(erro instanceof Error ? erro.message : 'Erro inesperado');
        }
      });

    return () => {
      cancelado = true;
    };
  }, [carregar, token]);

  const aoDesenhar = useCallback((vazio: boolean) => {
    setAssinatura(vazio ? null : (padRef.current?.toDataURL() ?? null));
  }, []);

  const aoAssinar = useCallback(async () => {
    if (!pedido || pedido.estado !== 'valido' || !assinatura) return;

    setAEnviar(true);
    setErroSubmeter(null);

    try {
      const pdf = await gerarDeSnapshot(pedido.snapshot, {
        [`assinatura_${pedido.papel}`]: assinatura,
      });

      await submeter({
        token,
        assinaturaBase64: base64Puro(assinatura),
        documentoAssinadoBase64: base64Puro(pdf.output('datauristring')),
      });

      limparRascunho();
      setConcluido(true);
    } catch (erro: unknown) {
      // A assinatura fica onde está, de propósito. Quem já a desenhou não a
      // volta a desenhar por causa de uma falha de rede.
      setErroSubmeter(erro instanceof Error ? erro.message : 'Erro inesperado');
    } finally {
      setAEnviar(false);
    }
  }, [assinatura, limparRascunho, pedido, submeter, token]);

  if (erroCarregar) {
    return (
      <Moldura>
        <Estado
          icone={<XCircle className="h-10 w-10 text-destructive" />}
          titulo="Este link não é válido"
          texto="Verifique se abriu o endereço completo do email. Se o problema continuar, peça um novo link a quem lhe enviou o documento."
        />
      </Moldura>
    );
  }

  if (!pedido) {
    return (
      <Moldura>
        <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />A carregar o documento…
        </div>
      </Moldura>
    );
  }

  if (pedido.estado === 'expirado') {
    return (
      <Moldura>
        <Estado
          icone={<Clock className="h-10 w-10 text-amber-600" />}
          titulo="O prazo para assinar terminou"
          texto={`Este link expirou a ${dataLegivel(pedido.expirouEm)}. Peça um novo link a quem lhe enviou o documento — leva um minuto a gerar.`}
        />
      </Moldura>
    );
  }

  if (pedido.estado === 'assinado' || concluido) {
    const assinadoEm = pedido.estado === 'assinado' ? pedido.assinadoEm : new Date().toISOString();
    const url = pedido.estado === 'assinado' ? pedido.urlAssinado : null;

    return (
      <Moldura>
        <Estado
          icone={<CheckCircle2 className="h-10 w-10 text-emerald-600" />}
          titulo={`Assinado a ${dataLegivel(assinadoEm)}`}
          texto="O documento assinado foi enviado para o seu email. Guarde essa cópia."
        />
        {url && (
          <div className="mt-4 flex justify-center">
            <Button asChild variant="outline">
              <a href={url} target="_blank" rel="noreferrer">
                Descarregar o documento assinado
              </a>
            </Button>
          </div>
        )}
      </Moldura>
    );
  }

  return (
    <Moldura>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5 text-primary" />
            {pedido.documentoNome}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {pedido.signatarioNome}, o documento segue em anexo no email que recebeu. Assine abaixo
            para o devolver assinado.
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium">A sua assinatura</p>
            <SignaturePad ref={padRef} value={assinatura} onChange={aoDesenhar} />
            {assinatura && (
              <p data-testid="assinatura-presente" className="mt-2 text-xs text-muted-foreground">
                Assinatura desenhada. Pode voltar a desenhar se quiser.
              </p>
            )}
          </div>

          {erroSubmeter && (
            <p className="text-sm text-destructive">
              Não foi possível enviar a assinatura ({erroSubmeter}). A sua assinatura ficou guardada
              — tente outra vez.
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                padRef.current?.clear();
                setAssinatura(null);
              }}
              disabled={!assinatura || aEnviar}
            >
              Limpar
            </Button>
            <Button onClick={aoAssinar} disabled={!assinatura || aEnviar}>
              {aEnviar && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Assinar e devolver
            </Button>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Ao assinar fica registada a data e a hora. O link é pessoal e só pode ser usado uma vez.
          </p>
        </CardContent>
      </Card>
    </Moldura>
  );
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <p className="mb-6 text-center text-sm font-semibold tracking-wide text-muted-foreground">
        WeGest
      </p>
      {children}
    </div>
  );
}

function Estado({
  icone,
  titulo,
  texto,
}: {
  icone: React.ReactNode;
  titulo: string;
  texto: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        {icone}
        <h1 className="text-lg font-semibold">{titulo}</h1>
        <p className="max-w-md text-sm text-muted-foreground">{texto}</p>
      </CardContent>
    </Card>
  );
}

export default AssinarDocumento;
