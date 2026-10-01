import React from 'react';
import {
  ClipboardCheck,
  Eye,
  FileCheck,
  FileText,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  useViaturaDocumentosMotorista,
  type TipoDocViatura,
} from '@/hooks/useViaturaDocumentosMotorista';

interface MotoristaViaturaDocumentosProps {
  viaturaId: string;
}

const DOCS: { tipo: TipoDocViatura; nome: string; descricao: string; icone: LucideIcon }[] = [
  { tipo: 'dua', nome: 'DUA', descricao: 'Documento Único Automóvel', icone: FileCheck },
  { tipo: 'ipo', nome: 'IPO', descricao: 'Inspecção periódica obrigatória', icone: ClipboardCheck },
  {
    tipo: 'carta_verde',
    nome: 'Carta Verde',
    descricao: 'Certificado internacional de seguro',
    icone: ShieldCheck,
  },
];

/**
 * DUA, IPO e Carta Verde da viatura, uma linha cada. Eram três cartões de
 * 2rem de raio dentro de um diálogo — no telemóvel, numa operação STOP, o
 * motorista quer o botão "Ver" à primeira, não um ecrã de cartões.
 */
export const MotoristaViaturaDocumentos: React.FC<MotoristaViaturaDocumentosProps> = ({
  viaturaId,
}) => {
  const { data, isLoading, error } = useViaturaDocumentosMotorista(viaturaId);

  const abrir = async (url: string) => {
    try {
      const { data: assinado, error: erroUrl } = await supabase.storage
        .from('viatura-documentos')
        .createSignedUrl(url, 3600);
      if (erroUrl) throw erroUrl;
      window.open(assinado.signedUrl, '_blank');
    } catch (e: unknown) {
      console.error('[MotoristaViaturaDocumentos] Erro ao abrir documento:', e);
      toast.error('Não foi possível abrir o documento');
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
          Documentos da viatura
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {DOCS.map((d) => (
              <Skeleton key={d.tipo} className="h-10 w-full" />
            ))}
          </div>
        ) : error ? (
          <p className="p-4 text-sm text-destructive">
            Não foi possível carregar os documentos. Tente daqui a pouco.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {DOCS.map((d) => {
              const doc = data?.[d.tipo] ?? null;
              return (
                <li key={d.tipo} className="flex items-center gap-3 px-4 py-2.5">
                  <d.icone
                    className={cn(
                      'h-4 w-4 shrink-0',
                      doc ? 'text-primary' : 'text-muted-foreground/50'
                    )}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{d.nome}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {doc?.validade
                        ? `Válido até ${format(new Date(doc.validade), 'dd/MM/yyyy')}`
                        : d.descricao}
                    </p>
                  </div>
                  {doc ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0"
                      onClick={() => abrir(doc.url)}
                    >
                      <Eye className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                      Ver
                    </Button>
                  ) : (
                    <span className="shrink-0 text-xs text-muted-foreground">Não disponível</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};
