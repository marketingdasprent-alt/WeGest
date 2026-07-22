import { useNavigate, useParams } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Loader2, TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useConsumirTokenRealizacao, useRealizarFromToken } from '@/hooks/useRealizacaoToken';
import { formatMatricula } from '@/components/calendario/calendarioUtils';
import { errorMessage } from '@/utils/errorMessage';
import { useAuth } from '@/contexts/AuthContext';
import {
  type FilePreview,
  tipoLabel,
  cacheKey,
  fileToDataUrl,
  dataUrlToFile,
  validarDadosObrigatorios,
  type RascunhoCache,
} from '@/utils/entrega';
import { gerarFolhaBloco, uploadDanos } from './entrega/entregaOperations';
import {
  StepDadosIniciais,
  StepKmCombustivelFotos,
  StepCondutorDuaObservacoes,
  StepConfirmacaoFolha,
} from './entrega/steps';
import type { AssinaturasHandoverHandle } from '@/components/assinatura/AssinaturasHandoverSection';

// ── Helpers de ficheiros (puros, extraídos para reuso) ──────────────────────

const makeFileHandlers = (setter: React.Dispatch<React.SetStateAction<FilePreview[]>>) => ({
  addFiles(list: FileList | null) {
    if (!list) return;
    setter((prev) => [
      ...prev,
      ...Array.from(list).map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        url: URL.createObjectURL(file),
        localizacao: '',
        descricao: '',
        valor: '',
      })),
    ]);
  },
  updateFoto(id: string, campo: 'localizacao' | 'descricao' | 'valor', valor: string) {
    setter((prev) => prev.map((f) => (f.id === id ? { ...f, [campo]: valor } : f)));
  },
  removeFile(id: string) {
    setter((prev) => prev.filter((f) => f.id !== id));
  },
});

/** Tipo de combustível da viatura (nome do catálogo, com fallback ao texto
 *  legado) — decide se se mostra o nível de combustível, de bateria, ou ambos
 *  (híbridos). Mesma resolução usada em useViaturas.ts. */
function useTipoCombustivel(viaturaId: string | null | undefined) {
  return useQuery({
    queryKey: ['viatura-tipo-combustivel', viaturaId],
    enabled: !!viaturaId,
    queryFn: async (): Promise<string | null> => {
      const { data } = await supabase
        .from('viaturas')
        .select('combustivel, combustivel_id')
        .eq('id', viaturaId!)
        .maybeSingle();
      if (!data) return null;
      if (data.combustivel_id) {
        const { data: cat } = await supabase
          .from('viatura_combustiveis')
          .select('nome')
          .eq('id', data.combustivel_id as string)
          .maybeSingle();
        if (cat?.nome) return cat.nome as string;
      }
      return (data.combustivel as string | null) ?? null;
    },
    staleTime: 60_000,
  });
}

// ── Componente principal ─────────────────────────────────────────────────────

const RealizarEntregaPage = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: info, isLoading, error } = useConsumirTokenRealizacao(token ?? null);
  const realizar = useRealizarFromToken();
  const { user } = useAuth();
  const responsavelNome =
    (user?.user_metadata?.nome as string | undefined) ?? user?.email ?? 'Responsável';

  // Estado do formulário
  const [km, setKm] = useState('');
  const [combustivel, setCombustivel] = useState<string>('');
  const [eletrico, setEletrico] = useState<string>('');
  const [observacoes, setObservacoes] = useState('');
  const [files, setFiles] = useState<FilePreview[]>([]);
  // Troca (mesmo grupo): bloco extra para a viatura que sai do contrato —
  // km/combustível/fotos próprios, associados a viatura_antiga_id.
  const [kmAntiga, setKmAntiga] = useState('');
  const [combustivelAntiga, setCombustivelAntiga] = useState<string>('');
  const [eletricoAntiga, setEletricoAntiga] = useState<string>('');
  const [filesAntiga, setFilesAntiga] = useState<FilePreview[]>([]);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [gerandoFolha, setGerandoFolha] = useState(false);
  const restauradoRef = useRef(false);
  const assinaturasRef = useRef<AssinaturasHandoverHandle>(null);

  const filesH = makeFileHandlers(setFiles);
  const filesAntigaH = makeFileHandlers(setFilesAntiga);
  const isTroca = info?.tipo === 'troca';
  const isDevolucao = info?.tipo === 'recolha';

  // Contexto da folha de danos (viatura, condutor, empresa emissora, cliente,
  // km/comb. de saída) resolvido no servidor a partir do token, via RPC
  // SECURITY DEFINER. Assim NÃO depende de o utilizador ter permissão de
  // renting/contratos — quem faz o check no terreno normalmente não a tem.
  const { data: contexto } = useQuery({
    queryKey: ['folha-danos-contexto', token],
    enabled: !!token,
    queryFn: async () => {
      const empty = {
        viaturaId: null as string | null,
        emissorId: null as string | null,
        anexoDanosTemplateId: null as string | null,
        empresaData: null as Record<string, string | null> | null,
        condutorNome: '',
        condutorEmail: '',
        clienteNome: '',
        kmSaida: null as number | null,
        combustivelSaida: null as string | null,
      };
      if (!token) return empty;
      const { data, error } = await supabase.rpc('contexto_folha_por_token', { p_token: token });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return empty;
      return {
        viaturaId: row.viatura_id ?? null,
        emissorId: row.emissor_id ?? null,
        anexoDanosTemplateId: row.anexo_danos_template_id ?? null,
        empresaData: row.emissor_id
          ? {
              nomeCompleto: row.empresa_nome ?? '',
              nif: row.empresa_nif ?? '',
              sede: row.empresa_sede ?? '',
              licencaTVDE: row.empresa_licenca_tvde ?? '',
              licencaValidade: row.empresa_licenca_validade ?? '',
              representante: row.empresa_representante ?? '',
              cargoRepresentante: row.empresa_cargo_representante ?? '',
              papelTimbrado: row.empresa_papel_timbrado ?? null,
              logoUrl: row.empresa_logo_url ?? null,
            }
          : null,
        condutorNome: row.condutor_nome ?? '',
        condutorEmail: row.condutor_email ?? '',
        clienteNome: row.cliente_nome ?? '',
        kmSaida: (row.km_saida as number | null) ?? null,
        combustivelSaida: (row.combustivel_saida as string | null) ?? null,
      };
    },
  });

  // Troca: id da viatura antiga
  const { data: viaturaAntigaId } = useQuery({
    queryKey: ['viatura-por-matricula', info?.matricula_devolver],
    enabled: isTroca && !!info?.matricula_devolver,
    queryFn: async (): Promise<string | null> => {
      const m = info!.matricula_devolver!.replace(/[\s-]/g, '').toUpperCase();
      const { data } = await supabase
        .from('viaturas')
        .select('id')
        .eq('matricula', m)
        .maybeSingle();
      return (data?.id as string | undefined) ?? null;
    },
  });

  // Odómetro atual de cada viatura envolvida — baseline para bloquear km
  // introduzido inferior ao que a viatura já tem (não anda para trás).
  const { data: viaturaKmAtual = null } = useQuery({
    queryKey: ['viatura-km-atual', contexto?.viaturaId],
    enabled: !!contexto?.viaturaId,
    queryFn: async (): Promise<number | null> => {
      const { data } = await supabase
        .from('viaturas')
        .select('km_atual')
        .eq('id', contexto!.viaturaId!)
        .maybeSingle();
      return (data?.km_atual as number | null) ?? null;
    },
  });
  const { data: viaturaAntigaKmAtual = null } = useQuery({
    queryKey: ['viatura-km-atual', viaturaAntigaId],
    enabled: isTroca && !!viaturaAntigaId,
    queryFn: async (): Promise<number | null> => {
      const { data } = await supabase
        .from('viaturas')
        .select('km_atual')
        .eq('id', viaturaAntigaId!)
        .maybeSingle();
      return (data?.km_atual as number | null) ?? null;
    },
  });

  // Tipo de combustível de cada viatura envolvida — decide se se mostra o
  // seletor de combustível, de bateria, ou ambos (híbridos).
  const { data: tipoCombustivel } = useTipoCombustivel(contexto?.viaturaId);
  const { data: tipoCombustivelAntiga } = useTipoCombustivel(isTroca ? viaturaAntigaId : null);

  // DUA: verificar se viatura tem documentos associados
  const { data: viaturaTemDua = false } = useQuery({
    queryKey: ['viatura-tem-dua', contexto?.viaturaId],
    enabled: isDevolucao && !!contexto?.viaturaId,
    queryFn: async () => {
      const { count } = await supabase
        .from('viatura_documentos')
        .select('id', { count: 'exact', head: true })
        .eq('viatura_id', contexto!.viaturaId!)
        .in('tipo_documento', ['dua_frente', 'dua_verso', 'dua']);
      return (count ?? 0) > 0;
    },
  });
  const [duaDevolvido, setDuaDevolvido] = useState(false);
  // Entrega: o gestor marca se o motorista leva a DUA ORIGINAL consigo.
  const [duaOriginalLevada, setDuaOriginalLevada] = useState(false);
  // Recolha: o contrato já marcou que o motorista tinha levado a DUA original e
  // ainda não foi devolvida → exige confirmar a devolução ao receber a viatura.
  const { data: duaOriginalContrato = false } = useQuery({
    queryKey: ['contrato-dua-original', info?.contrato_id],
    enabled: isDevolucao && !!info?.contrato_id,
    queryFn: async () => {
      const { data } = await supabase
        .from('contratos_renting')
        .select('dua_original_com_motorista, dua_devolvida_em')
        .eq('id', info!.contrato_id)
        .maybeSingle();
      return !!data?.dua_original_com_motorista && !data?.dua_devolvida_em;
    },
  });
  const exigeDua = isDevolucao && (viaturaTemDua || duaOriginalContrato);

  // Restaurar rascunho do cache
  useEffect(() => {
    if (!token || restauradoRef.current) return;
    restauradoRef.current = true;
    try {
      const raw = localStorage.getItem(cacheKey(token));
      if (!raw) return;
      const c = JSON.parse(raw) as RascunhoCache;
      setKm(c.km ?? '');
      setCombustivel(c.combustivel ?? '');
      setEletrico(c.eletricidade ?? '');
      setObservacoes(c.observacoes ?? '');
      if (c.fotos?.length) {
        Promise.all(c.fotos.map((f) => dataUrlToFile(f.dataUrl, f.name, f.type))).then((restored) =>
          setFiles(
            restored.map((file) => ({
              id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              file,
              url: URL.createObjectURL(file),
              localizacao: '',
              descricao: '',
              valor: '',
            }))
          )
        );
      }
    } catch {
      /* cache corrompido */
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
      const cache: RascunhoCache = { km, combustivel, eletricidade: eletrico, observacoes, fotos };
      localStorage.setItem(cacheKey(token), JSON.stringify(cache));
      toast({ title: 'Rascunho guardado', description: 'Podes recarregar sem perder os dados.' });
    } catch (err) {
      toast({ title: 'Erro ao guardar', description: errorMessage(err), variant: 'destructive' });
    }
  };

  const gerarFolhaPreview = async () => {
    if (!info || !token) return;
    const err = validarDadosObrigatorios(
      km,
      combustivel,
      isTroca,
      kmAntiga,
      combustivelAntiga,
      tipoCombustivel,
      eletrico,
      tipoCombustivelAntiga,
      eletricoAntiga,
      viaturaKmAtual,
      viaturaAntigaKmAtual
    );
    if (err) {
      toast({ title: err, variant: 'destructive' });
      return;
    }
    setGerandoFolha(true);
    try {
      const matricula = formatMatricula(info.matricula);
      const params = {
        modo: 'preview' as const,
        assinaturasRef,
        observacoes,
        contexto,
        responsavelNome,
        info,
      };
      await gerarFolhaBloco({
        ...params,
        bloco: {
          matricula,
          viaturaId: contexto?.viaturaId,
          isEntrega: info.tipo !== 'recolha',
          km,
          combustivel,
          eletricidade: eletrico,
          files,
        },
      });
      if (isTroca && info.matricula_devolver && contexto?.viaturaId) {
        await gerarFolhaBloco({
          ...params,
          bloco: {
            matricula: formatMatricula(info.matricula_devolver),
            viaturaId: viaturaAntigaId,
            isEntrega: false,
            km: kmAntiga,
            combustivel: combustivelAntiga,
            eletricidade: eletricoAntiga,
            files: filesAntiga,
          },
        });
      }
    } finally {
      setGerandoFolha(false);
    }
  };

  /**
   * Confirmação da troca: usa a RPC dedicada `realizar_token_troca`, que
   * grava os dados físicos das DUAS viaturas (devolvida + entregue) antes de
   * marcar o evento — por isso não reaproveita handleConfirmar (tipo simples,
   * uma só viatura).
   */
  const handleConfirmarTroca = async () => {
    if (!token || !info || !contexto) return;
    const err = validarDadosObrigatorios(
      km,
      combustivel,
      true,
      kmAntiga,
      combustivelAntiga,
      tipoCombustivel,
      eletrico,
      tipoCombustivelAntiga,
      eletricoAntiga,
      viaturaKmAtual,
      viaturaAntigaKmAtual
    );
    if (err) {
      toast({ title: err, variant: 'destructive' });
      return;
    }

    setUploading(true);
    const uploadedPaths: string[] = [];
    try {
      // Contexto pode não ter resolvido a viatura nova ainda (RPC do token) —
      // fallback ao contrato directamente.
      let vNovaId = contexto.viaturaId;
      if (!vNovaId) {
        const { data: cr } = await supabase
          .from('contratos_renting')
          .select('viatura_id')
          .eq('id', info.contrato_id)
          .maybeSingle();
        vNovaId = (cr?.viatura_id as string | undefined) ?? null;
      }
      if (!vNovaId) throw new Error('Viatura nova do contrato não encontrada.');

      const allPaths = await uploadDanos({
        files,
        filesAntiga,
        viaturaId: vNovaId,
        viaturaAntigaId: viaturaAntigaId ?? null,
        observacoes,
        info,
        userId: user!.id,
        token,
      });
      uploadedPaths.push(...allPaths);

      realizar.mutate(
        {
          token,
          eventoId: info.evento_id,
          contratoId: info.contrato_id,
          tipo: info.tipo,
          troca: {
            viaturaAntigaId: viaturaAntigaId ?? null,
            kmAntiga: Number(kmAntiga),
            combustivelAntiga: combustivelAntiga || null,
            eletricidadeAntiga: eletricoAntiga || null,
            viaturaNovaId: vNovaId,
            kmNova: Number(km),
            combustivelNova: combustivel || null,
            eletricidadeNova: eletrico || null,
          },
        },
        {
          onSuccess: () => {
            const params = {
              modo: 'print' as const,
              assinaturasRef,
              observacoes,
              contexto,
              responsavelNome,
              info,
            };
            gerarFolhaBloco({
              ...params,
              bloco: {
                matricula: formatMatricula(info.matricula_devolver ?? info.matricula),
                viaturaId: viaturaAntigaId,
                isEntrega: false,
                km: kmAntiga,
                combustivel: combustivelAntiga,
                eletricidade: eletricoAntiga,
                files: filesAntiga,
              },
            }).catch(() => {});
            gerarFolhaBloco({
              ...params,
              bloco: {
                matricula: formatMatricula(info.matricula),
                viaturaId: vNovaId,
                isEntrega: true,
                km,
                combustivel,
                eletricidade: eletrico,
                files,
              },
            }).catch(() => {});
            try {
              localStorage.removeItem(cacheKey(token));
            } catch {
              /* ignore */
            }
            setDone(true);
            setUploading(false);
          },
          onError: () => {
            setUploading(false);
          },
        }
      );
    } catch (err: unknown) {
      if (uploadedPaths.length > 0) {
        try {
          await supabase.storage.from('viatura-danos').remove(uploadedPaths);
        } catch {
          /* best-effort */
        }
      }
      toast({
        title: 'Erro ao guardar os danos',
        description: errorMessage(err),
        variant: 'destructive',
      });
      setUploading(false);
    }
  };

  const handleConfirmar = async () => {
    if (!info || !token || !contexto) return;
    if (isTroca) {
      await handleConfirmarTroca();
      return;
    }
    const err = validarDadosObrigatorios(
      km,
      combustivel,
      isTroca,
      kmAntiga,
      combustivelAntiga,
      tipoCombustivel,
      eletrico,
      tipoCombustivelAntiga,
      eletricoAntiga,
      viaturaKmAtual,
      viaturaAntigaKmAtual
    );
    if (err) {
      toast({ title: err, variant: 'destructive' });
      return;
    }
    setUploading(true);
    const uploadedPaths: string[] = [];
    try {
      const allPaths = await uploadDanos({
        files,
        filesAntiga,
        viaturaId: contexto.viaturaId,
        viaturaAntigaId,
        observacoes,
        info,
        userId: user!.id,
        token,
      });
      uploadedPaths.push(...allPaths);
    } catch (err: unknown) {
      if (uploadedPaths.length > 0) {
        try {
          await supabase.storage.from('viatura-danos').remove(uploadedPaths);
        } catch {
          /* best-effort */
        }
      }
      toast({
        title: 'Erro ao guardar os danos',
        description: errorMessage(err),
        variant: 'destructive',
      });
      setUploading(false);
      return;
    }
    realizar.mutate(
      {
        token,
        eventoId: info.evento_id,
        contratoId: info.contrato_id,
        tipo: info.tipo,
        km: Number(km),
        combustivel: combustivel || undefined,
        eletricidade: eletrico || undefined,
        // DUA: gravada dentro da RPC SECURITY DEFINER (robusto p/ quem confirma
        // pelo QR sem permissão renting). Entrega: motorista levou a original;
        // recolha: confirmou a devolução (só conta se o contrato a tinha em falta).
        duaOriginalLevada: info.tipo === 'entrega' ? duaOriginalLevada : undefined,
        duaDevolvida: isDevolucao ? duaDevolvido && duaOriginalContrato : undefined,
      },
      {
        onSuccess: () => {
          const matricula = formatMatricula(info.matricula);
          const params = {
            modo: 'print' as const,
            assinaturasRef,
            observacoes,
            contexto,
            responsavelNome,
            info,
          };
          gerarFolhaBloco({
            ...params,
            bloco: {
              matricula,
              viaturaId: contexto?.viaturaId,
              isEntrega: info.tipo !== 'recolha',
              km,
              combustivel,
              eletricidade: eletrico,
              files,
            },
          }).catch(() => {});
          try {
            localStorage.removeItem(cacheKey(token));
          } catch {
            /* ignore */
          }
          setDone(true);
          setUploading(false);
        },
        onError: () => {
          setUploading(false);
        },
      }
    );
  };

  // ── Estados Early-return ───────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (done) {
    return (
      <div className="max-w-md mx-auto p-6 mt-12">
        <Card className="border-emerald-500/40 bg-emerald-500/5">
          <CardContent className="p-6 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-600" />
            <h2 className="font-semibold text-lg">{tipoLabel(info?.tipo)} confirmada</h2>
            <p className="text-sm text-muted-foreground">
              O evento ficou marcado como realizado. Já podes fechar esta janela.
            </p>
            <Button type="button" onClick={() => navigate('/')} className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Voltar ao início
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
              {error instanceof Error ? error.message : 'Este link já foi usado ou expirou.'}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => window.history.back()}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Render principal ───────────────────────────────────────────────────────

  const isPending = uploading || realizar.isPending;
  const matricula = formatMatricula(info.matricula);
  const matriculaDevolver = info.matricula_devolver
    ? formatMatricula(info.matricula_devolver)
    : null;

  return (
    <div className="max-w-2xl mx-auto px-4 pt-4">
      <StepDadosIniciais
        info={info}
        isPending={isPending}
        acaoBotao={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => window.history.back()}
              disabled={isPending}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
            <Button
              type="button"
              onClick={handleConfirmar}
              disabled={isPending || (exigeDua && !duaDevolvido)}
              className="gap-2"
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar
            </Button>
          </>
        }
      />

      <div className="space-y-4 pb-4 -mt-4">
        {isTroca && matriculaDevolver && (
          <StepKmCombustivelFotos
            titulo={`Viatura devolvida (${matriculaDevolver})`}
            km={kmAntiga}
            onKmChange={setKmAntiga}
            combustivel={combustivelAntiga}
            onCombustivelChange={setCombustivelAntiga}
            eletricidade={eletricoAntiga}
            onEletricidadeChange={setEletricoAntiga}
            tipoCombustivel={tipoCombustivelAntiga}
            files={filesAntiga}
            onAddFiles={filesAntigaH.addFiles}
            onUpdateFoto={filesAntigaH.updateFoto}
            onRemoveFile={filesAntigaH.removeFile}
          />
        )}

        <StepKmCombustivelFotos
          titulo={isTroca ? `Viatura entregue (${matricula})` : 'Dados da viatura'}
          km={km}
          onKmChange={setKm}
          combustivel={combustivel}
          onCombustivelChange={setCombustivel}
          eletricidade={eletrico}
          onEletricidadeChange={setEletrico}
          tipoCombustivel={tipoCombustivel}
          files={files}
          onAddFiles={filesH.addFiles}
          onUpdateFoto={filesH.updateFoto}
          onRemoveFile={filesH.removeFile}
        />

        <StepCondutorDuaObservacoes
          exigeDua={exigeDua}
          duaDevolvido={duaDevolvido}
          onDuaChange={setDuaDevolvido}
          mostraLevaDua={info.tipo === 'entrega'}
          duaOriginalLevada={duaOriginalLevada}
          onDuaOriginalChange={setDuaOriginalLevada}
          observacoes={observacoes}
          onObservacoesChange={setObservacoes}
          assinaturasRef={assinaturasRef}
          condutorNome={contexto?.condutorNome ?? ''}
          responsavelNome={responsavelNome}
        />

        <StepConfirmacaoFolha
          tipo={info.tipo}
          onGuardarRascunho={guardarRascunho}
          onPreview={gerarFolhaPreview}
          gerandoFolha={gerandoFolha}
        />
      </div>
    </div>
  );
};

export default RealizarEntregaPage;
