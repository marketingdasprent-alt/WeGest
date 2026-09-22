import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { validarDanos, type NovoDano } from '@/components/renting/danos/DanosEditor';
import { RegistoViaturaSection } from '@/components/entrega/RegistoViaturaSection';
import { Printer } from 'lucide-react';
import jsPDF from 'jspdf';
import { precisaCombustivel, precisaEletrico, precisaGpl } from '@/utils/combustivel';

// ── Types ─────────────────────────────────────────────────────────────────────

/** O modelo de dano é partilhado com o fecho de contrato — ver DanosEditor.
 *  Era um tipo próprio, sem campo de valor: TODOS os danos registados pelo
 *  calendário ficavam gravados a 0 € e nunca chegavam a ser cobrados a
 *  ninguém (536 danos em produção, 0,00 € no total). A localização também era
 *  texto livre, fora da lista que os outros ecrãs sabem traduzir. */
export type NovoDanoState = NovoDano;

export interface CheckinDadosState {
  km: string;
  combustivel: string;
  nivelEletrico: string;
  nivelGpl: string;
  novosDanos: NovoDanoState[];
}

export function emptyCheckinDados(): CheckinDadosState {
  return { km: '', combustivel: '', nivelEletrico: '', nivelGpl: '', novosDanos: [] };
}

/**
 * Repõe um rascunho vindo do IndexedDB em estado utilizável.
 *
 * Os `File` sobrevivem intactos (structured clone), mas os `preview` são
 * object URLs da sessão anterior — a página que os criou já não existe e o
 * browser revogou-os, por isso as miniaturas apareceriam partidas. Criam-se
 * de novo a partir do ficheiro, que é o que interessa guardar.
 */
export function reidratarCheckinDados(dados: CheckinDadosState): CheckinDadosState {
  return {
    ...dados,
    novosDanos: (dados.novosDanos ?? []).map((dano) => ({
      ...dano,
      files: (dano.files ?? [])
        .filter((f) => f.file instanceof File)
        .map((f) => ({
          ...f,
          preview: f.file.type.startsWith('image/') ? URL.createObjectURL(f.file) : null,
        })),
    })),
  };
}

export function validateCheckinDados(
  dados: CheckinDadosState,
  kmMinimo: number,
  tipoCombustivel = ''
): string | null {
  if (!dados.km.trim() || isNaN(Number(dados.km))) return 'KM atual é obrigatório';
  if (Number(dados.km) < kmMinimo)
    return `KM não pode ser inferior a ${kmMinimo.toLocaleString()} km (registo atual da viatura)`;
  if (precisaCombustivel(tipoCombustivel) && !dados.combustivel)
    return 'Nível de combustível é obrigatório';
  if (precisaEletrico(tipoCombustivel) && !dados.nivelEletrico)
    return 'Nível de bateria elétrica é obrigatório';
  if (precisaGpl(tipoCombustivel) && !dados.nivelGpl) return 'Nível de GPL é obrigatório';
  return validarDanos(dados.novosDanos);
}

interface SaveParams {
  dados: CheckinDadosState;
  contratoId: string;
  viaturaId: string;
  userId: string;
  tipo: 'checkout' | 'checkin';
  motoristaId?: string;
}

export async function saveCheckinDados({
  dados,
  contratoId,
  viaturaId,
  userId,
  tipo,
  motoristaId,
}: SaveParams) {
  const kmNum = Number(dados.km);
  const isOut = tipo === 'checkout';

  // 1. Atualizar contrato com km, combustivel, eletricidade, gpl
  const field = isOut
    ? {
        km_checkout: kmNum,
        combustivel_checkout: dados.combustivel || null,
        eletricidade_checkout: dados.nivelEletrico || null,
        gpl_checkout: dados.nivelGpl || null,
      }
    : {
        km_checkin: kmNum,
        combustivel_checkin: dados.combustivel || null,
        eletricidade_checkin: dados.nivelEletrico || null,
        gpl_checkin: dados.nivelGpl || null,
      };
  await supabase.from('contratos').update(field).eq('id', contratoId);

  // 2. Atualizar km_atual da viatura
  await supabase.from('viaturas').update({ km_atual: kmNum }).eq('id', viaturaId);

  // 3. Guardar novos danos + fotos (ligados à viatura, contrato E motorista)
  for (const dano of dados.novosDanos) {
    if (!dano.descricao.trim()) continue;
    const { data: newDano, error: dErr } = await supabase
      .from('viatura_danos')
      .insert({
        viatura_id: viaturaId,
        descricao: dano.descricao.trim(),
        localizacao: dano.localizacao.trim() || null,
        // null = por avaliar; não é o mesmo que "não custa nada".
        valor: dano.valor.trim() ? Number(dano.valor) : null,
        // 'existente' e não 'pendente': a lista de estados que a ficha da
        // viatura conhece é existente/em_reparacao/reparado/irreparavel.
        // 'pendente' não está lá — eram 144 danos a aparecer sem estado
        // reconhecido nesse ecrã, todos vindos daqui.
        estado: 'existente',
        registado_por: userId,
        contrato_id: contratoId,
        contrato_id_origem: contratoId,
        motorista_id: motoristaId || null,
      })
      .select('id')
      .single();
    if (dErr) throw dErr;

    for (const { file } of dano.files) {
      const ext = file.name.split('.').pop() || 'bin';
      const path = `${newDano.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('viatura-danos')
        .upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      await supabase.from('viatura_dano_fotos').insert({
        dano_id: newDano.id,
        ficheiro_url: path,
        nome_ficheiro: file.name,
        uploaded_by: userId,
        contrato_id: contratoId,
      });
    }
  }
}

// ── Folha de Danos PDF ────────────────────────────────────────────────────────

interface DanoExistente {
  id: string;
  descricao: string;
  localizacao: string | null;
  estado: string;
  data_registo: string;
}

interface FolhaDanosParams {
  matricula: string;
  motoristaNome: string;
  tipo: 'checkout' | 'checkin';
  tipoCombustivel?: string;
  km: string;
  combustivel: string;
  nivelEletrico: string;
  nivelGpl: string;
  danosExistentes: DanoExistente[];
  novosDanos: NovoDanoState[];
  dataEvento: string;
  contratoNumero?: number | null;
  assinaturaMotoristaPng?: string | null;
  assinaturaResponsavelPng?: string | null;
  existingPdf?: jsPDF;
}

export function gerarFolhaDanos(p: FolhaDanosParams) {
  // Quem chama é que manda na paginação, tal como no
  // generateDocumentFromTemplate: recebendo um PDF existente, escreve-se na
  // página CORRENTE e não se cria nenhuma. Havia aqui um `doc.addPage()` que
  // fazia o contrário — dois geradores com contratos opostos obrigavam cada
  // chamador a adivinhar qual estava a usar, e era isso que produzia ora
  // folhas em branco a mais ora documentos sobrepostos.
  const doc = p.existingPdf || new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  let y = 20;

  const line = (x1: number, y1: number, x2: number, y2: number) => doc.line(x1, y1, x2, y2);
  const text = (t: string, x: number, yy: number, opts?: any) => {
    doc.text(t, x, yy, opts);
  };

  // Header
  doc.setFillColor(30, 30, 30);
  doc.rect(0, 0, W, 14, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  text('FOLHA DE DANOS — WeGest', W / 2, 9, { align: 'center' });

  doc.setTextColor(0, 0, 0);
  y = 22;

  // Subtitle
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  const tipoLabel = p.tipo === 'checkout' ? 'ENTREGA DE VIATURA' : 'DEVOLUÇÃO DE VIATURA';
  text(tipoLabel, W / 2, y, { align: 'center' });
  y += 8;

  // Info box — calculate height based on fuel types shown
  const tc = (p.tipoCombustivel || '').toLowerCase();
  const mostraCombustivel = precisaCombustivel(tc);
  const mostraEletrico = precisaEletrico(tc);
  const mostraGpl = precisaGpl(tc);
  const energyRows = (mostraCombustivel ? 1 : 0) + (mostraEletrico ? 1 : 0) + (mostraGpl ? 1 : 0);
  const boxH = 14 + energyRows * 7;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setFillColor(245, 245, 245);
  doc.rect(14, y, W - 28, boxH, 'F');
  doc.setDrawColor(200, 200, 200);
  doc.rect(14, y, W - 28, boxH, 'S');

  const col1 = 18;
  const col2 = 110;
  y += 6;

  // Row 1: Viatura + Data
  doc.setFont('helvetica', 'bold');
  text('Viatura:', col1, y);
  doc.setFont('helvetica', 'normal');
  text(p.matricula, col1 + 20, y);
  doc.setFont('helvetica', 'bold');
  text('Data:', col2, y);
  doc.setFont('helvetica', 'normal');
  text(p.dataEvento, col2 + 15, y);
  y += 7;

  // Row 2: Motorista + Contrato
  doc.setFont('helvetica', 'bold');
  text('Motorista:', col1, y);
  doc.setFont('helvetica', 'normal');
  text(p.motoristaNome || '—', col1 + 24, y);
  doc.setFont('helvetica', 'bold');
  text('Contrato:', col2, y);
  doc.setFont('helvetica', 'normal');
  text(
    p.contratoNumero != null ? `CT-${String(p.contratoNumero).padStart(4, '0')}` : '—',
    col2 + 24,
    y
  );
  y += 7;

  // Row 3+: Energy levels
  if (mostraCombustivel) {
    doc.setFont('helvetica', 'bold');
    text('Combustível:', col1, y);
    doc.setFont('helvetica', 'normal');
    text(p.combustivel || '—', col1 + 30, y);
    if (mostraGpl) {
      doc.setFont('helvetica', 'bold');
      text('GPL:', col2, y);
      doc.setFont('helvetica', 'normal');
      text(p.nivelGpl || '—', col2 + 15, y);
    }
    y += 7;
  }
  if (mostraEletrico) {
    doc.setFont('helvetica', 'bold');
    text(mostraCombustivel ? 'Bateria:' : 'Elétrico:', col1, y);
    doc.setFont('helvetica', 'normal');
    text(p.nivelEletrico || '—', col1 + (mostraCombustivel ? 22 : 24), y);
    y += 7;
  }
  if (mostraGpl && !mostraCombustivel) {
    doc.setFont('helvetica', 'bold');
    text('GPL:', col1, y);
    doc.setFont('helvetica', 'normal');
    text(p.nivelGpl || '—', col1 + 15, y);
    y += 7;
  }

  // KM always at the end of the box
  doc.setFont('helvetica', 'bold');
  text('KM:', col1, y);
  doc.setFont('helvetica', 'normal');
  text(`${Number(p.km || 0).toLocaleString()} km`, col1 + 12, y);
  y += 10;

  // Statement + damages table
  const allDanos = [
    ...p.danosExistentes.map((d) => ({
      descricao: d.descricao,
      localizacao: d.localizacao,
      novo: false,
    })),
    ...p.novosDanos.map((d) => ({
      descricao: d.descricao,
      localizacao: d.localizacao,
      novo: true,
    })),
  ];

  if (allDanos.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100, 100, 100);
    text('Nenhum dano registado na viatura.', 14, y);
    doc.setTextColor(0, 0, 0);
    y += 8;
  } else {
    const statement =
      p.tipo === 'checkout'
        ? `O motorista ${p.motoristaNome || '(sem nome)'} confirma receber a viatura ${p.matricula} com os seguintes danos previamente registados:`
        : `O motorista ${p.motoristaNome || '(sem nome)'} confirma devolver a viatura ${p.matricula} com os seguintes danos registados:`;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(statement, W - 28) as string[];
    doc.text(lines, 14, y);
    y += lines.length * 5 + 4;

    doc.setFillColor(50, 50, 50);
    doc.rect(14, y, W - 28, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    text('#', 17, y + 5);
    text('Descrição do Dano', 25, y + 5);
    text('Localização', 130, y + 5);
    text('Estado', 170, y + 5);
    y += 7;

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    allDanos.forEach((d, i) => {
      if (y > 265) {
        doc.addPage();
        y = 20;
      }
      const bg = i % 2 === 0 ? [255, 255, 255] : [248, 248, 248];
      doc.setFillColor(bg[0], bg[1], bg[2]);
      doc.rect(14, y, W - 28, 7, 'F');
      doc.setDrawColor(220, 220, 220);
      doc.rect(14, y, W - 28, 7, 'S');
      doc.setFontSize(8);
      text(String(i + 1), 17, y + 5);
      const descLines = doc.splitTextToSize(d.descricao, 100) as string[];
      text(descLines[0], 25, y + 5);
      text(d.localizacao || '—', 130, y + 5);
      if (d.novo) {
        doc.setTextColor(200, 50, 50);
        text('NOVO', 170, y + 5);
        doc.setTextColor(0, 0, 0);
      } else {
        text('Existente', 170, y + 5);
      }
      y += 7;
    });
  }

  y += 14;
  if (y > 240) {
    doc.addPage();
    y = 20;
  }
  // Slots de assinatura: 14-90 (motorista) e 120-196 (responsável).
  // Cada assinatura é desenhada acima da linha-base quando fornecida; senão
  // mantém-se a linha em branco para assinatura manuscrita (comportamento legacy).
  const sigBaseY = y;
  const drawSig = (png: string | null | undefined, x: number) => {
    if (!png) return;
    try {
      // Caixa 76mm de largura, 18mm de altura, assente sobre a linha.
      doc.addImage(png, 'PNG', x, sigBaseY - 18, 76, 18, undefined, 'FAST');
    } catch {
      /* PNG inválido — fica a linha em branco */
    }
  };
  drawSig(p.assinaturaMotoristaPng, 14);
  drawSig(p.assinaturaResponsavelPng, 120);

  doc.setDrawColor(0);
  line(14, y, 90, y);
  line(120, y, 196, y);
  y += 5;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  text('Assinatura do Motorista', 14, y);
  text('Assinatura do Responsável', 120, y);

  if (!p.existingPdf) {
    doc.save(`folha-danos-${p.matricula.replace(/[^A-Z0-9]/gi, '')}-${p.dataEvento}.pdf`);
  }
  return doc;
}

// ── UI Component ──────────────────────────────────────────────────────────────

interface CheckinDadosSectionProps {
  viaturaId: string;
  kmMinimo: number;
  dados: CheckinDadosState;
  onChange: (d: CheckinDadosState) => void;
  tipo: 'checkout' | 'checkin';
  tipoCombustivel?: string;
  motoristaNome?: string;
  matricula?: string;
  dataEvento?: string;
  contratoNumero?: number | null;
  /** Contrato em curso — os danos que ele já registou não contam como "já
   *  existentes". Opcional: nem todos os ecrãs o têm à mão. */
  contratoId?: string | null;
  accentClass?: string;
}

export const CheckinDadosSection: React.FC<CheckinDadosSectionProps> = ({
  viaturaId,
  kmMinimo,
  dados,
  onChange,
  tipo,
  tipoCombustivel = '',
  motoristaNome = '',
  matricula = '',
  dataEvento = '',
  contratoNumero,
  contratoId,
  accentClass = 'border-gray-200 dark:border-gray-700',
}) => {
  const { data: danosExistentes = [] } = useQuery({
    queryKey: ['viatura-danos-ativos', viaturaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('viatura_danos')
        .select('id, descricao, localizacao, estado, data_registo')
        .eq('viatura_id', viaturaId)
        .neq('estado', 'reparado')
        .order('data_registo', { ascending: false });
      if (error) throw error;
      return data as {
        id: string;
        descricao: string;
        localizacao: string | null;
        estado: string;
        data_registo: string;
      }[];
    },
    enabled: !!viaturaId,
  });

  const set = (partial: Partial<CheckinDadosState>) => onChange({ ...dados, ...partial });

  const handlePrintFolha = () => {
    const error = validateCheckinDados(dados, kmMinimo, tipoCombustivel);
    if (error) {
      toast.error(error);
      return;
    }
    gerarFolhaDanos({
      matricula,
      motoristaNome,
      tipo,
      tipoCombustivel,
      km: dados.km,
      combustivel: dados.combustivel,
      nivelEletrico: dados.nivelEletrico,
      nivelGpl: dados.nivelGpl,
      danosExistentes,
      novosDanos: dados.novosDanos,
      dataEvento,
      contratoNumero,
    });
  };

  return (
    // Painel, cores e campos vêm todos do RegistoViaturaSection — o MESMO
    // componente do fecho de contrato e do /realizar. O invólucro (cartão
    // cinzento próprio, cabeçalho) vivia aqui, e era por isso que este ecrã
    // parecia outro apesar de já partilhar os campos.
    <RegistoViaturaSection
      titulo={`Condição da Viatura${tipo === 'checkout' ? ' — Checkout' : ' — Checkin'}`}
      accaoHeader={
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto gap-1.5 text-xs"
          onClick={handlePrintFolha}
        >
          <Printer className="h-3.5 w-3.5" />
          Folha de Danos
        </Button>
      }
      className={accentClass}
      viaturaId={viaturaId}
      contratoId={contratoId}
      tipoCombustivel={tipoCombustivel}
      km={dados.km}
      onKmChange={(km) => set({ km })}
      kmMinimo={kmMinimo}
      combustivel={dados.combustivel}
      onCombustivelChange={(combustivel) => set({ combustivel })}
      nivelEletrico={dados.nivelEletrico}
      onNivelEletricoChange={(nivelEletrico) => set({ nivelEletrico })}
      nivelGpl={dados.nivelGpl}
      onNivelGplChange={(nivelGpl) => set({ nivelGpl })}
      danos={dados.novosDanos}
      onDanosChange={(novosDanos) => set({ novosDanos })}
    />
  );
};
