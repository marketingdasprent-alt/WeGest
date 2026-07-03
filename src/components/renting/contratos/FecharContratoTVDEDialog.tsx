import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import {
  Calendar,
  Camera,
  Car,
  Euro,
  Eye,
  FileText,
  Film,
  Loader2,
  MessageSquareText,
  Sparkles,
  Upload,
  X,
  XCircle,
} from 'lucide-react';

import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { COMBUSTIVEL_NIVEL_OPTS } from '@/utils/combustivel';
import { useFecharContratoTVDE } from '@/hooks/useContratosRenting';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { generateDocumentFromTemplate } from '@/utils/generateDocumentFromTemplate';
import { emailFolhaDanos } from '@/lib/emailFolhaDanos';
import {
  AssinaturasHandoverSection,
  type AssinaturasHandoverHandle,
} from '@/components/assinatura/AssinaturasHandoverSection';
import { toast } from 'sonner';

const schema = z.object({
  tipoEvento: z.enum(['recolhido', 'devolvido'], {
    required_error: 'Selecciona o que foi feito com a viatura.',
  }),
  dataEvento: z.string().min(1, 'A data é obrigatória'),
  motivo: z.string().optional(),
  valorDivida: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== '' ? parseFloat(v.replace(',', '.')) : undefined))
    .pipe(z.number().positive().optional()),
});

type FormInput = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

interface SelectedFile {
  id: string;
  file: File;
  preview: string | null;
}

interface FecharContratoTVDEDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contratoId: string;
  contratoCodigo: number;
  motoristaId?: string | null;
  matricula?: string | null;
  viaturaId?: string | null;
}

export const FecharContratoTVDEDialog: React.FC<FecharContratoTVDEDialogProps> = ({
  open,
  onOpenChange,
  contratoId,
  contratoCodigo,
  motoristaId,
  matricula,
  viaturaId,
}) => {
  const fecharMutation = useFecharContratoTVDE();
  const { user } = useAuth();
  const responsavelNome =
    (user?.user_metadata?.nome as string | undefined) ?? user?.email ?? 'Responsável';

  const form = useForm<FormInput>({
    resolver: zodResolver(schema),
    defaultValues: { tipoEvento: undefined, dataEvento: '', motivo: '', valorDivida: '' },
  });

  // Registar a recolha (km/combustível/fotos) já no fecho — evita ter de ir
  // depois ao Calendário para o check-in. Estado próprio (fora do zod) pelo
  // mesmo padrão usado em RealizarEntregaPage/CheckOutPendentesDrawer.
  const [registarAgora, setRegistarAgora] = useState(false);
  const [km, setKm] = useState('');
  const [combustivel, setCombustivel] = useState('');
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const assinaturasRef = useRef<AssinaturasHandoverHandle>(null);
  const [gerandoFolha, setGerandoFolha] = useState(false);

  // Contexto para a Folha de Danos (condutor, cliente, empresa emissora, km/
  // combustível de saída) — mesma query/chave usada em RealizarEntregaPage,
  // por isso partilha a cache quando é o mesmo contrato.
  const { data: contexto } = useQuery({
    queryKey: ['folha-danos-contexto', contratoId],
    enabled: open && !!contratoId,
    queryFn: async () => {
      const { data } = await supabase
        .from('contratos_renting')
        .select('viatura_id, emissor_id, cliente_id, km_saida, combustivel_saida')
        .eq('id', contratoId)
        .maybeSingle();
      const empty = {
        viaturaId: null as string | null,
        empresaData: null as Record<string, string> | null,
        condutorNome: '',
        condutorEmail: '',
        clienteNome: '',
        kmSaida: null as number | null,
        combustivelSaida: null as string | null,
      };
      if (!data) return empty;

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

      let condutorNome = '';
      let condutorEmail = '';
      const { data: cond } = await supabase
        .from('contrato_condutores')
        .select('cliente_id, motorista_id, is_principal')
        .eq('contrato_id', contratoId)
        .order('is_principal', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cond?.cliente_id) {
        const { data: cli } = await supabase
          .from('clientes')
          .select('nome, nome_comercial, email')
          .eq('id', cond.cliente_id)
          .maybeSingle();
        if (cli) {
          condutorNome = cli.nome || cli.nome_comercial || '';
          condutorEmail = cli.email || '';
        }
      } else if (cond?.motorista_id) {
        const { data: mot } = await supabase
          .from('motoristas_ativos')
          .select('nome, email')
          .eq('id', cond.motorista_id)
          .maybeSingle();
        if (mot?.nome) condutorNome = mot.nome;
        condutorEmail = mot?.email || '';
      }
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
            .select('nome, email')
            .eq('id', mv.motorista_id)
            .maybeSingle();
          if (mot?.nome) condutorNome = mot.nome;
          condutorEmail = mot?.email || '';
        }
      }

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
        empresaData,
        condutorNome,
        condutorEmail,
        clienteNome,
        kmSaida: (data.km_saida as number | null) ?? null,
        combustivelSaida: (data.combustivel_saida as string | null) ?? null,
      };
    },
  });

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const novos: SelectedFile[] = Array.from(list).map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file: f,
      preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : null,
    }));
    setFiles((prev) => [...prev, ...novos]);
  };

  const handleDropFiles = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFiles(false);
    addFiles(e.dataTransfer.files);
  };

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const found = prev.find((f) => f.id === id);
      if (found?.preview) URL.revokeObjectURL(found.preview);
      return prev.filter((f) => f.id !== id);
    });
  };

  const resetRecolhaState = () => {
    setRegistarAgora(false);
    setKm('');
    setCombustivel('');
    files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
    setFiles([]);
  };

  // Gera a Folha de Danos da recolha — mesmo fluxo do RealizarEntregaPage.
  // 'preview' abre numa nova aba para o gestor conferir antes de fechar;
  // 'print' corre depois do fecho ter sucesso, imprime e envia por email.
  // Falhas em 'print' nunca bloqueiam o fecho — só mostram um aviso.
  const gerarFolha = async (modo: 'preview' | 'print') => {
    if (!km.trim() || !combustivel) {
      toast.error('Preenche o KM e o combustível antes de gerar a folha.');
      return;
    }
    setGerandoFolha(true);
    try {
      const { data: tmplRows } = await supabase
        .from('document_templates')
        .select('id')
        .eq('tipo', 'anexo_danos')
        .eq('ativo', true)
        .limit(1);
      const tmplId = tmplRows?.[0]?.id ?? null;
      if (!tmplId) {
        toast.error('Não existe uma Folha de Danos activa. Cria uma em Documentos.');
        return;
      }

      const sigs = assinaturasRef.current?.getAssinaturas() ?? {
        motorista: null,
        responsavel: null,
      };
      const hoje = new Date().toISOString().slice(0, 10);
      const motivo = form.getValues('motivo');
      // Na pré-visualização as fotos ainda não estão gravadas — passa-as
      // como data URLs para aparecerem na folha (mesmo padrão de RealizarEntregaPage).
      const fotosMomento =
        modo === 'preview' && files.length
          ? await Promise.all(
              files.map(
                (f) =>
                  new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(f.file);
                  })
              )
            )
          : undefined;
      const pdf = await generateDocumentFromTemplate({
        templateId: tmplId,
        motoristaData: { nome: contexto?.condutorNome ?? '' },
        documentData: {
          viatura_matricula: matricula ?? '',
          data_assinatura: hoje,
          clienteData: { nome: contexto?.clienteNome ?? '' },
          assinatura_motorista: sigs.motorista ?? '',
          assinatura_responsavel: sigs.responsavel ?? '',
          responsavel_nome: responsavelNome,
          momento_responsavel: 'Recolhido por',
          ...(contexto?.empresaData ? { empresaData: contexto.empresaData } : {}),
        },
        viaturaId: contexto?.viaturaId ?? viaturaId ?? undefined,
        contratoId,
        momentoFolha: 'RECOLHA',
        observacoesMomento: motivo,
        km_entrada: km,
        combustivel_entrada: combustivel,
        km_saida: contexto?.kmSaida?.toString() ?? '',
        combustivel_saida: contexto?.combustivelSaida ?? '',
        ...(fotosMomento ? { fotosMomento } : {}),
        action: modo === 'print' ? 'print' : 'download',
        skipOutput: modo === 'preview',
      });
      if (modo === 'preview' && pdf) {
        window.open(pdf.output('bloburl'), '_blank');
      }
      if (modo === 'print' && pdf) {
        void emailFolhaDanos({
          pdf,
          to: contexto?.condutorEmail,
          toNome: contexto?.condutorNome,
          matricula: matricula ?? '',
          momento: 'RECOLHA',
        });
      }
    } catch {
      toast.warning(
        modo === 'print'
          ? 'Contrato fechado, mas não foi possível gerar a folha de danos.'
          : 'Não foi possível gerar a pré-visualização.'
      );
    } finally {
      setGerandoFolha(false);
    }
  };

  // O zodResolver já corre o schema (incl. transform/pipe) antes de chamar
  // onSubmit — `values` aqui é na verdade o OUTPUT do schema (valorDivida já é
  // number), apesar do tipo do formulário (FormInput) dizer string. A versão
  // instalada do @hookform/resolvers não propaga o tipo transformado através
  // do useForm, daí o cast explícito. Voltar a fazer schema.parse(values)
  // rebentava, porque o passo z.string() inicial já não batia certo com um number.
  const onSubmit = async (raw: FormInput) => {
    const values = raw as unknown as FormOutput;

    if (registarAgora) {
      if (!km.trim() || Number.isNaN(Number(km))) {
        toast.error('Indica o KM actual para registar a recolha.');
        return;
      }
      if (!combustivel) {
        toast.error('Indica o nível de combustível para registar a recolha.');
        return;
      }
      if (files.length > 0 && !viaturaId) {
        toast.error('Este contrato não tem viatura associada — não é possível anexar fotos.');
        return;
      }
    }

    await fecharMutation.mutateAsync({
      contratoId,
      contratoCodigo,
      motoristaId,
      matricula,
      viaturaId,
      tipoEvento: values.tipoEvento,
      dataEvento: new Date(values.dataEvento).toISOString(),
      motivo: values.motivo,
      valorDivida: values.valorDivida,
      recolha: registarAgora ? { km, combustivel, fotos: files.map((f) => f.file) } : undefined,
    });
    if (registarAgora) {
      await gerarFolha('print');
    }
    form.reset();
    resetRecolhaState();
    onOpenChange(false);
  };

  const isPending = fecharMutation.isPending || gerandoFolha;
  const temMotorista = !!motoristaId;
  const tipoEvento = form.watch('tipoEvento');

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (isPending) return;
        if (!v) resetRecolhaState();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-6xl w-[96vw] h-[92vh] p-0 gap-0 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b bg-gradient-to-r from-destructive/10 via-destructive/5 to-transparent shrink-0">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-destructive/15 p-2">
              <XCircle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <h2 className="text-lg font-semibold leading-tight">
                Fechar contrato #{contratoCodigo}
              </h2>
              <p className="text-sm text-muted-foreground">
                Indica o que foi feito com a viatura e, se quiseres, regista a recolha já aqui.
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => e.preventDefault()}
          className="flex-1 overflow-y-auto px-6 py-5"
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            {/* Coluna esquerda: o que aconteceu + valor em dívida */}
            <div className="space-y-4">
              {/* ── Secção azul: o que aconteceu ── */}
              <section className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 space-y-4 dark:border-blue-900/50 dark:bg-blue-950/20">
                <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-300 flex items-center gap-2">
                  <Car className="h-4 w-4" />O que aconteceu com a viatura?
                </h3>

                <div className="space-y-2">
                  <Label>Tipo *</Label>
                  <RadioGroup
                    value={tipoEvento}
                    onValueChange={(v) =>
                      form.setValue('tipoEvento', v as 'recolhido' | 'devolvido', {
                        shouldValidate: true,
                      })
                    }
                    className="flex gap-6"
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="recolhido" id="tipo-recolhido" />
                      <Label htmlFor="tipo-recolhido" className="cursor-pointer font-normal">
                        Recolhida
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="devolvido" id="tipo-devolvido" />
                      <Label htmlFor="tipo-devolvido" className="cursor-pointer font-normal">
                        Devolvida
                      </Label>
                    </div>
                  </RadioGroup>
                  {form.formState.errors.tipoEvento && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.tipoEvento.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dataEvento" className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    Data *
                  </Label>
                  <Input
                    id="dataEvento"
                    type="datetime-local"
                    className="bg-background"
                    {...form.register('dataEvento')}
                  />
                  {form.formState.errors.dataEvento && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.dataEvento.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="motivo" className="flex items-center gap-1.5">
                    <MessageSquareText className="h-3.5 w-3.5" />
                    Motivo (opcional)
                  </Label>
                  <Textarea
                    id="motivo"
                    placeholder="Ex: fim de contrato, rescisão por acordo, ..."
                    rows={3}
                    className="bg-background resize-none"
                    {...form.register('motivo')}
                  />
                </div>
              </section>

              {/* ── Secção âmbar: valor em dívida ── */}
              <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-3 dark:border-amber-900/50 dark:bg-amber-950/20">
                <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-300 flex items-center gap-2">
                  <Euro className="h-4 w-4" />
                  Valor em Dívida
                </h3>
                <div className="space-y-1.5">
                  <Label htmlFor="valorDivida" className="text-xs">
                    {temMotorista
                      ? 'Opcional — fica como débito pendente no financeiro do motorista.'
                      : 'Sem motorista associado — não será registado.'}
                  </Label>
                  <div className="relative">
                    <Input
                      id="valorDivida"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0,00"
                      className="pr-10 bg-background"
                      disabled={!temMotorista}
                      {...form.register('valorDivida')}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      €
                    </span>
                  </div>
                  {form.formState.errors.valorDivida && (
                    <p className="text-sm text-destructive">
                      {String(form.formState.errors.valorDivida.message)}
                    </p>
                  )}
                </div>
              </section>
            </div>

            {/* Coluna direita: registar recolha agora */}
            <div>
              {/* ── Secção esmeralda: registar recolha agora ── */}
              <section
                className={cn(
                  'rounded-xl border p-4 space-y-3 transition-colors',
                  registarAgora
                    ? 'border-emerald-300 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/25'
                    : 'border-border bg-muted/30'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3
                    className={cn(
                      'text-sm font-semibold flex items-center gap-2',
                      registarAgora ? 'text-emerald-900 dark:text-emerald-300' : 'text-foreground'
                    )}
                  >
                    <Sparkles className="h-4 w-4" />
                    Registar a recolha agora
                  </h3>
                  <Switch
                    id="registar-agora"
                    checked={registarAgora}
                    onCheckedChange={setRegistarAgora}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  KM, combustível e fotos — sem precisar de ir depois ao Calendário.
                </p>

                {registarAgora && (
                  <div className="space-y-3 pt-1 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="km-recolha" className="text-xs">
                          KM Actual <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="km-recolha"
                          type="number"
                          inputMode="numeric"
                          value={km}
                          onChange={(e) => setKm(e.target.value)}
                          placeholder="Ex: 45120"
                          className="bg-background"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">
                          Combustível <span className="text-red-500">*</span>
                        </Label>
                        <div className="grid grid-cols-5 gap-1">
                          {COMBUSTIVEL_NIVEL_OPTS.map((nivel) => (
                            <button
                              key={nivel}
                              type="button"
                              onClick={() => setCombustivel(nivel)}
                              title={nivel}
                              className={cn(
                                'rounded-md border-2 py-1.5 text-[10px] font-medium transition-colors',
                                combustivel === nivel
                                  ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                  : 'border-border bg-background hover:border-emerald-400/50'
                              )}
                            >
                              {nivel}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Fotos / Vídeos (opcional)</Label>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,video/*"
                        multiple
                        hidden
                        onChange={(e) => addFiles(e.target.files)}
                      />
                      <input
                        ref={cameraInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        multiple
                        hidden
                        onChange={(e) => addFiles(e.target.files)}
                      />
                      <div
                        onDragEnter={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsDraggingFiles(true);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
                          setIsDraggingFiles(true);
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsDraggingFiles(false);
                        }}
                        onDrop={handleDropFiles}
                        className={cn(
                          'rounded-md border-2 border-dashed transition-colors p-1.5 space-y-1.5',
                          isDraggingFiles
                            ? 'border-emerald-500 bg-emerald-500/10'
                            : 'border-transparent'
                        )}
                      >
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            onClick={() => cameraInputRef.current?.click()}
                            className="rounded-md border-2 border-dashed border-emerald-300 dark:border-emerald-800 hover:bg-emerald-500/10 transition-colors py-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground"
                          >
                            <Camera className="h-3.5 w-3.5" /> Câmara
                          </button>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="rounded-md border-2 border-dashed border-emerald-300 dark:border-emerald-800 hover:bg-emerald-500/10 transition-colors py-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground"
                          >
                            <Upload className="h-3.5 w-3.5" /> Ficheiros
                          </button>
                        </div>
                        <p className="text-center text-[10px] text-muted-foreground">
                          ou arrasta fotos/vídeos para aqui
                        </p>
                        {files.length > 0 && (
                          <div className="grid grid-cols-6 gap-1.5 mt-1.5">
                            {files.map((f) => (
                              <div
                                key={f.id}
                                className="relative rounded overflow-hidden border border-border aspect-square bg-muted"
                              >
                                {f.preview ? (
                                  <img
                                    src={f.preview}
                                    alt={f.file.name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="flex items-center justify-center w-full h-full">
                                    <Film className="h-4 w-4 text-muted-foreground" />
                                  </div>
                                )}
                                <button
                                  type="button"
                                  onClick={() => removeFile(f.id)}
                                  className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5 text-white"
                                >
                                  <X className="h-2.5 w-2.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-emerald-200/70 dark:border-emerald-800/50">
                      <AssinaturasHandoverSection
                        ref={assinaturasRef}
                        motoristaNome={contexto?.condutorNome ?? ''}
                        responsavelNome={responsavelNome}
                      />
                    </div>

                    <div className="pt-2 border-t border-emerald-200/70 dark:border-emerald-800/50 space-y-2">
                      <h4 className="text-xs font-semibold flex items-center gap-1.5 text-emerald-900 dark:text-emerald-300">
                        <FileText className="h-3.5 w-3.5" />
                        Folha de Danos (Recolha)
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        Ao fechar o contrato a folha é gerada, impressa e enviada por email ao
                        condutor automaticamente.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => gerarFolha('preview')}
                        disabled={gerandoFolha}
                        className="gap-2"
                      >
                        {gerandoFolha ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                        Pré-visualizar folha
                      </Button>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        </form>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t bg-muted/30 shrink-0">
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isPending}
            onClick={form.handleSubmit(onSubmit)}
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Fechar contrato
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
