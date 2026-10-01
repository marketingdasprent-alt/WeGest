import { useRef } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Download,
  Eye,
  FileText,
  RefreshCw,
  Upload,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { differenceInDays, isPast } from 'date-fns';
import { toast } from 'sonner';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  useDocumentosMotoristaPortal,
  useEnviarDocumentoMotorista,
} from '@/hooks/useDocumentosMotoristaPortal';
import {
  estadoDocumento,
  TIPOS_DOCUMENTO_MOTORISTA,
  type DocumentoOficial,
} from '@/utils/documentosMotorista';

interface Props {
  motoristaId: string;
  /** Dentro de um diálogo: sem moldura nem cabeçalho — o diálogo já é a caixa. */
  semMoldura?: boolean;
}

function badgeValidade(validade: string | null) {
  if (!validade) return null;
  const data = new Date(validade);
  if (isPast(data)) {
    return { label: 'Expirado', cls: 'border-destructive/40 bg-destructive/10 text-destructive' };
  }
  const dias = differenceInDays(data, new Date());
  if (dias <= 30) {
    return {
      label: `Expira em ${dias}d`,
      cls: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
    };
  }
  return {
    label: 'Válido',
    cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  };
}

/**
 * Os documentos pessoais do motorista, um por linha.
 *
 * O que ele envia fica "Em aprovação" ao lado do documento que vale hoje; só
 * substitui a ficha quando a gestão aprovar. Uma recusa mostra o motivo e
 * deixa enviar outro. A regra de "o que vale" está em `estadoDocumento`.
 */
export function MotoristaDocumentosCard({ motoristaId, semMoldura = false }: Props) {
  const { user } = useAuth();
  const { data, isLoading, error } = useDocumentosMotoristaPortal(motoristaId);
  const enviar = useEnviarDocumentoMotorista(motoristaId);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const abrir = async (path: string) => {
    try {
      const { data: assinado, error: erroUrl } = await supabase.storage
        .from('motorista-documentos')
        .createSignedUrl(path, 3600);
      if (erroUrl) throw erroUrl;
      window.open(assinado.signedUrl, '_blank');
    } catch (e: unknown) {
      console.error('[MotoristaDocumentosCard] Erro ao abrir documento:', e);
      toast.error('Não foi possível abrir o documento');
    }
  };

  const descarregar = async (doc: DocumentoOficial) => {
    try {
      const { data: blob, error: erroDl } = await supabase.storage
        .from('motorista-documentos')
        .download(doc.ficheiro_url);
      if (erroDl) throw erroDl;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.nome_ficheiro || 'documento';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      console.error('[MotoristaDocumentosCard] Erro ao descarregar documento:', e);
      toast.error('Não foi possível descarregar o documento');
    }
  };

  const aEnviar = (tipo: string) => enviar.isPending && enviar.variables?.tipo.value === tipo;

  return (
    <Card className={cn(semMoldura && 'rounded-none border-0 bg-transparent shadow-none')}>
      {!semMoldura && (
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
            Os meus documentos
          </CardTitle>
        </CardHeader>
      )}
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : error ? (
          <p className="p-4 text-sm text-destructive">
            Não foi possível carregar os documentos. Tente daqui a pouco.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {TIPOS_DOCUMENTO_MOTORISTA.map((tipo) => {
              const { oficial, pendente, rejeitado } = estadoDocumento(
                tipo,
                data?.ficha ?? null,
                data?.documentos ?? []
              );
              const validade = badgeValidade(oficial?.validade ?? null);
              const temAlgo = !!oficial || !!pendente;

              let Icone: LucideIcon = XCircle;
              let corIcone = 'text-muted-foreground/50';
              let legenda = 'Não anexado';
              if (pendente) {
                Icone = Clock;
                corIcone = 'text-amber-600 dark:text-amber-400';
                legenda = 'Em aprovação pela gestão';
              } else if (rejeitado) {
                Icone = AlertTriangle;
                corIcone = 'text-destructive';
                legenda = `Recusado: ${rejeitado.motivo_rejeicao ?? 'sem motivo indicado'}`;
              } else if (oficial) {
                Icone = CheckCircle;
                corIcone = 'text-emerald-600 dark:text-emerald-400';
                legenda = 'Validado';
              }

              return (
                <li
                  key={tipo.value}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Icone className={cn('h-4 w-4 shrink-0', corIcone)} aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{tipo.label}</p>
                      <p
                        className={cn(
                          'text-xs',
                          rejeitado ? 'text-destructive' : 'text-muted-foreground'
                        )}
                      >
                        {legenda}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5 self-end sm:self-auto">
                    {pendente ? (
                      <Badge
                        variant="outline"
                        className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                      >
                        Em aprovação
                      </Badge>
                    ) : (
                      validade && (
                        <Badge variant="outline" className={cn('gap-1 font-medium', validade.cls)}>
                          {validade.label === 'Expirado' && (
                            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                          )}
                          {validade.label}
                        </Badge>
                      )
                    )}

                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      hidden
                      ref={(el) => {
                        inputRefs.current[tipo.value] = el;
                      }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f && user) {
                          enviar.mutate({
                            tipo,
                            file: f,
                            userId: user.id,
                            substituir: pendente
                              ? { id: pendente.id, ficheiro_url: pendente.ficheiro_url }
                              : null,
                          });
                        }
                        e.target.value = '';
                      }}
                    />

                    {oficial && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => abrir(oficial.ficheiro_url)}
                          aria-label="Ver documento validado"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => descarregar(oficial)}
                          aria-label="Descarregar documento validado"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    {pendente && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => abrir(pendente.ficheiro_url)}
                        aria-label="Ver o documento enviado"
                      >
                        <Eye className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      </Button>
                    )}

                    {temAlgo ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => inputRefs.current[tipo.value]?.click()}
                        disabled={aEnviar(tipo.value)}
                        aria-label={pendente ? 'Substituir o documento enviado' : 'Enviar novo'}
                      >
                        {aEnviar(tipo.value) ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4" />
                        )}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5"
                        onClick={() => inputRefs.current[tipo.value]?.click()}
                        disabled={aEnviar(tipo.value)}
                      >
                        {aEnviar(tipo.value) ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Upload className="h-3.5 w-3.5" />
                        )}
                        Anexar
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          PDF, JPG ou PNG até 10 MB. Cada documento que enviar fica em aprovação até a gestão o
          validar — depois substitui o anterior na sua ficha.
        </p>
      </CardContent>
    </Card>
  );
}
