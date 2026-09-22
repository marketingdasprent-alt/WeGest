import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRightLeft,
  Calendar,
  CalendarClock,
  Car,
  Euro,
  Eye,
  FileText,
  Loader2,
  MessageSquareText,
  XCircle,
} from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { precisaCombustivel, precisaEletrico } from '@/utils/combustivel';
import { validarDanos, type NovoDano } from '@/components/renting/danos/DanosEditor';
import { RegistoViaturaSection } from '@/components/entrega/RegistoViaturaSection';
import { useFecharContrato } from '@/hooks/useContratosRenting';
import { computeFechoRapidoDefaults } from './fecharContratoDefaults';
import { useEstacoes } from '@/hooks/useEstacoes';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrgId } from '@/contexts/TenantContext';
import { generateDocumentFromTemplate } from '@/utils/generateDocumentFromTemplate';
import { emailFolhaDanos } from '@/lib/emailFolhaDanos';
import { guardarFolhaDanos } from '@/lib/guardarFolhaDanos';
import {
  AssinaturasHandoverSection,
  type AssinaturasHandoverHandle,
} from '@/components/assinatura/AssinaturasHandoverSection';
import { toast } from 'sonner';

const schema = z.object({
  tipoEvento: z.enum(['recolhido', 'devolvido'], {
    required_error: 'Selecciona o que foi feito com a viatura.',
  }),
  estacaoId: z.string({ required_error: 'Selecciona a estação.' }).min(1, 'Selecciona a estação.'),
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

export interface AlteracaoMaterial {
  label: string;
  valorAntes: string;
  valorDepois: string;
}

interface FecharContratoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contratoId: string;
  contratoCodigo: number;
  motoristaId?: string | null;
  matricula?: string | null;
  viaturaId?: string | null;
  /** Estação "casa" da viatura — usada para pré-preencher a estação de recolha. */
  estacaoOrigemId?: string | null;
  /** true quando o contrato marcou que o motorista levou a DUA ORIGINAL da
   *  viatura — reforça a exigência de confirmar a devolução ao fechar e grava
   *  dua_devolvida_em no contrato. */
  duaOriginalComMotorista?: boolean;
  /** Presente quando este fecho faz parte de uma troca/upgrade/downgrade:
   *  mostra o resumo das alterações e, se alguma for de viatura, exige
   *  motivo. O contrato fecha-se sempre a sério primeiro (este dialog) —
   *  onFechado é quem cria a seguir a nova versão com os valores novos. */
  alteracoesTroca?: AlteracaoMaterial[];
  /** Chamado depois do fecho ter sucesso, com o motivo introduzido e a data
   *  do evento (ISO). Usado em modo troca para encadear a criação da nova
   *  versão do contrato — a data é a fronteira temporal entre os dois elos. */
  onFechado?: (motivo: string | undefined, dataEventoIso?: string) => void | Promise<void>;
}

export const FecharContratoDialog: React.FC<FecharContratoDialogProps> = ({
  open,
  onOpenChange,
  contratoId,
  contratoCodigo,
  motoristaId,
  matricula,
  viaturaId,
  estacaoOrigemId,
  duaOriginalComMotorista = false,
  alteracoesTroca,
  onFechado,
}) => {
  const emModoTroca = !!alteracoesTroca && alteracoesTroca.length > 0;
  const motivoObrigatorioTroca = emModoTroca && alteracoesTroca.some((a) => a.label === 'Viatura');
  const fecharMutation = useFecharContrato();
  const { data: estacoes = [] } = useEstacoes();
  const { user } = useAuth();
  const orgId = useOrgId();
  const responsavelNome =
    (user?.user_metadata?.nome as string | undefined) ?? user?.email ?? 'Responsável';

  const [duaDevolvido, setDuaDevolvido] = useState(false);

  // Só se pede a devolução da DUA a quem a levou.
  //
  // Antes bastava a viatura TER DUA digitalizado em viatura_documentos
  // (`viaturaTemDua`) para o fecho exigir a confirmação. Mas ter o documento
  // arquivado não quer dizer que o original foi para a mão do motorista — e
  // quase todas as viaturas têm o DUA digitalizado. Resultado: o fecho ficava
  // bloqueado à espera da devolução de um papel que ninguém levou, e a saída
  // era pôr o visto na mesma, o que torna o campo inútil como prova.
  //
  // `dua_original_com_motorista` é o campo que o contrato preenche quando o
  // original vai mesmo com ele. É esse, e só esse, que manda aqui.
  //
  // Numa RENOVAÇÃO (troca sem mudança de viatura) não se pergunta: o motorista
  // continua com o carro e com os documentos dele. Só quando a troca envolve
  // outra viatura é que há papel a voltar.
  const trocaDeViatura = motivoObrigatorioTroca;
  const renovacaoSemTrocarViatura = emModoTroca && !trocaDeViatura;
  const duaAplicavel = duaOriginalComMotorista && !renovacaoSemTrocarViatura;

  // Viaturas slot: o motorista é dono do "slot", não há recolha física pela
  // empresa nem estação/DUA a confirmar — o fecho pede só data e motivo
  // (opcional). Tipo/estação continuam a ser gravados (a mutation precisa
  // deles) com defaults silenciosos, só deixam de ser pedidos ao gestor.
  //
  // Traz também o `combustivel` da viatura: é ele que decide se se pede
  // depósito (oitavos), bateria (%) ou GPL. Antes pedia-se sempre o depósito,
  // mesmo a um eléctrico — o gestor tinha de escolher "1/2 depósito" para uma
  // viatura que não tem depósito nenhum.
  const { data: viaturaInfo } = useQuery({
    queryKey: ['viatura-fecho-info', viaturaId],
    enabled: open && !!viaturaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('viaturas')
        .select('is_slot, combustivel')
        .eq('id', viaturaId!)
        .maybeSingle();
      return {
        isSlot: !!data?.is_slot,
        combustivel: (data?.combustivel as string | null) ?? null,
      };
    },
  });
  const viaturaEhSlot = viaturaInfo?.isSlot ?? false;
  const tipoCombustivel = viaturaInfo?.combustivel ?? null;
  // Tipo desconhecido cai em combustão (precisaCombustivel devolve true) — é o
  // caso mais comum e mostrar campo nenhum era pior do que mostrar o errado.
  const mostraCombustivel = precisaCombustivel(tipoCombustivel);
  const mostraEletrico = precisaEletrico(tipoCombustivel);

  const form = useForm<FormInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      tipoEvento: undefined,
      estacaoId: undefined,
      dataEvento: '',
      motivo: '',
      valorDivida: '',
    },
  });

  // Registar a recolha (km/combustível/fotos) já no fecho — evita ter de ir
  // depois ao Calendário para o check-in. Estado próprio (fora do zod) pelo
  // mesmo padrão usado em RealizarEntregaPage/CheckOutPendentesDrawer.
  const [registarAgoraEscolhido, setRegistarAgora] = useState(true);
  // Numa TROCA a folha de danos de devolução não é opcional: é a única prova
  // do estado em que a viatura antiga voltou, e o contrato vai fechar já a
  // seguir — deixá-la para depois torna-a impossível de fazer (o trigger de
  // imutabilidade congela a versão substituída). Fora da troca, mantém-se a
  // escolha do gestor: fechar agora ou agendar a recolha para mais tarde.
  const registarAgora = emModoTroca ? true : registarAgoraEscolhido;
  const [km, setKm] = useState('');
  const [combustivel, setCombustivel] = useState('');
  // Só bateria. O GPL chegou a estar neste ecrã mas era um campo fantasma: o
  // gestor escolhia o nível e ele nunca ia no payload, porque
  // `contratos_renting` não tem coluna para GPL (só `combustivel_*` e
  // `eletricidade_*`). O calendário mostra-o porque grava noutra tabela
  // (`contratos.gpl_checkout/_checkin`). Para o voltar a mostrar aqui é preciso
  // primeiro criar a coluna e passá-la no payload da recolha.
  const [nivelEletrico, setNivelEletrico] = useState('');
  // Danos encontrados na recolha. Entidade própria (descrição, onde, quanto),
  // não uma legenda de foto — o valor é o que chega à conta do motorista.
  const [novosDanos, setNovosDanos] = useState<NovoDano[]>([]);
  const assinaturasRef = useRef<AssinaturasHandoverHandle>(null);
  const [gerandoFolha, setGerandoFolha] = useState(false);

  // Ao abrir o dialog, pré-preenche tipo/estação/data — o fecho rápido fica
  // pronto a submeter sem obrigar a passar por todos os campos manualmente.
  // Nenhum campo deixa de ser obrigatório, só deixam de vir vazios por omissão.
  useEffect(() => {
    if (!open) return;
    const defaults = computeFechoRapidoDefaults({
      motoristaId,
      estacaoOrigemViaturaId: estacaoOrigemId ?? null,
      estacoesDisponiveisIds: estacoes.map((e) => e.id),
      agoraIso: new Date().toISOString(),
    });
    // Viatura slot: sem campo visível para escolher a estação — usa a de
    // origem ou, na falta desta, a primeira disponível (só precisa de um id
    // válido para a mutation gravar estacao_recolha_id).
    const estacaoIdSlot = defaults.estacaoId ?? estacoes[0]?.id;
    form.reset({
      tipoEvento: defaults.tipoEvento,
      estacaoId: viaturaEhSlot ? estacaoIdSlot : defaults.estacaoId,
      dataEvento: defaults.dataEvento,
      motivo: '',
      valorDivida: '',
    });
    setRegistarAgora(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, motoristaId, estacaoOrigemId, estacoes, viaturaEhSlot]);

  // Contexto para a Folha de Danos (condutor, cliente, empresa emissora, km/
  // combustível de saída) — mesma query/chave usada em RealizarEntregaPage,
  // por isso partilha a cache quando é o mesmo contrato.
  const { data: contexto } = useQuery({
    queryKey: ['folha-danos-contexto', contratoId],
    enabled: open && !!contratoId,
    queryFn: async () => {
      const { data } = await supabase
        .from('contratos_renting')
        .select(
          'viatura_id, emissor_id, cliente_id, km_saida, combustivel_saida, cidade_assinatura'
        )
        .eq('id', contratoId)
        .maybeSingle();
      const empty = {
        viaturaId: null as string | null,
        empresaData: null as Record<string, string | null> | null,
        condutorNome: '',
        condutorEmail: '',
        clienteNome: '',
        kmSaida: null as number | null,
        combustivelSaida: null as string | null,
        // Cidade vigente do contrato — gravada por ContratoDocumentosDialog na
        // primeira vez que se gerou algo para ele. O fecho não tem picker
        // nenhum: usa o que já está, e fica vazia (como sempre foi) só quando
        // o contrato nunca gerou documento algum.
        cidadeAssinatura: null as string | null,
      };
      if (!data) return empty;

      let empresaData: Record<string, string | null> | null = null;
      if (data.emissor_id) {
        const { data: emp } = await supabase
          .from('clientes')
          .select(
            'nome, nome_comercial, nif, sede, representante, cargo_representante, licenca_tvde, licenca_validade, papel_timbrado, logo_url'
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
            papelTimbrado: emp.papel_timbrado ?? null,
            logoUrl: emp.logo_url ?? null,
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
        cidadeAssinatura: (data.cidade_assinatura as string | null) ?? null,
      };
    },
  });

  // Pré-preenche o KM de entrada com o KM de saída já registado no contrato —
  // evita pedir um valor que o sistema já tem; o utilizador só o edita se o
  // KM real for diferente. Só actua enquanto o campo ainda está vazio.
  useEffect(() => {
    if (!open || km.trim() !== '' || contexto?.kmSaida == null) return;
    setKm(String(contexto.kmSaida));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contexto?.kmSaida]);

  const resetRecolhaState = () => {
    setRegistarAgora(true);
    setKm('');
    setCombustivel('');
    setNivelEletrico('');
    setDuaDevolvido(false);
    novosDanos.forEach((d) => d.files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview)));
    setNovosDanos([]);
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
      // Na pré-visualização os danos ainda não estão gravados — as fotos deles
      // passam como data URLs para aparecerem na folha (mesmo padrão de
      // RealizarEntregaPage). Vinham do anexo geral de fotos, que deixou de
      // existir: agora a folha mostra as fotos dos próprios danos.
      const fotosDosDanos = novosDanos.flatMap((d) => d.files);
      const fotosMomento =
        modo === 'preview' && fotosDosDanos.length
          ? await Promise.all(
              fotosDosDanos.map(
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
          // Cidade vigente do contrato — sem picker aqui de propósito: quem
          // está a fechar um contrato já usado não devia ter de escolher outra
          // vez algo que já ficou definido. Fica vazia só se este contrato
          // nunca gerou nenhum documento (mesmo comportamento de sempre).
          cidade_assinatura: contexto?.cidadeAssinatura ?? '',
          clienteData: { nome: contexto?.clienteNome ?? '' },
          assinatura_motorista: sigs.motorista ?? '',
          assinatura_responsavel: sigs.responsavel ?? '',
          responsavel_nome: responsavelNome,
          // Recolhida (fomos buscá-la) e devolvida (o motorista trouxe-a) são
          // factos diferentes, e este documento é assinado: dizer 'Recolhido por'
          // a quem cumpriu e entregou a viatura descreve o oposto do que aconteceu.
          momento_responsavel:
            form.getValues('tipoEvento') === 'devolvido' ? 'Devolvido por' : 'Recolhido por',
          ...(contexto?.empresaData ? { empresaData: contexto.empresaData } : {}),
        },
        viaturaId: contexto?.viaturaId ?? viaturaId ?? undefined,
        contratoId,
        // Recolha e devolução são momentos distintos na folha, com cores
        // distintas: vermelho quando fomos buscar a viatura, azul quando o
        // motorista a trouxe. Estava fixo em RECOLHA para os dois casos.
        momentoFolha: form.getValues('tipoEvento') === 'devolvido' ? 'DEVOLUÇÃO' : 'RECOLHA',
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
          orgId,
          viaturaId: contexto?.viaturaId ?? viaturaId ?? undefined,
        });
        // Guarda a mesma cópia assinada nos anexos do contrato, para poder ser
        // descarregada de novo a partir do separador "Anexos".
        void guardarFolhaDanos({
          pdf,
          contratoId,
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

    // Retorno de viatura com DUA (recolhida ou devolvida): exige confirmar a
    // devolução do documento antes de fechar.
    const eventoDeRetornoSubmit =
      values.tipoEvento === 'recolhido' || values.tipoEvento === 'devolvido';
    if (!viaturaEhSlot && eventoDeRetornoSubmit && duaAplicavel && !duaDevolvido) {
      toast.error(
        duaOriginalComMotorista
          ? 'O motorista levou a DUA ORIGINAL. Confirma que foi devolvida antes de fechar.'
          : 'Esta viatura tem DUA. Confirma que o DUA foi devolvido antes de fechar.'
      );
      return;
    }

    // Troca de viatura precisa sempre de motivo explícito (avaria, pedido do
    // cliente, etc.) — mesma regra que existia no antigo dialog de nova versão.
    if (motivoObrigatorioTroca && !values.motivo?.trim()) {
      toast.error('Indica o motivo da troca de viatura antes de continuar.');
      return;
    }

    if (!viaturaEhSlot && registarAgora) {
      if (!km.trim() || Number.isNaN(Number(km))) {
        toast.error('Indica o KM actual para registar a recolha.');
        return;
      }
      // Cada tipo exige o SEU nível — pedir depósito a um eléctrico era o que
      // acontecia antes, e não havia forma de registar a carga da bateria.
      if (mostraCombustivel && !combustivel) {
        toast.error('Indica o nível de combustível para registar a recolha.');
        return;
      }
      if (mostraEletrico && !nivelEletrico) {
        toast.error('Indica a carga da bateria para registar a recolha.');
        return;
      }
      const erroDanos = validarDanos(novosDanos);
      if (erroDanos) {
        toast.error(erroDanos);
        return;
      }
      if (novosDanos.length > 0 && !viaturaId) {
        toast.error('Este contrato não tem viatura associada — não é possível registar danos.');
        return;
      }
    }

    // Recolhida = o motorista não entregou a viatura e fomos buscá-la; quase
    // sempre fica a dever. Avisa, não bloqueia: há recolhas sem nada a cobrar,
    // e prender o fecho por isso deixaria a viatura por registar.
    if (values.tipoEvento === 'recolhido' && !values.valorDivida && temMotorista) {
      toast.warning('Recolha sem valor em dívida — confirma que não há nada a cobrar.');
    }

    await fecharMutation.mutateAsync({
      contratoId,
      contratoCodigo,
      motoristaId,
      matricula,
      viaturaId,
      tipoEvento: values.tipoEvento,
      estacaoId: values.estacaoId,
      dataEvento: new Date(values.dataEvento).toISOString(),
      motivo: values.motivo,
      valorDivida: values.valorDivida,
      recolha:
        !viaturaEhSlot && registarAgora
          ? {
              km,
              combustivel,
              eletricidade: nivelEletrico || undefined,
              danos: novosDanos
                .filter((d) => d.descricao.trim())
                .map((d) => ({
                  descricao: d.descricao.trim(),
                  localizacao: d.localizacao.trim() || null,
                  // Vazio fica a null, não a 0: "ainda não avaliado" e "não
                  // custa nada" são coisas diferentes para quem cobra.
                  valor: d.valor.trim() ? Number(d.valor) : null,
                  files: d.files.map((f) => f.file),
                })),
            }
          : undefined,
      // Se o motorista tinha levado a DUA original e o gestor confirma a
      // devolução, regista dua_devolvida_em no contrato (fecha o ciclo do aviso).
      marcarDuaDevolvida: !viaturaEhSlot && duaOriginalComMotorista && duaDevolvido,
      // Slot não tem recolha física a capturar, mas o fecho é sempre
      // definitivo — toast "Contrato fechado", não "Recolha agendada".
      fecharAgora: viaturaEhSlot,
    });
    if (!viaturaEhSlot && registarAgora) {
      await gerarFolha('print');
    }
    form.reset();
    resetRecolhaState();
    onOpenChange(false);
    await onFechado?.(values.motivo, new Date(values.dataEvento).toISOString());
  };

  const isPending = fecharMutation.isPending || gerandoFolha;
  const temMotorista = !!motoristaId;
  const tipoEvento = form.watch('tipoEvento');
  // Qualquer fecho traz a viatura de volta à empresa (recolhida pela empresa ou
  // devolvida pelo motorista) — em ambos o DUA físico regressa e tem de ser
  // confirmado. Só exigimos quando a viatura tem DUA e já se escolheu o evento.
  const eventoDeRetorno = tipoEvento === 'recolhido' || tipoEvento === 'devolvido';
  const exigeDua = !viaturaEhSlot && eventoDeRetorno && duaAplicavel && !duaDevolvido;
  // Viatura slot: fecho é sempre imediato (só data + motivo) — nunca "agendar
  // recolha", que só faz sentido quando há mesmo uma recolha física a confirmar.
  const fechaImediatamente = viaturaEhSlot || registarAgora;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (isPending) return;
        if (!v) resetRecolhaState();
        onOpenChange(v);
      }}
    >
      {/* Ecrã inteiro: são duas colunas com danos, fotos e assinaturas — a
          largura fixa obrigava a fazer o trabalho dentro de uma coluna estreita
          com scroll interminável. */}
      <DialogContent className="max-w-none w-screen h-screen sm:w-[98vw] sm:h-[96vh] sm:max-w-[1800px] rounded-none sm:rounded-lg p-0 gap-0 flex flex-col overflow-hidden">
        {/* Header — muda consoante "Registar a recolha agora": só fecha o
            contrato de facto quando a recolha é confirmada já aqui; caso
            contrário isto agenda a recolha e o contrato mantém-se em curso
            (ver resolveFechoContratoToast em useContratosRenting). */}
        <div
          className={cn(
            'px-6 py-4 border-b bg-gradient-to-r shrink-0',
            fechaImediatamente
              ? 'from-destructive/10 via-destructive/5 to-transparent'
              : 'from-amber-500/10 via-amber-500/5 to-transparent'
          )}
        >
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'rounded-full p-2',
                fechaImediatamente ? 'bg-destructive/15' : 'bg-amber-500/15'
              )}
            >
              {fechaImediatamente ? (
                <XCircle className="h-5 w-5 text-destructive" />
              ) : (
                <CalendarClock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              )}
            </div>
            <div>
              {/* O cabeçalho e a frase de apoio já diziam exactamente o que este
                  diálogo faz; passam a Title/Description para o leitor de ecrã
                  os anunciar em vez de "diálogo" sem nome. Texto e classes
                  inalterados. */}
              <DialogTitle className="text-lg font-semibold leading-tight">
                {fechaImediatamente
                  ? `Fechar contrato #${contratoCodigo}`
                  : `Agendar recolha do contrato #${contratoCodigo}`}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                {viaturaEhSlot
                  ? 'Viatura slot — só é preciso confirmar a data (e, se quiseres, o motivo).'
                  : fechaImediatamente
                    ? 'A recolha fica registada agora — o contrato fecha ao confirmar.'
                    : 'O contrato mantém-se em curso até a recolha ser confirmada (agora ou via Calendário).'}
              </DialogDescription>
              {emModoTroca && (
                <p className="text-sm text-violet-700 dark:text-violet-400 mt-0.5">
                  Isto faz parte de uma troca — a seguir abre automaticamente o novo contrato com a
                  viatura nova.
                </p>
              )}
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
          <div
            className={cn('grid grid-cols-1 gap-4 items-start', !viaturaEhSlot && 'lg:grid-cols-2')}
          >
            {/* Coluna esquerda: o que aconteceu + valor em dívida */}
            <div className="space-y-4">
              {emModoTroca && (
                <section className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 space-y-2 dark:border-violet-900/50 dark:bg-violet-950/20">
                  <h3 className="text-sm font-semibold text-violet-900 dark:text-violet-300 flex items-center gap-2">
                    <ArrowRightLeft className="h-4 w-4" />
                    Alterações desta troca
                  </h3>
                  <ul className="space-y-1 rounded-md border bg-background/70 p-3">
                    {alteracoesTroca!.map((a, i) => (
                      <li key={i} className="text-sm flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{a.label}:</span>
                        <span className="text-muted-foreground line-through">{a.valorAntes}</span>
                        <span>→</span>
                        <span className="font-semibold">{a.valorDepois}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {/* ── Secção azul: o que aconteceu ── */}
              <section className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 space-y-4 dark:border-blue-900/50 dark:bg-blue-950/20">
                <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-300 flex items-center gap-2">
                  <Car className="h-4 w-4" />O que aconteceu com a viatura?
                </h3>

                {!viaturaEhSlot && (
                  <>
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

                    {eventoDeRetorno && duaAplicavel && (
                      <label className="flex items-start gap-3 rounded-md border border-amber-500/50 bg-amber-500/5 p-3 cursor-pointer">
                        <Checkbox
                          checked={duaDevolvido}
                          onCheckedChange={(c) => setDuaDevolvido(!!c)}
                          className="mt-0.5"
                        />
                        <span className="text-sm">
                          <span className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400">
                            <FileText className="h-4 w-4" />
                            {/* Declaração na 1ª pessoa — clique consciente, não só para desbloquear */}
                            {duaOriginalComMotorista
                              ? 'Confirmo que o motorista devolveu a DUA ORIGINAL da viatura'
                              : tipoEvento === 'recolhido'
                                ? 'Confirmo que recolhi o DUA físico com a viatura'
                                : 'Confirmo que recebi o DUA físico do motorista'}
                          </span>
                          <span className="text-muted-foreground">
                            {duaOriginalComMotorista
                              ? 'Este contrato marcou que o motorista levou a DUA original — obrigatório confirmar a devolução para fechar.'
                              : 'Esta viatura tem DUA associado — obrigatório para poder fechar o contrato.'}
                          </span>
                        </span>
                      </label>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="estacaoId">Estação *</Label>
                      <Select
                        value={form.watch('estacaoId')}
                        onValueChange={(v) => {
                          if (!v) return;
                          form.setValue('estacaoId', v, { shouldValidate: true });
                        }}
                      >
                        <SelectTrigger id="estacaoId" className="bg-background">
                          <SelectValue placeholder="Selecciona a estação" />
                        </SelectTrigger>
                        <SelectContent>
                          {estacoes.map((e) => (
                            <SelectItem key={e.id} value={e.id}>
                              {e.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {form.formState.errors.estacaoId && (
                        <p className="text-sm text-destructive">
                          {form.formState.errors.estacaoId.message}
                        </p>
                      )}
                    </div>
                  </>
                )}

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
                    Motivo{' '}
                    {motivoObrigatorioTroca ? (
                      <span className="text-destructive">*</span>
                    ) : (
                      '(opcional)'
                    )}
                  </Label>
                  <Textarea
                    id="motivo"
                    placeholder={
                      motivoObrigatorioTroca
                        ? 'Ex: avaria, pedido do cliente...'
                        : emModoTroca
                          ? alteracoesTroca!
                              .map((a) => `${a.label}: ${a.valorAntes} → ${a.valorDepois}`)
                              .join('; ')
                          : 'Ex: fim de contrato, rescisão por acordo, ...'
                    }
                    rows={3}
                    className="bg-background resize-none"
                    {...form.register('motivo')}
                  />
                  {motivoObrigatorioTroca && (
                    <p className="text-xs text-muted-foreground">
                      Obrigatório porque a viatura vai mudar — fica registado na nova versão do
                      contrato.
                    </p>
                  )}
                </div>
              </section>

              {/* ── Secção âmbar: valor em dívida ── */}
              {!viaturaEhSlot && (
                <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-3 dark:border-amber-900/50 dark:bg-amber-950/20">
                  <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-300 flex items-center gap-2">
                    <Euro className="h-4 w-4" />
                    Valor em Dívida
                  </h3>
                  <div className="space-y-1.5">
                    <Label htmlFor="valorDivida" className="text-xs">
                      {temMotorista
                        ? tipoEvento === 'recolhido'
                          ? 'A viatura foi recolhida — indica o valor em dívida.'
                          : 'Opcional — fica como débito pendente no financeiro do motorista.'
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
              )}
            </div>

            {/* Coluna direita: registar recolha agora (não aplicável a slot) */}
            {!viaturaEhSlot && (
              <div>
                {/* Painel esmeralda + campos: tudo vem do RegistoViaturaSection,
                    o MESMO componente que o /realizar e o calendário usam. O
                    invólucro (cor, cabeçalho, interruptor) vivia aqui, e era
                    por isso que os ecrãs pareciam diferentes mesmo já
                    partilhando os campos. */}
                <RegistoViaturaSection
                  titulo="Registar a recolha agora"
                  descricao={
                    emModoTroca
                      ? 'Obrigatório numa troca: é a folha de danos de devolução da viatura que sai. Depois de o contrato fechar já não é possível registá-la.'
                      : 'KM, combustível e danos — sem precisar de ir depois ao Calendário.'
                  }
                  activo={registarAgora}
                  onActivoChange={setRegistarAgora}
                  toggleBloqueado={emModoTroca}
                  viaturaId={viaturaId}
                  contratoId={contratoId}
                  tipoCombustivel={tipoCombustivel}
                  km={km}
                  onKmChange={setKm}
                  combustivel={combustivel}
                  onCombustivelChange={setCombustivel}
                  nivelEletrico={nivelEletrico}
                  onNivelEletricoChange={setNivelEletrico}
                  danos={novosDanos}
                  onDanosChange={setNovosDanos}
                />

                {registarAgora && (
                  <div className="mt-3 space-y-3">
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
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t bg-muted/30 shrink-0 flex-col sm:flex-row sm:items-center">
          {/* Dica visível quando o fecho está bloqueado pela confirmação do DUA —
              um botão desativado sem explicação parece "partido". */}
          {exigeDua && (
            <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 mr-auto">
              <FileText className="h-3.5 w-3.5 shrink-0" />
              Confirma primeiro que o DUA foi devolvido (acima) para poder fechar.
            </p>
          )}
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
            variant={fechaImediatamente ? 'destructive' : 'default'}
            disabled={isPending || exigeDua}
            title={exigeDua ? 'Confirma primeiro que o DUA foi devolvido' : undefined}
            onClick={form.handleSubmit(onSubmit)}
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            {fechaImediatamente ? 'Fechar contrato' : 'Agendar recolha'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
