import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  FileText,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Eye,
  Download,
  Upload,
  RefreshCw,
} from 'lucide-react';
import { differenceInDays, isPast } from 'date-fns';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface Props {
  motoristaId: string;
  /** Dentro de um dialogo: sem moldura e sem cabecalho proprio — o dialogo ja e
   *  a caixa e ja tem titulo. Repetir ambos dava caixa dentro de caixa e o
   *  mesmo titulo duas vezes. */
  semMoldura?: boolean;
}

// Documentos pessoais necessários (espelha o backoffice). `field` = coluna de
// URL oficial em motoristas_ativos (preenchida pelo gestor); `validityField` =
// coluna de validade oficial. Os que não têm `field` vivem em motorista_documentos.
const TIPOS_DOCUMENTO: {
  value: string;
  label: string;
  field?: string;
  validityField?: string;
  folder: string;
}[] = [
  {
    value: 'documento_identificacao',
    label: 'Cartão de Cidadão / Passaporte (Frente)',
    field: 'documento_ficheiro_url',
    validityField: 'documento_validade',
    folder: 'documentos',
  },
  {
    value: 'documento_identificacao_verso',
    label: 'Cartão de Cidadão / Passaporte (Verso)',
    field: 'documento_identificacao_verso_url',
    validityField: 'documento_validade',
    folder: 'documentos',
  },
  {
    value: 'carta_conducao',
    label: 'Carta de Condução (Frente)',
    field: 'carta_ficheiro_url',
    validityField: 'carta_validade',
    folder: 'cartas',
  },
  {
    value: 'carta_conducao_verso',
    label: 'Carta de Condução (Verso)',
    field: 'carta_conducao_verso_url',
    validityField: 'carta_validade',
    folder: 'cartas',
  },
  {
    value: 'licenca_tvde',
    label: 'Licença TVDE',
    field: 'licenca_tvde_ficheiro_url',
    validityField: 'licenca_tvde_validade',
    folder: 'tvde',
  },
  // Estes três TÊM coluna na ficha (o FICHA_COLS abaixo já as lê). Sem o
  // `field`, o resolveDoc saltava sempre para o fallback motorista_documentos
  // e mostrava "em falta" um documento que o motorista já tinha enviado na
  // candidatura — levando-o a enviá-lo outra vez e a criar um duplicado.
  {
    value: 'registo_criminal',
    label: 'Registo Criminal',
    field: 'registo_criminal_url',
    folder: 'documentos',
  },
  {
    value: 'comprovativo_morada',
    label: 'Comprovativo de Morada',
    field: 'comprovativo_morada_url',
    folder: 'documentos',
  },
  {
    value: 'comprovativo_iban',
    label: 'Comprovativo de IBAN',
    field: 'comprovativo_iban_url',
    folder: 'documentos',
  },
  { value: 'outros', label: 'Outros Documentos', folder: 'documentos' },
];

interface Ficha {
  [key: string]: string | null;
}
interface DocExtra {
  id: string;
  tipo_documento: string;
  nome_ficheiro: string | null;
  ficheiro_url: string;
  data_validade: string | null;
}
interface DocResolvido {
  ficheiro_url: string;
  nome_ficheiro: string | null;
  validade: string | null;
}

const FICHA_COLS =
  'id, documento_ficheiro_url, documento_identificacao_verso_url, carta_ficheiro_url, ' +
  'carta_conducao_verso_url, licenca_tvde_ficheiro_url, registo_criminal_url, ' +
  'comprovativo_morada_url, comprovativo_iban_url, documento_validade, carta_validade, licenca_tvde_validade';

export function MotoristaDocumentosCard({ motoristaId, semMoldura = false }: Props) {
  const { user } = useAuth();
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [extras, setExtras] = useState<DocExtra[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [fichaRes, extrasRes] = await Promise.all([
        supabase.from('motoristas_ativos').select(FICHA_COLS).eq('id', motoristaId).maybeSingle(),
        supabase
          .from('motorista_documentos')
          .select('id, tipo_documento, nome_ficheiro, ficheiro_url, data_validade')
          .eq('motorista_id', motoristaId)
          .order('created_at', { ascending: false }),
      ]);
      setFicha((fichaRes.data as unknown as Ficha) || null);
      setExtras((extrasRes.data as unknown as DocExtra[]) || []);
    } catch (e) {
      console.error('Erro ao carregar documentos pessoais:', e);
    } finally {
      setLoading(false);
    }
  }, [motoristaId]);

  useEffect(() => {
    load();
  }, [load]);

  function resolveDoc(tipo: (typeof TIPOS_DOCUMENTO)[number]): DocResolvido | null {
    // 1) documento oficial (carregado pelo gestor) em motoristas_ativos
    if (tipo.field && ficha?.[tipo.field]) {
      return {
        ficheiro_url: ficha[tipo.field] as string,
        nome_ficheiro: tipo.label,
        validade: tipo.validityField ? (ficha[tipo.validityField] ?? null) : null,
      };
    }
    // 2) documento extra / carregado pelo motorista em motorista_documentos
    const extra = extras.find((d) => d.tipo_documento === tipo.value);
    if (extra) {
      return {
        ficheiro_url: extra.ficheiro_url,
        nome_ficheiro: extra.nome_ficheiro,
        validade: extra.data_validade,
      };
    }
    return null;
  }

  function statusValidade(validade: string | null) {
    if (!validade) return null;
    const dias = differenceInDays(new Date(validade), new Date());
    if (isPast(new Date(validade)))
      return { label: 'Expirado', cls: 'border-destructive/40 bg-destructive/10 text-destructive' };
    if (dias <= 30)
      return {
        label: `Expira em ${dias}d`,
        cls: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
      };
    return {
      label: 'Válido',
      cls: 'border-green-500/40 bg-green-500/10 text-green-600 dark:text-green-400',
    };
  }

  async function handleView(path: string) {
    try {
      const { data, error } = await supabase.storage
        .from('motorista-documentos')
        .createSignedUrl(path, 3600);
      if (error) throw error;
      window.open(data.signedUrl, '_blank');
    } catch {
      toast.error('Erro ao abrir documento');
    }
  }

  async function handleDownload(doc: DocResolvido) {
    try {
      const { data, error } = await supabase.storage
        .from('motorista-documentos')
        .download(doc.ficheiro_url);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.nome_ficheiro || 'documento';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Erro ao descarregar documento');
    }
  }

  // O motorista carrega SEMPRE para motorista_documentos (não escreve na ficha
  // oficial). O backoffice lê motorista_documentos como fallback, por isso o
  // que ele anexa aparece do lado do gestor.
  async function handleUpload(tipo: (typeof TIPOS_DOCUMENTO)[number], file: File) {
    if (!user) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Ficheiro muito grande. Máximo: 10MB');
      return;
    }
    setUploading(tipo.value);
    try {
      const ext = file.name.split('.').pop();
      const path = `${user.id}/${tipo.folder}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('motorista-documentos')
        .upload(path, file, { cacheControl: '3600', upsert: false });
      if (upErr) throw upErr;

      const existente = extras.find((d) => d.tipo_documento === tipo.value);
      if (existente) {
        const { error } = await supabase
          .from('motorista_documentos')
          .update({
            ficheiro_url: path,
            nome_ficheiro: file.name,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existente.id);
        if (error) throw error;
        await supabase.storage.from('motorista-documentos').remove([existente.ficheiro_url]);
      } else {
        const { error } = await supabase.from('motorista_documentos').insert({
          motorista_id: motoristaId,
          tipo_documento: tipo.value,
          ficheiro_url: path,
          nome_ficheiro: file.name,
        });
        if (error) throw error;
      }
      toast.success(`${tipo.label} anexado.`);
      load();
    } catch (e) {
      console.error('Erro ao anexar documento:', e);
      toast.error('Erro ao anexar documento');
    } finally {
      setUploading(null);
    }
  }

  return (
    <Card
      className={cn(
        'leading-relaxed',
        semMoldura
          ? 'border-0 bg-transparent shadow-none rounded-none'
          : 'bg-card border-border shadow-sm rounded-[1.5rem] md:rounded-[2rem] overflow-hidden'
      )}
    >
      {!semMoldura && (
        <CardHeader className="p-5 md:p-8 pb-3 md:pb-4 border-b border-border/50">
          <CardTitle className="text-base md:text-lg font-black text-foreground flex items-center gap-2 md:gap-3">
            <div className="p-2 bg-teal-500/10 rounded-xl">
              <FileText className="w-4 h-4 md:w-5 md:h-5 text-teal-600 dark:text-teal-400" />
            </div>
            Os Meus Documentos
          </CardTitle>
        </CardHeader>
      )}
      <CardContent className="p-0">
        {loading ? (
          <div className="p-5 md:p-8 space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {TIPOS_DOCUMENTO.map((tipo) => {
              const doc = resolveDoc(tipo);
              const st = statusValidade(doc?.validade ?? null);
              return (
                <div
                  key={tipo.value}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 md:px-8 md:py-5"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 bg-muted rounded-xl shrink-0">
                      {doc ? (
                        <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                      ) : (
                        <XCircle className="w-4 h-4 text-muted-foreground/50" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-sm md:text-base text-foreground truncate">
                        {tipo.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {doc ? 'Anexado' : 'Não anexado'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                    {st && (
                      <Badge variant="outline" className={cn('gap-1 font-medium', st.cls)}>
                        {st.label === 'Expirado' && <AlertTriangle className="w-3 h-3" />}
                        {st.label}
                      </Badge>
                    )}

                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      hidden
                      ref={(el) => (inputRefs.current[tipo.value] = el)}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleUpload(tipo, f);
                        e.target.value = '';
                      }}
                    />

                    {doc ? (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 rounded-xl bg-muted text-muted-foreground hover:text-foreground border border-border"
                          onClick={() => handleView(doc.ficheiro_url)}
                          title="Ver"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 rounded-xl bg-muted text-muted-foreground hover:text-foreground border border-border"
                          onClick={() => handleDownload(doc)}
                          title="Descarregar"
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 rounded-xl bg-muted text-muted-foreground hover:text-foreground border border-border"
                          onClick={() => inputRefs.current[tipo.value]?.click()}
                          disabled={uploading === tipo.value}
                          title="Substituir"
                        >
                          <RefreshCw
                            className={cn('w-4 h-4', uploading === tipo.value && 'animate-spin')}
                          />
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl font-bold gap-2"
                        onClick={() => inputRefs.current[tipo.value]?.click()}
                        disabled={uploading === tipo.value}
                      >
                        {uploading === tipo.value ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4" />
                        )}
                        Anexar
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="text-xs text-muted-foreground p-5 md:px-8 md:py-4 border-t border-border/50">
          Formatos: PDF, JPG, PNG · máx. 10MB. O que anexares fica visível para a tua gestora.
        </p>
      </CardContent>
    </Card>
  );
}
