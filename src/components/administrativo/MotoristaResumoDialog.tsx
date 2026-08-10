import { useState } from 'react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { generateFinanceiroPDF } from '@/utils/generateFinanceiroPDF';
import { useThemedLogo } from '@/hooks/useThemedLogo';
import { PrintSettingsPanel } from './motorista-resumo/sections/PrintSettingsPanel';
import { ResumoReportContent } from './motorista-resumo/sections/ResumoReportContent';
import { ResumoActionBar } from './motorista-resumo/sections/ResumoActionBar';
import { EmailResumoDialog } from './motorista-resumo/sections/EmailResumoDialog';
import { useMotoristaResumoData } from './motorista-resumo/useMotoristaResumoData';
import { deriveResumoFinanceiro } from './motorista-resumo/resumoFinanceiro';
import { generateResumoPrintHTML } from './motorista-resumo/generateResumoPrintHTML';
import { usePermissions } from '@/hooks/usePermissions';
import { useOrgId } from '@/contexts/TenantContext';

// Linha Gorjeta: dados sensíveis (rendimento pessoal do motorista) — só
// visível para admins da org dona dos dados, nunca para motoristas.
const DECADA_OUSADA_ORG_ID = '11111111-1111-1111-1111-111111111111';

/* ───────── Exported types ───────── */

export interface SlotPeriodo {
  matricula: string;
  dias: number;
  taxaDiaria: number;
  custo: number;
  dataInicioStr: string;
  dataFimStr: string;
}

export interface MotoristaResumoProps {
  driver_name: string;
  driver_uuid: string;
  motorista_id?: string;
  total_faturado: number;
  faturado_bolt: number;
  faturado_uber: number;
  gorjeta_bolt?: number;
  gorjeta_uber?: number;
  total_viagens: number;
  viagens_bolt: number;
  viagens_uber: number;
  recibo_verde: boolean;
  liquido: number;
  gorjeta?: number;
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
  } catch {
    // Se localStorage falhar ou JSON for inválido, usamos o default.
  }
  return DEFAULT_SETTINGS;
}

function saveSettings(s: PrintSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export function MotoristaResumoDialog({ open, onOpenChange, motorista, dateRange }: Props) {
  const logoSrc = useThemedLogo();
  const { isAdmin } = usePermissions();
  const orgId = useOrgId();
  const showGorjeta = isAdmin && orgId === DECADA_OUSADA_ORG_ID;
  const {
    loading,
    matricula,
    cartaoFrota,
    gestor,
    motoristaEmail,
    motoristaTelefone,
    motoristaIban,
    extraCosts,
    outrasReceitas,
    slotPeriodos,
    aluguerSemTarifa,
    valoresSemanaAnterior,
  } = useMotoristaResumoData(open, motorista, dateRange);
  const [isSending, setIsSending] = useState(false);
  const [settings, setSettings] = useState<PrintSettings>(loadSettings);
  const [showEmailDialog, setShowEmailDialog] = useState(false);

  const updateSetting = <K extends keyof PrintSettings>(key: K, value: PrintSettings[K]) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    saveSettings(next);
  };

  if (!motorista) return null;

  /* ───────── computed values ───────── */
  const isImportado = motorista.tem_recibo_importado === true;
  const gorjetaBolt = isImportado ? 0 : motorista.gorjeta_bolt || 0;
  const gorjetaUber = isImportado ? 0 : motorista.gorjeta_uber || 0;
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
  const totalSlot = slotPeriodos.reduce((s, p) => s + p.custo, 0);
  const totalDespesas = Object.values(despesas).reduce((a, b) => a + b, 0);
  // Só avisar quando o valor mostrado é mesmo 0 — se houver renda manual
  // (renda_viatura) o aluguer já vem preenchido e não há falha a assinalar.
  const mostrarAvisoAluguer = !isImportado && aluguerSemTarifa && despesas.aluguer === 0;

  // Cálculo puro (testado em resumoFinanceiro.test.ts). A gorjeta entra uma
  // única vez, na receita ajustada — não voltar a somar no total a receber.
  const { receitasExibidas, receitaAjustada, totalAReceber, liquido, gorjeta } =
    deriveResumoFinanceiro({
      isImportado,
      reciboVerde: motorista.recibo_verde,
      receitas,
      gorjetaBolt,
      gorjetaUber,
      totalDespesas,
      valoresSemanaAnterior,
      liquidoImportado: motorista.liquido,
    });

  const fmt = (value: number) =>
    new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(value);

  /* ───────── infoFields ───────── */
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
  ].filter((f) => (f as any).always || (f as any).show);

  /* ───────── handlers ───────── */
  const handlePrint = () => {
    const html = generateResumoPrintHTML({
      driverName: motorista.driver_name,
      dateRange,
      settings,
      logoSrc,
      infoFields,
      isImportado,
      receitas: receitasExibidas,
      totalReceitas,
      receitaAjustada,
      despesas,
      totalDespesas,
      aluguerSemTarifa: mostrarAvisoAluguer,
      slotPeriodos,
      totalSlot,
      valoresSemanaAnterior,
      totalAReceber,
      liquido,
    });

    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
  };

  const handleSendWhatsApp = () => {
    const slotDetalhe =
      slotPeriodos.length > 0
        ? '\n\n🚗 *Aluguer Slot:*\n' +
          slotPeriodos
            .map(
              (p) =>
                `  ${p.matricula} (${p.dataInicioStr}–${p.dataFimStr}): ${p.dias}d × ${fmt(p.taxaDiaria)}/d = ${fmt(p.custo)}`
            )
            .join('\n') +
          (slotPeriodos.length > 1 ? `\n  Total Slot: ${fmt(totalSlot)}` : '')
        : '';
    const message =
      `*RESUMO FINANCEIRO - WeGest*\n\nOlá *${motorista.driver_name}*,\n` +
      `Período: ${format(dateRange.from, 'dd/MM/yyyy')} a ${format(dateRange.to, 'dd/MM/yyyy')}\n\n` +
      `💰 *Receitas:* ${fmt(isImportado ? totalReceitas : receitaAjustada)}\n💸 *Despesas:* ${fmt(totalDespesas)}${slotDetalhe}\n🏁 *Líquido Final:* ${fmt(liquido)}\n\nSe tiver alguma dúvida, por favor contacte-nos.`;
    const phone = motoristaTelefone?.replace(/\s/g, '') || '';
    window.open(
      `https://wa.me/${phone.startsWith('+') ? phone : '+351' + phone}?text=${encodeURIComponent(message)}`,
      '_blank'
    );
  };

  const handleOpenEmail = () => {
    setShowEmailDialog(true);
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
          bolt: receitasExibidas.bolt,
          uber: receitasExibidas.uber,
          outras_receitas: receitasExibidas.outras_receitas,
          total: isImportado ? totalReceitas : receitaAjustada,
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

  /* ───────── render ───────── */
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto print:max-w-none print:max-h-none print:overflow-visible">
          <DialogHeader className="print:hidden">
            <DialogTitle>Resumo Financeiro</DialogTitle>
          </DialogHeader>

          <PrintSettingsPanel settings={settings} updateSetting={updateSetting} />

          <ResumoReportContent
            logoSrc={logoSrc}
            infoFields={infoFields}
            loading={loading}
            fmt={fmt}
            isImportado={isImportado}
            receitas={receitasExibidas}
            totalReceitas={totalReceitas}
            receitaAjustada={receitaAjustada}
            despesas={despesas}
            totalDespesas={totalDespesas}
            aluguerSemTarifa={mostrarAvisoAluguer}
            slotPeriodos={slotPeriodos}
            totalSlot={totalSlot}
            valoresSemanaAnterior={valoresSemanaAnterior}
            totalAReceber={totalAReceber}
            liquido={liquido}
            motoristaId={motorista.motorista_id}
            gorjeta={gorjeta}
            showGorjeta={showGorjeta}
          />

          <ResumoActionBar
            onClose={() => onOpenChange(false)}
            isSending={isSending}
            onSendWhatsApp={handleSendWhatsApp}
            onOpenEmail={handleOpenEmail}
            onSendAccount={handleSendAccount}
            onPrint={handlePrint}
          />
        </DialogContent>
      </Dialog>

      <EmailResumoDialog
        open={showEmailDialog}
        onOpenChange={setShowEmailDialog}
        driverName={motorista.driver_name}
        defaultEmail={motoristaEmail}
        dateRange={dateRange}
        liquido={liquido}
        fmt={fmt}
        receitas={receitas}
        despesas={despesas}
        totalDespesas={totalDespesas}
        isImportado={isImportado}
        totalReceitas={totalReceitas}
        receitaAjustada={receitaAjustada}
        slotPeriodos={slotPeriodos}
        totalSlot={totalSlot}
      />
    </>
  );
}
