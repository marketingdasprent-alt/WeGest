import { useNavigate, useParams } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Eye,
  FileText,
  Loader2,
  Save,
  TriangleAlert,
  Upload,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

import { useConsumirTokenRealizacao, useRealizarFromToken } from '@/hooks/useRealizacaoToken';
import { formatMatricula } from '@/components/calendario/calendarioUtils';
import { generateDocumentFromTemplate } from '@/utils/generateDocumentFromTemplate';

interface FilePreview {
  id: string;
  file: File;
  url: string;
  localizacao: string;
  descricao: string;
  valor: string;
}

const LOCALIZACOES = [
  { value: 'frente', label: 'Frente' },
  { value: 'traseira', label: 'Traseira' },
  { value: 'lateral_esq', label: 'Lateral Esquerda' },
  { value: 'lateral_dir', label: 'Lateral Direita' },
  { value: 'teto', label: 'Teto' },
  { value: 'interior', label: 'Interior' },
  { value: 'motor', label: 'Motor' },
  { value: 'outro', label: 'Outro' },
];
const LOCALIZACAO_LABEL: Record<string, string> = Object.fromEntries(
  LOCALIZACOES.map((l) => [l.value, l.label])
);

// ── Cache local (rascunho) ─────────────────────────────────────────────────
// Permite ao gestor preencher, pré-visualizar a folha e, se algo estiver
// errado, recarregar/voltar sem perder o trabalho. Fotos guardadas em base64.
interface RascunhoCache {
  km: string;
  combustivel: string;
  observacoes: string;
  fotos: {
    name: string;
    type: string;
    dataUrl: string;
    localizacao: string;
    descricao: string;
    valor: string;
  }[];
}

const cacheKey = (token: string) => `realizar-rascunho-${token}`;

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const dataUrlToFile = async (dataUrl: string, name: string, type: string): Promise<File> => {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], name, { type: type || blob.type });
};

const RealizarEntregaPage = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: info, isLoading, error } = useConsumirTokenRealizacao(token ?? null);
  const realizar = useRealizarFromToken();

  const [km, setKm] = useState('');
  const [combustivel, setCombustivel] = useState<string>('');
  const [observacoes, setObservacoes] = useState('');
  const [files, setFiles] = useState<FilePreview[]>([]);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [gerandoFolha, setGerandoFolha] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const restauradoRef = useRef(false);

  // Contexto da folha: viatura (danos), empresa emissora (cabeçalho) e condutor
  // principal (assinatura). Resolvido uma vez e lido pelo preview/confirmar.
  const contratoId = info?.contrato_id;
  const { data: contexto } = useQuery({
    queryKey: ['folha-danos-contexto', contratoId],
    enabled: !!contratoId,
    queryFn: async () => {
      const { data } = await supabase
        .from('contratos_renting')
        .select('viatura_id, emissor_id, cliente_id')
        .eq('id', contratoId!)
        .maybeSingle();
      const empty = {
        viaturaId: null as string | null,
        emissorId: null as string | null,
        empresaData: null as Record<string, string> | null,
        condutorNome: '',
        clienteNome: '',
      };
      if (!data) return empty;

      // Empresa emissora → {{empresa_*}}.
      let empresaData: Record<string, string> | null = null;
      if (data.emissor_id) {
        const { data: emp } = await supabase
          .from('clientes')
          .select(
            'nome, nome_comercial, nif, sede, representante, cargo_representante, licenca_tvde, licenca_validade'
          )
          .eq('id', data.emissor_id)
          .maybeSingle();
        if (emp) {
          empresaData = {
            nomeCompleto: emp.nome_comercial || emp.nome || '',
            nif: emp.nif ?? '',
            sede: emp.sede ?? '',
            licencaTVDE: emp.licenca_tvde ?? '',
            licencaValidade: emp.licenca_validade ?? '',
            representante: emp.representante ?? '',
            cargoRepresentante: emp.cargo_representante ?? '',
          };
        }
      }

      // Condutor principal (contrato_condutores) → {{motorista_nome}}. Nunca o
      // locatário/empresa. Sem condutor, fica vazio para assinatura à mão.
      let condutorNome = '';
      const { data: cond } = await supabase
        .from('contrato_condutores')
        .select('cliente_id, is_principal')
        .eq('contrato_id', contratoId!)
        .order('is_principal', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cond?.cliente_id) {
        const { data: cli } = await supabase
          .from('clientes')
          .select('nome, nome_comercial')
          .eq('id', cond.cliente_id)
          .maybeSingle();
        if (cli) condutorNome = cli.nome || cli.nome_comercial || '';
      }
      // Sem condutor no contrato → o motorista atribuído à viatura (TVDE).
      if (!condutorNome && data.viatura_id) {
        const { data: mv } = await supabase
          .from('motorista_viaturas')
          .select('motorista_id')
          .eq('viatura_id', data.viatura_id)
          .limit(1)
          .maybeSingle();
        if (mv?.motorista_id) {
          const { data: mot } = await supabase
            .from('motoristas_ativos')
            .select('nome')
            .eq('id', mv.motorista_id)
            .maybeSingle();
          if (mot?.nome) condutorNome = mot.nome;
        }
      }

      // Cliente/locatário → {{cliente_nome}}.
      let clienteNome = '';
      if (data.cliente_id) {
        const { data: cli } = await supabase
          .from('clientes')
          .select('nome, nome_comercial')
          .eq('id', data.cliente_id)
          .maybeSingle();
        if (cli) clienteNome = cli.nome_comercial || cli.nome || '';
      }

      return {
        viaturaId: (data.viatura_id as string | undefined) ?? null,
        emissorId: (data.emissor_id as string | undefined) ?? null,
        empresaData,
        condutorNome,
        clienteNome,
      };
    },
  });

  // Restaurar rascunho do cache uma vez, quando o token resolve.
  useEffect(() => {
    if (!token || restauradoRef.current) return;
    restauradoRef.current = true;
    try {
      const raw = localStorage.getItem(cacheKey(token));
      if (!raw) return;
      const c = JSON.parse(raw) as RascunhoCache;
      setKm(c.km ?? '');
      setCombustivel(c.combustivel ?? '');
      setObservacoes(c.observacoes ?? '');
      if (c.fotos?.length) {
        Promise.all(
          c.fotos.map(async (f) => ({
            file: await dataUrlToFile(f.dataUrl, f.name, f.type),
            localizacao: f.localizacao ?? '',
            descricao: f.descricao ?? '',
            valor: f.valor ?? '',
          }))
        ).then((restored) =>
          setFiles(
            restored.map((r) => ({
              id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              file: r.file,
              url: URL.createObjectURL(r.file),
              localizacao: r.localizacao,
              descricao: r.descricao,
              valor: r.valor,
            }))
          )
        );
      }
    } catch {
      /* cache corrompido — ignora */
    }
  }, [token]);

  const guardarRascunho = async () => {
    if (!token) return;
    try {
      const fotos = await Promise.all(
        files.map(async (f) => ({
          name: f.file.name,
          type: f.file.type,
          dataUrl: await fileToDataUrl(f.file),
          localizacao: f.localizacao,
          descricao: f.descricao,
          valor: f.valor,
        }))
      );
      const cache: RascunhoCache = { km, combustivel, observacoes, fotos };
      localStorage.setItem(cacheKey(token), JSON.stringify(cache));
      toast({ title: 'Rascunho guardado', description: 'Podes recarregar sem perder os dados.' });
    } catch (err) {
      toast({
        title: 'Erro ao guardar',
        description: err instanceof Error ? err.message : 'Limite de armazenamento atingido?',
        variant: 'destructive',
      });
    }
  };

  // Gera a folha de danos com os dados actuais. modo 'preview' abre em nova
  // aba; 'print' envia para impressão.
  const gerarFolha = async (modo: 'preview' | 'print') => {
    if (!info) return;
    if (!km.trim() || !combustivel) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Preenche o km e o nível de combustível antes de gerar a folha.',
        variant: 'destructive',
      });
      return;
    }
    setGerandoFolha(true);
    try {
      // Folha de Danos única e partilhada por org (RLS filtra a org).
      const { data: tmplRows } = await supabase
        .from('document_templates')
        .select('id')
        .eq('tipo', 'anexo_danos')
        .eq('ativo', true)
        .limit(1);
      const tmplId = tmplRows?.[0]?.id ?? null;
      if (!tmplId) {
        toast({
          title: 'Sem template',
          description: 'Não existe uma Folha de Danos activa. Cria uma em Documentos.',
          variant: 'destructive',
        });
        return;
      }
      const tmpl = { id: tmplId };
      const isEntrega = info.tipo === 'entrega';
      // Na pré-visualização, as fotos ainda não estão na BD — passa-as como
      // data URLs para aparecerem na folha. No print (após confirmar) já estão
      // gravadas como dano, por isso não as duplicamos aqui.
      const fotosMomento =
        modo === 'preview' && files.length
          ? await Promise.all(files.map((f) => fileToDataUrl(f.file)))
          : undefined;
      // Danos locais (preview): cada foto com descrição/localização vira linha.
      const danosMomento =
        modo === 'preview'
          ? files
              .filter((f) => f.descricao.trim() || f.localizacao)
              .map((f) => ({
                localizacao: f.localizacao || '—',
                descricao: f.descricao.trim() || '—',
                estado: 'existente',
                data: format(new Date(), 'dd/MM/yyyy'),
                valor: f.valor.trim() ? `${Number(f.valor).toFixed(2)} €` : undefined,
              }))
          : undefined;
      const hoje = new Date().toISOString().slice(0, 10);
      const pdf = await generateDocumentFromTemplate({
        templateId: tmpl.id,
        motoristaData: { nome: contexto?.condutorNome ?? '' },
        documentData: {
          viatura_matricula: info.matricula,
          data_assinatura: hoje,
          cidade_assinatura: info.cidade ?? '',
          clienteData: { nome: contexto?.clienteNome ?? '' },
          ...(contexto?.empresaData ? { empresaData: contexto.empresaData } : {}),
        },
        viaturaId: contexto?.viaturaId ?? undefined,
        momentoFolha: isEntrega ? 'ENTREGA' : 'RECOLHA',
        observacoesMomento: observacoes,
        ...(isEntrega
          ? { km_saida: km, combustivel_saida: combustivel }
          : { km_entrada: km, combustivel_entrada: combustivel }),
        ...(fotosMomento ? { fotosMomento } : {}),
        ...(danosMomento?.length ? { danosMomento } : {}),
        action: modo === 'print' ? 'print' : 'download',
        skipOutput: modo === 'preview',
      });
      if (modo === 'preview' && pdf) {
        window.open(pdf.output('bloburl'), '_blank');
      }
    } catch (err) {
      toast({
        title: 'Erro ao gerar folha',
        description: err instanceof Error ? err.message : 'Erro inesperado',
        variant: 'destructive',
      });
    } finally {
      setGerandoFolha(false);
    }
  };

  const handleAddFiles = (list: FileList | null) => {
    if (!list) return;
    const novos: FilePreview[] = Array.from(list).map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file: f,
      url: URL.createObjectURL(f),
      localizacao: '',
      descricao: '',
      valor: '',
    }));
    setFiles((prev) => [...prev, ...novos]);
  };

  const updateFoto = (id: string, campo: 'localizacao' | 'descricao' | 'valor', valor: string) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, [campo]: valor } : f)));
  };

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const found = prev.find((f) => f.id === id);
      if (found) URL.revokeObjectURL(found.url);
      return prev.filter((f) => f.id !== id);
    });
  };

  const handleConfirmar = async () => {
    if (!token || !info) return;
    if (!km.trim() || !combustivel) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Preenche o km e o nível de combustível.',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    // Paths já enviados ao storage — para limpar em caso de falha e não
    // deixar ficheiros órfãos (upload a meio falhou ou o insert rebentou).
    const uploadedPaths: string[] = [];
    try {
      if (files.length > 0) {
        const { data: auth } = await supabase.auth.getUser();
        const userId = auth.user?.id ?? null;

        // Garantir a viatura (o contexto pode não ter resolvido ainda).
        let vId = contexto?.viaturaId ?? null;
        if (!vId) {
          const { data: cr } = await supabase
            .from('contratos_renting')
            .select('viatura_id')
            .eq('id', info.contrato_id)
            .maybeSingle();
          vId = (cr?.viatura_id as string | undefined) ?? null;
        }
        if (!vId) throw new Error('Viatura do contrato não encontrada.');

        const isEntrega = info.tipo === 'entrega';
        // Cada foto vira um registo de dano com a localização/descrição/valor
        // que o gestor escreveu, ligado ao contrato → aparece na tabela da
        // folha e na página do veículo. As observações gerais vão no campo
        // observacoes de cada registo.
        for (const fp of files) {
          const valorNum = fp.valor.trim() ? Number(fp.valor) : null;
          const { data: dano, error: dErr } = await supabase
            .from('viatura_danos')
            .insert({
              viatura_id: vId,
              localizacao: fp.localizacao || null,
              descricao: fp.descricao.trim() || `Registo ${isEntrega ? 'entrega' : 'recolha'}`,
              valor: valorNum != null && !Number.isNaN(valorNum) ? valorNum : null,
              observacoes: observacoes.trim() || null,
              estado: 'existente',
              contrato_renting_id: info.contrato_id,
              registado_por: userId,
            })
            .select('id')
            .single();
          if (dErr) throw dErr;

          const ext = fp.file.name.split('.').pop() || 'bin';
          const path = `${dano.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from('viatura-danos')
            .upload(path, fp.file, { contentType: fp.file.type });
          if (upErr) throw upErr;
          uploadedPaths.push(path);
          const { error: fErr } = await supabase.from('viatura_dano_fotos').insert({
            dano_id: dano.id,
            ficheiro_url: path,
            nome_ficheiro: fp.file.name,
            uploaded_by: userId,
          });
          if (fErr) throw fErr;
        }
      }

      realizar.mutate(
        {
          token,
          eventoId: info.evento_id,
          contratoId: info.contrato_id,
          tipo: info.tipo,
        },
        {
          onSuccess: () => {
            setDone(true);
            // Imprime a folha de danos do momento e limpa o rascunho.
            void gerarFolha('print');
            try {
              localStorage.removeItem(cacheKey(token));
            } catch {
              /* ignore */
            }
          },
        }
      );
    } catch (err: unknown) {
      // Limpa ficheiros já enviados para não ficarem órfãos no bucket.
      if (uploadedPaths.length > 0) {
        try {
          await supabase.storage.from('viatura-danos').remove(uploadedPaths);
        } catch {
          /* limpeza best-effort — não mascarar o erro original */
        }
      }
      toast({
        title: 'Erro no upload',
        description: err instanceof Error ? err.message : 'Erro inesperado',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Verificar `done` ANTES de error/missing info — após a mutation o token
  // fica `used_at` preenchido e qualquer refetch da RPC consumir_token
  // dá erro. Sem este check, o sucesso seria mascarado pela página de
  // "Token expirado".
  if (done) {
    return (
      <div className="max-w-md mx-auto p-6 mt-12">
        <Card className="border-emerald-500/40 bg-emerald-500/5">
          <CardContent className="p-6 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-600" />
            <h2 className="font-semibold text-lg">
              {info?.tipo === 'entrega' ? 'Entrega' : 'Recolha'} confirmada
            </h2>
            <p className="text-sm text-muted-foreground">
              O evento ficou marcado como realizado. Já podes fechar esta janela.
            </p>
            <Button type="button" onClick={() => navigate('/')} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Voltar ao início
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !info) {
    return (
      <div className="max-w-md mx-auto p-6 mt-12">
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-6 text-center space-y-3">
            <TriangleAlert className="h-10 w-10 mx-auto text-destructive" />
            <h2 className="font-semibold text-lg">Token inválido ou expirado</h2>
            <p className="text-sm text-muted-foreground">
              {error instanceof Error
                ? error.message
                : 'Este link já foi usado ou expirou. Pede um novo QR no laptop.'}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => window.history.back()}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const matricula = formatMatricula(info.matricula);
  const isPending = uploading || realizar.isPending;

  return (
    <div className="max-w-2xl mx-auto">
      <StickyPageHeader
        title={info.tipo === 'entrega' ? 'Realizar Entrega' : 'Realizar Recolha'}
        description={`${matricula}${info.cidade ? ` · ${info.cidade}` : ''} · ${format(
          new Date(info.data_inicio),
          "dd/MM 'às' HH:mm",
          { locale: pt }
        )}`}
        icon={CheckCircle2}
      >
        <Button type="button" onClick={handleConfirmar} disabled={isPending} className="gap-2">
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Confirmar
        </Button>
      </StickyPageHeader>

      <div className="p-4 space-y-4">
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="km">
                KM Actual <span className="text-red-500">*</span>
              </Label>
              <Input
                id="km"
                type="number"
                inputMode="numeric"
                value={km}
                onChange={(e) => setKm(e.target.value)}
                placeholder="Ex: 45120"
              />
            </div>

            <div className="space-y-2">
              <Label>
                Combustível <span className="text-red-500">*</span>
              </Label>
              <div className="grid grid-cols-5 gap-2">
                {['Reserva', '1/4', '1/2', '3/4', 'Cheio'].map((nivel) => (
                  <button
                    key={nivel}
                    type="button"
                    onClick={() => setCombustivel(nivel)}
                    className={`rounded-md border-2 py-2 text-sm font-medium transition-colors ${
                      combustivel === nivel
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:border-primary/40'
                    }`}
                  >
                    {nivel}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="obs">Observações</Label>
              <Textarea
                id="obs"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={2}
                placeholder="Ex: pequeno risco no para-choques direito"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-3">
            <Label>Fotos / Vídeos</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => cameraInputRef.current?.click()}
                className="gap-2"
              >
                <Camera className="h-4 w-4" />
                Câmara
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                Ficheiros
              </Button>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                hidden
                onChange={(e) => handleAddFiles(e.target.files)}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                hidden
                onChange={(e) => handleAddFiles(e.target.files)}
              />
            </div>

            {files.length > 0 && (
              <div className="space-y-3 mt-3">
                <p className="text-xs text-muted-foreground">
                  Descreve cada foto (localização, descrição e valor) — vai para a tabela de danos
                  da folha.
                </p>
                {files.map((f) => (
                  <div key={f.id} className="flex flex-col gap-3 rounded-md border p-2 sm:flex-row">
                    <div className="relative mx-auto shrink-0 sm:mx-0">
                      <img
                        src={f.url}
                        alt={f.file.name}
                        className="h-24 w-24 rounded border object-cover sm:h-20 sm:w-20"
                      />
                      <button
                        type="button"
                        onClick={() => removeFile(f.id)}
                        className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-white"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
                      <select
                        value={f.localizacao}
                        onChange={(e) => updateFoto(f.id, 'localizacao', e.target.value)}
                        className="h-9 min-w-0 rounded-md border border-input bg-background px-2 text-sm"
                      >
                        <option value="">Localização…</option>
                        {LOCALIZACOES.map((l) => (
                          <option key={l.value} value={l.value}>
                            {l.label}
                          </option>
                        ))}
                      </select>
                      <Input
                        type="number"
                        inputMode="decimal"
                        placeholder="Valor (€)"
                        value={f.valor}
                        onChange={(e) => updateFoto(f.id, 'valor', e.target.value)}
                        className="h-9 min-w-0"
                      />
                      <Input
                        placeholder="Descrição do dano"
                        value={f.descricao}
                        onChange={(e) => updateFoto(f.id, 'descricao', e.target.value)}
                        className="col-span-2 h-9"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Folha de Danos — guardar rascunho + pré-visualizar antes de confirmar */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Label className="m-0">
                Folha de Danos ({info.tipo === 'entrega' ? 'Entrega' : 'Recolha'})
              </Label>
            </div>
            <p className="text-sm text-muted-foreground">
              Guarda o rascunho e pré-visualiza a folha. Se algo estiver errado, ajusta e
              pré-visualiza de novo. Ao confirmar, a folha é impressa automaticamente.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button type="button" variant="outline" onClick={guardarRascunho} className="gap-2">
                <Save className="h-4 w-4" />
                Guardar rascunho
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => gerarFolha('preview')}
                disabled={gerandoFolha}
                className="gap-2"
              >
                {gerandoFolha ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
                Pré-visualizar folha
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default RealizarEntregaPage;
