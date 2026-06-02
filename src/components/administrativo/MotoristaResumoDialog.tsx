import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import {
  Printer,
  X,
  TrendingUp,
  TrendingDown,
  Calculator,
  Loader2,
  Send,
  Mail,
  MessageSquare,
  UserCheck,
  Settings,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { generateFinanceiroPDF } from '@/utils/generateFinanceiroPDF';
import { Separator } from '@/components/ui/separator';
import { useThemedLogo } from '@/hooks/useThemedLogo';

interface MotoristaResumoProps {
  driver_name: string;
  driver_uuid: string;
  motorista_id?: string;
  total_faturado: number;
  faturado_bolt: number;
  faturado_uber: number;
  total_viagens: number;
  viagens_bolt: number;
  viagens_uber: number;
  recibo_verde: boolean;
  liquido: number;
  combustivel: number;
  portagens: number;
  reparacoes: number;
  outros_custos: number;
  aluguer: number;
  identificador_bolt?: string;
  tem_recibo_importado?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  motorista: MotoristaResumoProps | null;
  dateRange: { from: Date; to: Date };
}

interface PrintSettings {
  mostrarMatricula: boolean;
  mostrarGestor: boolean;
  mostrarCartaoFrota: boolean;
  mostrarIBAN: boolean;
  mostrarReciboVerde: boolean;
  orientacao: 'portrait' | 'landscape';
}

const DEFAULT_SETTINGS: PrintSettings = {
  mostrarMatricula: true,
  mostrarGestor: false,
  mostrarCartaoFrota: true,
  mostrarIBAN: true,
  mostrarReciboVerde: true,
  orientacao: 'portrait',
};

const SETTINGS_KEY = 'resumo_print_settings';

function loadSettings(): PrintSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_SETTINGS;
}

function saveSettings(s: PrintSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export function MotoristaResumoDialog({ open, onOpenChange, motorista, dateRange }: Props) {
  const logoSrc = useThemedLogo();
  const [loading, setLoading] = useState(false);
  const [matricula, setMatricula] = useState<string | null>(null);
  const [cartaoFrota, setCartaoFrota] = useState<string | null>(null);
  const [gestor, setGestor] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [motoristaEmail, setMotoristaEmail] = useState<string | null>(null);
  const [motoristaTelefone, setMotoristaTelefone] = useState<string | null>(null);
  const [motoristaIban, setMotoristaIban] = useState<string | null>(null);
  const [extraCosts, setExtraCosts] = useState<{ caucao: number; seguros: number; outros: number }>(
    { caucao: 0, seguros: 0, outros: 0 }
  );
  const [outrasReceitas, setOutrasReceitas] = useState(0);
  const [settings, setSettings] = useState<PrintSettings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailCC, setEmailCC] = useState('');

  useEffect(() => {
    if (open && (motorista?.motorista_id || motorista?.driver_uuid)) {
      fetchDadosMotorista();
    }
  }, [open, motorista?.motorista_id, motorista?.driver_uuid]);

  const updateSetting = <K extends keyof PrintSettings>(key: K, value: PrintSettings[K]) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    saveSettings(next);
  };

  async function fetchDadosMotorista() {
    if (!motorista?.motorista_id && !motorista?.driver_uuid) return;

    setLoading(true);
    setMatricula(null);
    setCartaoFrota(null);
    setGestor(null);
    setMotoristaIban(null);
    setExtraCosts({ caucao: 0, seguros: 0, outros: 0 });

    try {
      let resolvedMotoristaId = motorista.motorista_id || null;

      if (!resolvedMotoristaId) {
        const query = supabase.from('motoristas_ativos').select('id');
        if (motorista.driver_uuid) {
          const { data } = await query.eq('uber_uuid', motorista.driver_uuid).maybeSingle();
          if (data) resolvedMotoristaId = data.id;
        }
        if (!resolvedMotoristaId && motorista.identificador_bolt) {
          const { data } = await query.eq('bolt_id', motorista.identificador_bolt).maybeSingle();
          if (data) resolvedMotoristaId = data.id;
        }
      }

      if (!resolvedMotoristaId && motorista.driver_uuid) {
        const { data: mapeamento } = await supabase
          .from('bolt_mapeamento_motoristas')
          .select('motorista_id')
          .eq('driver_uuid', motorista.driver_uuid)
          .maybeSingle();
        resolvedMotoristaId = mapeamento?.motorista_id || null;
      }

      if (!resolvedMotoristaId && motorista.driver_name) {
        const { data: matched } = await supabase
          .from('motoristas_ativos')
          .select('id')
          .ilike('nome', `%${motorista.driver_name}%`)
          .limit(1)
          .maybeSingle();
        resolvedMotoristaId = matched?.id || null;
      }

      if (resolvedMotoristaId) {
        const results = await Promise.all([
          supabase
            .from('motorista_viaturas')
            .select('viatura_id, viaturas(matricula, valor_aluguer)')
            .eq('motorista_id', resolvedMotoristaId)
            .lte('data_inicio', format(dateRange.to, 'yyyy-MM-dd'))
            .or(`data_fim.is.null,data_fim.gte.${format(dateRange.from, 'yyyy-MM-dd')}`)
            .order('data_inicio', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('motoristas_ativos')
            .select(
              'cartao_frota, cartao_bp, cartao_repsol, cartao_edp, email, telefone, iban, gestor_responsavel'
            )
            .eq('id', resolvedMotoristaId)
            .maybeSingle(),
          supabase
            .from('motorista_financeiro')
            .select('categoria, valor, tipo')
            .eq('motorista_id', resolvedMotoristaId)
            .gte('data_movimento', format(dateRange.from, 'yyyy-MM-dd'))
            .lte('data_movimento', format(dateRange.to, 'yyyy-MM-dd')),
        ]);

        const viaturaData = results[0].data;
        const motoristaData = results[1].data;
        const financeiroData = results[2].data;

        if (viaturaData?.viaturas) {
          const viatura = viaturaData.viaturas as any;
          setMatricula(viatura.matricula);
        }

        if (motoristaData) {
          const m = motoristaData as any;
          const cards = [m.cartao_bp, m.cartao_repsol, m.cartao_edp, m.cartao_frota]
            .filter((c: any) => !!c)
            .join(' / ');
          setCartaoFrota(cards || 'N/A');
          setMotoristaEmail(m.email);
          setMotoristaTelefone(m.telefone);
          setMotoristaIban(m.iban);
          setGestor(m.gestor_responsavel || null);
        }

        if (financeiroData) {
          let recExtras = 0;
          const totals = financeiroData.reduce(
            (acc, curr) => {
              if (curr.categoria === 'reparacao') return acc;
              if (curr.categoria === 'renda_viatura') return acc;
              const val = Number(curr.valor) || 0;
              if (curr.tipo === 'credito') {
                if (curr.categoria === 'caucao') return acc;
                recExtras += val;
                return acc;
              }
              if (curr.categoria === 'caucao') acc.caucao += val;
              else if (curr.categoria === 'seguros') acc.seguros += val;
              else acc.outros += val;
              return acc;
            },
            { caucao: 0, seguros: 0, outros: 0 }
          );
          setExtraCosts(totals);
          setOutrasReceitas(recExtras);
        }
      }
    } catch (error) {
      console.error('Erro ao buscar dados do motorista:', error);
    } finally {
      setLoading(false);
    }
  }

  if (!motorista) return null;

  const isImportado = motorista.tem_recibo_importado === true;

  const receitas = {
    bolt: motorista.faturado_bolt,
    uber: motorista.faturado_uber,
    outras_receitas: isImportado ? 0 : outrasReceitas || 0,
  };
  const totalReceitas = receitas.bolt + receitas.uber + receitas.outras_receitas;

  const despesas = isImportado
    ? {
        aluguer: motorista.aluguer || 0,
        combustivel: motorista.combustivel || 0,
        portagens: motorista.portagens || 0,
        outros_custos: motorista.outros_custos || 0,
        caucao: 0,
        seguros: 0,
        reparacoes: motorista.reparacoes || 0,
      }
    : {
        aluguer: motorista.aluguer || 0,
        combustivel: motorista.combustivel || 0,
        portagens: motorista.portagens || 0,
        outros_custos: extraCosts.outros,
        caucao: extraCosts.caucao,
        seguros: extraCosts.seguros,
        reparacoes: motorista.reparacoes || 0,
      };
  const totalDespesas = Object.values(despesas).reduce((a, b) => a + b, 0);
  const valoresSemanaAnterior = 0;
  const receitaAjustada = isImportado
    ? totalReceitas
    : motorista.recibo_verde
      ? totalReceitas
      : totalReceitas / 1.06;
  const totalAReceber = isImportado
    ? motorista.liquido
    : receitaAjustada - totalDespesas + valoresSemanaAnterior;
  const liquido = isImportado ? motorista.liquido : totalAReceber;

  const fmt = (value: number) =>
    new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(value);

  const handlePrint = () => {
    const fmtEur = (v: number) =>
      new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v);

    const periodoLabel = `${format(dateRange.from, 'dd/MM/yyyy', { locale: pt })} a ${format(dateRange.to, 'dd/MM/yyyy', { locale: pt })}`;
    const agora = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: pt });
    const orientation = settings.orientacao === 'landscape' ? 'landscape' : 'portrait';

    const infoRows = infoFields
      .map(
        (f) => `
      <div style="display:flex;flex-direction:column;gap:2px">
        <span style="font-size:10px;color:#6b7280">${f.label}</span>
        <span style="font-size:13px;font-weight:600;color:${(f as any).colored ? ((f as any).colored.includes('green') ? '#16a34a' : '#dc2626') : '#111827'}">${f.value ?? '—'}</span>
      </div>`
      )
      .join('');

    const despesasRows = [
      ['Aluguer', despesas.aluguer],
      ['Combustível', despesas.combustivel],
      ['Portagens', despesas.portagens],
      ['Outros Custos', despesas.outros_custos],
      ['Caução', despesas.caucao],
      ['Seguros', despesas.seguros],
      ['Reparações', despesas.reparacoes],
    ]
      .map(
        ([label, val]) =>
          `<div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0">
            <span>${label}</span><span style="color:#b91c1c">${fmtEur(Number(val))}</span>
          </div>`
      )
      .join('');

    const ajusteRow =
      !motorista.recibo_verde && !isImportado
        ? `<div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0">
            <span>Ajuste (÷ 1.06)</span><span style="color:#ea580c">-${fmtEur(totalAReceber - liquido)}</span>
          </div>`
        : '';

    const liquidoColor = liquido >= 0 ? '#2563eb' : '#f97316';

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>Resumo Financeiro — ${motorista.driver_name}</title>
      <style>
        *{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}
        body{font-family:'Segoe UI',Arial,sans-serif;color:#111827;background:#fff;padding:24px 32px}
        @page{size:${orientation};margin:12mm}
      </style>
    </head>
    <body onload="window.print()">

      <!-- Cabeçalho -->
      <div style="text-align:center;border-bottom:1px solid #e5e7eb;padding-bottom:16px;margin-bottom:16px">
        <img src="${logoSrc}" alt="WeGest" style="height:56px;margin-bottom:8px"/>
        <h1 style="font-size:16px;font-weight:700;letter-spacing:.05em">RESUMO FINANCEIRO DO MOTORISTA</h1>
      </div>

      <!-- Cards de totais -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px">
        <div style="background:#22c55e;border-radius:10px;padding:14px;text-align:center;color:#fff">
          <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;opacity:.85;margin-bottom:4px">Total Receitas</div>
          <div style="font-size:20px;font-weight:700">${fmtEur(totalReceitas)}</div>
        </div>
        <div style="background:#ef4444;border-radius:10px;padding:14px;text-align:center;color:#fff">
          <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;opacity:.85;margin-bottom:4px">Total Despesas</div>
          <div style="font-size:20px;font-weight:700">${fmtEur(totalDespesas)}</div>
        </div>
        <div style="background:${liquidoColor};border-radius:10px;padding:14px;text-align:center;color:#fff">
          <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;opacity:.85;margin-bottom:4px">Líquido a Receber</div>
          <div style="font-size:20px;font-weight:700">${fmtEur(liquido)}</div>
        </div>
      </div>

      <!-- Info motorista -->
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;margin-bottom:16px;display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
        ${infoRows}
      </div>

      <!-- Receitas e Despesas -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
        <!-- Receitas -->
        <div style="border:1px solid #bbf7d0;border-radius:8px;overflow:hidden">
          <div style="background:#22c55e;padding:8px 14px">
            <span style="color:#fff;font-weight:700;font-size:13px">↗ RECEITAS</span>
          </div>
          <div style="background:#f0fdf4;padding:12px 14px">
            <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Bolt</span><span style="color:#15803d">${fmtEur(receitas.bolt)}</span></div>
            <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Uber</span><span style="color:#15803d">${fmtEur(receitas.uber)}</span></div>
            <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Outras Receitas</span><span style="color:#15803d">${fmtEur(receitas.outras_receitas)}</span></div>
            <div style="border-top:1px solid #86efac;margin:6px 0"></div>
            <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;padding:3px 0"><span>TOTAL RECEITAS</span><span style="color:#15803d">${fmtEur(totalReceitas)}</span></div>
          </div>
        </div>
        <!-- Despesas -->
        <div style="border:1px solid #fecaca;border-radius:8px;overflow:hidden">
          <div style="background:#ef4444;padding:8px 14px">
            <span style="color:#fff;font-weight:700;font-size:13px">↘ DESPESAS</span>
          </div>
          <div style="background:#fff1f2;padding:12px 14px">
            ${despesasRows}
            <div style="border-top:1px solid #fca5a5;margin:6px 0"></div>
            <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;padding:3px 0"><span>TOTAL DESPESAS</span><span style="color:#b91c1c">${fmtEur(totalDespesas)}</span></div>
          </div>
        </div>
      </div>

      <!-- Resumo Final -->
      <div style="border:1px solid #bfdbfe;border-radius:8px;overflow:hidden">
        <div style="background:#2563eb;padding:8px 14px">
          <span style="color:#fff;font-weight:700;font-size:13px">⊟ RESUMO FINAL</span>
        </div>
        <div style="background:#eff6ff;padding:12px 14px">
          <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Valores a Transportar (Semana Anterior)</span><span style="color:#1d4ed8">${fmtEur(valoresSemanaAnterior)}</span></div>
          <div style="border-top:1px solid #93c5fd;margin:6px 0"></div>
          <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Total a Receber</span><span style="color:${totalAReceber >= 0 ? '#15803d' : '#dc2626'}">${fmtEur(totalAReceber)}</span></div>
          ${ajusteRow}
          <div style="background:#2563eb;margin:-12px -14px;margin-top:10px;padding:12px 14px;display:flex;justify-content:space-between">
            <span style="color:#fff;font-weight:700;font-size:14px">VALOR LÍQUIDO A RECEBER</span>
            <span style="color:#fff;font-weight:700;font-size:18px">${fmtEur(liquido)}</span>
          </div>
        </div>
      </div>

      <!-- Rodapé -->
      <div style="margin-top:16px;padding-top:10px;border-top:1px solid #e5e7eb;text-align:center;font-size:10px;color:#9ca3af">
        <div>Documento gerado em ${agora}</div>
        <div>WeGest, Lda. • NIF: 515127850</div>
      </div>

    </body></html>`;

    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
  };

  const handleOpenEmail = () => {
    setEmailTo(motoristaEmail || '');
    setEmailCC('');
    setShowEmailDialog(true);
  };

  const handleSendEmail = () => {
    const subject = `Resumo Financeiro - ${motorista.driver_name} - ${format(dateRange.from, 'dd/MM/yyyy')}`;
    const body =
      `Olá ${motorista.driver_name},\n\nSegue o resumo financeiro do período ${format(dateRange.from, 'dd/MM/yyyy')} a ${format(dateRange.to, 'dd/MM/yyyy')}:\n\n` +
      `Receitas: ${fmt(totalReceitas)}\nDespesas: ${fmt(totalDespesas)}\nLíquido a Receber: ${fmt(liquido)}\n\nCumprimentos,\nEquipa WeGest`;
    const cc = emailCC.trim() ? `&cc=${encodeURIComponent(emailCC.trim())}` : '';
    window.open(
      `mailto:${encodeURIComponent(emailTo)}?subject=${encodeURIComponent(subject)}${cc}&body=${encodeURIComponent(body)}`
    );
    setShowEmailDialog(false);
  };

  const handleSendWhatsApp = () => {
    const message =
      `*RESUMO FINANCEIRO - WeGest*\n\nOlá *${motorista.driver_name}*,\n` +
      `Período: ${format(dateRange.from, 'dd/MM/yyyy')} a ${format(dateRange.to, 'dd/MM/yyyy')}\n\n` +
      `💰 *Receitas:* ${fmt(totalReceitas)}\n💸 *Despesas:* ${fmt(totalDespesas)}\n🏁 *Líquido Final:* ${fmt(liquido)}\n\nSe tiver alguma dúvida, por favor contacte-nos.`;
    const phone = motoristaTelefone?.replace(/\s/g, '') || '';
    window.open(
      `https://wa.me/${phone.startsWith('+') ? phone : '+351' + phone}?text=${encodeURIComponent(message)}`,
      '_blank'
    );
  };

  const handleSendAccount = async () => {
    if (!motorista.motorista_id) {
      toast.error('ID do motorista não disponível para envio à conta.');
      return;
    }
    try {
      setIsSending(true);
      const pdf = await generateFinanceiroPDF({
        driver_name: motorista.driver_name,
        matricula,
        cartaoFrota,
        dateRange,
        recibo_verde: motorista.recibo_verde,
        receitas: {
          bolt: receitas.bolt,
          uber: receitas.uber,
          outras_receitas: receitas.outras_receitas,
          total: totalReceitas,
        },
        despesas: {
          aluguer: despesas.aluguer,
          combustivel: despesas.combustivel,
          portagens: despesas.portagens,
          reparacoes: despesas.reparacoes,
          outros: despesas.outros_custos + despesas.caucao + despesas.seguros,
          total: totalDespesas,
        },
        resumo: {
          totalAReceber,
          ajuste: motorista.recibo_verde ? undefined : totalAReceber - liquido,
          liquido,
        },
        logoSrc,
      });

      const fileName = `resumo_${motorista.motorista_id}_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`;
      const pdfBlob = pdf.output('blob');
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('motorista-recibos')
        .upload(`${motorista.motorista_id}/${fileName}`, pdfBlob);
      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase.from('motorista_recibos').upsert(
        {
          motorista_id: motorista.motorista_id,
          descricao: `Resumo Financeiro ${format(dateRange.from, 'dd/MM')} - ${format(dateRange.to, 'dd/MM')}`,
          periodo_referencia: format(dateRange.from, 'MMMM yyyy', { locale: pt }),
          semana_referencia_inicio: format(dateRange.from, 'yyyy-MM-dd'),
          valor_total: liquido,
          ficheiro_url: uploadData.path,
          nome_ficheiro: fileName,
          status: 'validado',
          data_validacao: new Date().toISOString(),
          tipo: 'relatorio',
        },
        { onConflict: 'motorista_id,semana_referencia_inicio' }
      );
      if (dbError) throw dbError;
      toast.success('Resumo enviado para a conta do motorista com sucesso!');
    } catch (error: any) {
      toast.error('Erro ao enviar resumo: ' + (error.message || String(error)));
    } finally {
      setIsSending(false);
    }
  };

  const infoFields = [
    { key: 'nome', label: 'Nome', value: motorista.driver_name, always: true },
    {
      key: 'matricula',
      label: 'Matrícula',
      value: loading ? null : matricula || 'N/A',
      show: settings.mostrarMatricula,
    },
    {
      key: 'gestor',
      label: 'Gestor Responsável',
      value: loading ? null : gestor || 'N/A',
      show: settings.mostrarGestor,
    },
    {
      key: 'cartaoFrota',
      label: 'Cartão Frota',
      value: loading ? null : cartaoFrota || 'N/A',
      show: settings.mostrarCartaoFrota,
    },
    {
      key: 'periodo',
      label: 'Período',
      value: `${format(dateRange.from, 'dd/MM/yyyy', { locale: pt })} a ${format(dateRange.to, 'dd/MM/yyyy', { locale: pt })}`,
      always: true,
    },
    {
      key: 'iban',
      label: 'IBAN',
      value: loading ? null : motoristaIban || 'N/A',
      show: settings.mostrarIBAN,
    },
    {
      key: 'reciboVerde',
      label: 'Recibo Verde',
      value: motorista.recibo_verde ? 'Sim' : 'Não',
      colored: motorista.recibo_verde ? 'text-green-600' : 'text-red-600',
      show: settings.mostrarReciboVerde,
    },
  ].filter((f) => f.always || f.show);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        {/* Inject landscape CSS when needed */}

        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto print:max-w-none print:max-h-none print:overflow-visible">
          <DialogHeader className="print:hidden">
            <DialogTitle>Resumo Financeiro</DialogTitle>
          </DialogHeader>

          {/* Painel de configuração (oculto na impressão) */}
          <div className="print:hidden">
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-muted-foreground"
              onClick={() => setShowSettings((v) => !v)}
            >
              <Settings className="h-4 w-4" />
              Configurar folha de impressão
            </Button>

            {showSettings && (
              <div className="mt-3 p-4 border rounded-lg bg-muted/30 space-y-4">
                <p className="text-sm font-medium text-muted-foreground mb-2">
                  Campos a mostrar na impressão
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { key: 'mostrarMatricula', label: 'Matrícula' },
                    { key: 'mostrarGestor', label: 'Gestor Responsável' },
                    { key: 'mostrarCartaoFrota', label: 'Cartão Frota' },
                    { key: 'mostrarIBAN', label: 'IBAN' },
                    { key: 'mostrarReciboVerde', label: 'Recibo Verde' },
                  ].map(({ key, label }) => (
                    <div key={key} className="flex items-center gap-2">
                      <Switch
                        id={key}
                        checked={settings[key as keyof PrintSettings] as boolean}
                        onCheckedChange={(v) => updateSetting(key as keyof PrintSettings, v as any)}
                      />
                      <Label htmlFor={key} className="text-sm cursor-pointer">
                        {label}
                      </Label>
                    </div>
                  ))}
                </div>
                <Separator />
                <div className="flex items-center gap-4">
                  <p className="text-sm font-medium text-muted-foreground">Orientação</p>
                  <div className="flex gap-2">
                    {(['portrait', 'landscape'] as const).map((o) => (
                      <Button
                        key={o}
                        size="sm"
                        variant={settings.orientacao === o ? 'default' : 'outline'}
                        onClick={() => updateSetting('orientacao', o)}
                      >
                        {o === 'portrait' ? 'Vertical' : 'Horizontal'}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Conteúdo do Relatório */}
          <div
            className="space-y-4 print:space-y-3 print-content"
            id="relatorio-motorista"
            style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' } as any}
          >
            {/* Cabeçalho */}
            <div className="text-center border-b pb-4 print:pb-2">
              <img src={logoSrc} alt="Logo" className="h-24 mx-auto mb-3 print:h-16 print:mb-2" />
              <h1 className="text-2xl print:text-base font-bold">RESUMO FINANCEIRO DO MOTORISTA</h1>
            </div>

            {/* Cards de resumo coloridos */}
            <div className="grid grid-cols-3 gap-3 print:gap-2">
              <div
                className="rounded-xl p-4 print:p-3 print:rounded-lg text-center"
                style={{ backgroundColor: '#22c55e', color: '#fff' }}
              >
                <p
                  className="text-xs font-medium uppercase tracking-wide print:text-[10px]"
                  style={{ opacity: 0.85 }}
                >
                  Total Receitas
                </p>
                <p className="text-2xl print:text-lg font-bold mt-1">{fmt(totalReceitas)}</p>
              </div>
              <div
                className="rounded-xl p-4 print:p-3 print:rounded-lg text-center"
                style={{ backgroundColor: '#ef4444', color: '#fff' }}
              >
                <p
                  className="text-xs font-medium uppercase tracking-wide print:text-[10px]"
                  style={{ opacity: 0.85 }}
                >
                  Total Despesas
                </p>
                <p className="text-2xl print:text-lg font-bold mt-1">{fmt(totalDespesas)}</p>
              </div>
              <div
                className="rounded-xl p-4 print:p-3 print:rounded-lg text-center"
                style={{ backgroundColor: liquido >= 0 ? '#2563eb' : '#f97316', color: '#fff' }}
              >
                <p
                  className="text-xs font-medium uppercase tracking-wide print:text-[10px]"
                  style={{ opacity: 0.85 }}
                >
                  Líquido a Receber
                </p>
                <p className="text-2xl print:text-lg font-bold mt-1">{fmt(liquido)}</p>
              </div>
            </div>

            {/* Informações do Motorista */}
            <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 print:p-3 print:bg-slate-50 border">
              <div
                className={`grid gap-3 print:gap-2 ${infoFields.length <= 4 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}
              >
                {infoFields.map((f) => (
                  <div key={f.key}>
                    <span className="text-xs text-muted-foreground print:text-[10px]">
                      {f.label}
                    </span>
                    {f.value === null ? (
                      <Loader2 className="h-4 w-4 animate-spin mt-1" />
                    ) : (
                      <p
                        className={`font-semibold print:text-xs ${(f as any).colored || 'text-foreground'}`}
                      >
                        {f.value}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Receitas e Despesas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:gap-3 print:grid-cols-2">
              {/* Receitas */}
              <div className="rounded-lg overflow-hidden border border-green-200 print:border-green-300">
                <div
                  className="px-4 py-2 print:px-3 print:py-1.5"
                  style={{ backgroundColor: '#22c55e' }}
                >
                  <h2
                    className="font-semibold flex items-center gap-2 text-sm print:text-xs"
                    style={{ color: '#fff' }}
                  >
                    <TrendingUp className="h-4 w-4" />
                    RECEITAS
                  </h2>
                </div>
                <div className="p-4 print:p-3 space-y-2 print:space-y-1 bg-green-50 print:bg-green-50">
                  <Row label="Bolt" value={fmt(receitas.bolt)} colored="text-green-700" />
                  <Row label="Uber" value={fmt(receitas.uber)} colored="text-green-700" />
                  <Row
                    label="Outras Receitas"
                    value={fmt(receitas.outras_receitas)}
                    colored="text-green-700"
                  />
                  <Separator className="bg-green-200" />
                  <Row
                    label="TOTAL RECEITAS"
                    value={fmt(totalReceitas)}
                    bold
                    colored="text-green-700"
                  />
                </div>
              </div>

              {/* Despesas */}
              <div className="rounded-lg overflow-hidden border border-red-200 print:border-red-300">
                <div
                  className="px-4 py-2 print:px-3 print:py-1.5"
                  style={{ backgroundColor: '#ef4444' }}
                >
                  <h2
                    className="font-semibold flex items-center gap-2 text-sm print:text-xs"
                    style={{ color: '#fff' }}
                  >
                    <TrendingDown className="h-4 w-4" />
                    DESPESAS
                  </h2>
                </div>
                <div className="p-4 print:p-3 space-y-2 print:space-y-1 bg-red-50 print:bg-red-50">
                  <Row label="Aluguer" value={fmt(despesas.aluguer)} colored="text-red-700" />
                  <Row
                    label="Combustível"
                    value={fmt(despesas.combustivel)}
                    colored="text-red-700"
                  />
                  <Row label="Portagens" value={fmt(despesas.portagens)} colored="text-red-700" />
                  <Row
                    label="Outros Custos"
                    value={fmt(despesas.outros_custos)}
                    colored="text-red-700"
                  />
                  <Row label="Caução" value={fmt(despesas.caucao)} colored="text-red-700" />
                  <Row label="Seguros" value={fmt(despesas.seguros)} colored="text-red-700" />
                  <Row label="Reparações" value={fmt(despesas.reparacoes)} colored="text-red-700" />
                  <Separator className="bg-red-200" />
                  <Row
                    label="TOTAL DESPESAS"
                    value={fmt(totalDespesas)}
                    bold
                    colored="text-red-700"
                  />
                </div>
              </div>
            </div>

            {/* Resumo Final */}
            <div className="rounded-lg overflow-hidden border border-blue-200 print:border-blue-300">
              <div
                className="px-4 py-2 print:px-3 print:py-1.5"
                style={{ backgroundColor: '#2563eb' }}
              >
                <h2
                  className="font-semibold flex items-center gap-2 text-sm print:text-xs"
                  style={{ color: '#fff' }}
                >
                  <Calculator className="h-4 w-4" />
                  RESUMO FINAL
                </h2>
              </div>
              <div className="p-4 print:p-3 space-y-2 print:space-y-1 bg-blue-50 print:bg-blue-50">
                <Row
                  label="Valores a Transportar (Semana Anterior)"
                  value={fmt(valoresSemanaAnterior)}
                  colored="text-blue-700"
                />
                <Separator className="bg-blue-200" />
                <Row
                  label="Total a Receber"
                  value={fmt(totalAReceber)}
                  colored={totalAReceber >= 0 ? 'text-green-700' : 'text-red-700'}
                />
                {!motorista.recibo_verde && !isImportado && (
                  <Row
                    label="Ajuste (÷ 1.06)"
                    value={`-${fmt(totalAReceber - liquido)}`}
                    colored="text-orange-600"
                  />
                )}
                <Separator className="my-2 print:my-1 bg-blue-200" />
                <div
                  className="flex justify-between items-center -mx-4 px-4 py-3 print:py-2 print:-mx-3 print:px-3"
                  style={{ backgroundColor: '#2563eb' }}
                >
                  <span className="font-bold text-sm print:text-xs" style={{ color: '#fff' }}>
                    VALOR LÍQUIDO A RECEBER
                  </span>
                  <span className="font-bold text-xl print:text-base" style={{ color: '#fff' }}>
                    {fmt(liquido)}
                  </span>
                </div>
              </div>
            </div>

            {/* Rodapé impressão */}
            <div className="hidden print:block text-center text-[10px] text-gray-500 pt-2 border-t mt-2">
              <p>
                Documento gerado em {format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: pt })}
              </p>
              <p className="mt-0.5">WeGest, Lda. • NIF: 515127850</p>
            </div>
          </div>

          {/* Botões de Ação */}
          <div className="flex justify-end gap-3 pt-4 border-t print:hidden">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4 mr-2" />
              Fechar
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={isSending}>
                  {isSending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Enviar
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleSendWhatsApp}>
                  <MessageSquare className="h-4 w-4 mr-2 text-green-500" />
                  WhatsApp
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleOpenEmail}>
                  <Mail className="h-4 w-4 mr-2 text-blue-500" />
                  Email
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSendAccount}>
                  <UserCheck className="h-4 w-4 mr-2 text-primary" />
                  Enviar à Conta
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" />
              Imprimir
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-blue-500" />
              Enviar Resumo por Email
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="email-to">Para</Label>
              <Input
                id="email-to"
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="email@motorista.pt"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email-cc">
                CC <span className="text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <Input
                id="email-cc"
                type="email"
                value={emailCC}
                onChange={(e) => setEmailCC(e.target.value)}
                placeholder="gestor@empresa.pt"
              />
            </div>
            <div className="bg-muted/40 rounded-lg p-3 text-sm text-muted-foreground space-y-1">
              <p>
                <strong>Assunto:</strong> Resumo Financeiro - {motorista.driver_name}
              </p>
              <p>
                <strong>Período:</strong> {format(dateRange.from, 'dd/MM/yyyy', { locale: pt })} a{' '}
                {format(dateRange.to, 'dd/MM/yyyy', { locale: pt })}
              </p>
              <p>
                <strong>Líquido:</strong> {fmt(liquido)}
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowEmailDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSendEmail} disabled={!emailTo.trim()}>
                <Mail className="h-4 w-4 mr-2" />
                Abrir no email
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Row({
  label,
  value,
  bold,
  colored,
}: {
  label: string;
  value: string;
  bold?: boolean;
  colored?: string;
}) {
  return (
    <div className={`flex justify-between items-center print:text-xs ${bold ? 'font-bold' : ''}`}>
      <span>{label}</span>
      <span className={colored}>{value}</span>
    </div>
  );
}
