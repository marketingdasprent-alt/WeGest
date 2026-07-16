import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { format, differenceInDays, isPast } from 'date-fns';
import { pt } from 'date-fns/locale';

interface MotoristaAtivo {
  documento_tipo: string;
  documento_numero: string;
  documento_validade: string;
  carta_conducao: string;
  carta_categorias: string[];
  carta_validade: string;
  licenca_tvde_numero: string;
  licenca_tvde_validade: string;
}

interface MotoristaDocumentosCardProps {
  motorista: MotoristaAtivo;
}

interface DocumentoStatus {
  nome: string;
  numero: string | null;
  validade: string | null;
  categorias?: string[];
}

export function MotoristaDocumentosCard({ motorista }: MotoristaDocumentosCardProps) {
  const documentos: DocumentoStatus[] = [
    {
      nome: motorista.documento_tipo || 'Documento de Identificação',
      numero: motorista.documento_numero,
      validade: motorista.documento_validade,
    },
    {
      nome: 'Carta de Condução',
      numero: motorista.carta_conducao,
      validade: motorista.carta_validade,
      categorias: motorista.carta_categorias,
    },
    {
      nome: 'Licença TVDE',
      numero: motorista.licenca_tvde_numero,
      validade: motorista.licenca_tvde_validade,
    },
  ];

  function getStatusBadge(validade: string | null) {
    if (!validade) {
      return (
        <Badge variant="secondary" className="flex items-center gap-1">
          <FileText className="w-3 h-3" />
          Sem data
        </Badge>
      );
    }

    const dataValidade = new Date(validade);
    const hoje = new Date();
    const diasRestantes = differenceInDays(dataValidade, hoje);

    if (isPast(dataValidade)) {
      return (
        <Badge variant="destructive" className="flex items-center gap-1">
          <XCircle className="w-3 h-3" />
          Expirado
        </Badge>
      );
    }

    if (diasRestantes <= 30) {
      return (
        <Badge
          variant="outline"
          className="flex items-center gap-1 border-yellow-500 text-yellow-600 dark:text-yellow-400"
        >
          <AlertTriangle className="w-3 h-3" />
          Expira em {diasRestantes} dias
        </Badge>
      );
    }

    return (
      <Badge
        variant="outline"
        className="flex items-center gap-1 border-green-500 text-green-600 dark:text-green-400"
      >
        <CheckCircle className="w-3 h-3" />
        Válido
      </Badge>
    );
  }

  // Tokens do tema (bg-card/border-border/text-foreground/muted) em vez de
  // cores claras fixas — o cartão acompanha o modo claro/escuro/sistema.
  return (
    <Card className="bg-card border-border shadow-sm rounded-[1.5rem] md:rounded-[2rem] overflow-hidden leading-relaxed">
      <CardHeader className="p-5 md:p-8 pb-3 md:pb-4 border-b border-border/50">
        <CardTitle className="text-base md:text-lg font-black text-foreground flex items-center gap-2 md:gap-3">
          <div className="p-2 bg-teal-500/10 rounded-xl">
            <FileText className="w-4 h-4 md:w-5 md:h-5 text-teal-600 dark:text-teal-400" />
          </div>
          Documentos Legais
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border/50">
          {documentos.map((doc, index) => (
            <div
              key={index}
              className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 md:gap-4 p-5 md:p-8 hover:bg-muted/40 transition-colors"
            >
              <div className="space-y-1">
                <p className="font-black text-foreground tracking-tight text-sm md:text-base">
                  {doc.nome}
                </p>
                <div className="flex flex-wrap items-center gap-2 md:gap-3">
                  {doc.numero && (
                    <span className="font-mono text-[10px] md:text-xs font-bold text-muted-foreground bg-muted px-2 py-1 rounded-md">
                      {doc.numero}
                    </span>
                  )}
                  {doc.categorias && doc.categorias.length > 0 && (
                    <span className="text-[9px] md:text-[10px] font-black uppercase tracking-wider text-teal-600/80 dark:text-teal-400/80 bg-teal-500/10 px-2 py-1 rounded-md">
                      Cat: {doc.categorias.join(', ')}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-4 md:gap-6">
                {doc.validade && (
                  <div className="text-left sm:text-right">
                    <p className="text-[9px] md:text-[10px] font-black text-muted-foreground/60 uppercase tracking-widest leading-none mb-1">
                      Validade
                    </p>
                    <p className="text-[10px] md:text-xs font-bold text-muted-foreground">
                      {format(new Date(doc.validade), 'dd MMM yyyy', { locale: pt })}
                    </p>
                  </div>
                )}
                {getStatusBadge(doc.validade)}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
