import jsPDF from 'jspdf';
import { format } from 'date-fns';
import { EmpresaConfig } from '@/config/empresas';
import { printPdf } from '@/lib/printPdf';

interface DriverData {
  nome: string;
  nif: string | null;
  documento_tipo: string | null;
  documento_numero: string | null;
  carta_conducao: string | null;
  carta_categorias: string[] | null;
  carta_validade: string | null;
  licenca_tvde_numero: string | null;
  licenca_tvde_validade: string | null;
  morada: string | null;
  email: string | null;
}

interface ContractData {
  driver: DriverData;
  contractStartDate: Date;
  signingDate: Date;
  signingCity: string;
  empresa: EmpresaConfig;
}

const formatDate = (date: Date): string => {
  return format(date, 'dd-MM-yyyy');
};

const formatDateSlash = (date: Date): string => {
  return format(date, 'dd/MM/yyyy');
};

const formatDateExtended = (date: Date): string => {
  const meses = [
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro',
  ];

  const dia = date.getDate();
  const mes = meses[date.getMonth()];
  const ano = date.getFullYear();

  return `${dia} de ${mes} de ${ano}`;
};

// Helper function to load image
const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
};

export const generateContract = async (
  data: ContractData,
  action: 'print' | 'download' = 'print',
  contratoId?: string
): Promise<void> => {
  // Pre-load background image
  const bg = await loadImage(data.empresa.papelTimbrado);
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Adicionar background na primeira página ANTES de qualquer texto
  pdf.addImage(bg, 'PNG', 0, 0, 210, 297);

  const pageWidth = pdf.internal.pageSize.getWidth(); // 210mm
  const pageHeight = pdf.internal.pageSize.getHeight(); // 297mm
  const leftMargin = 30; // Maior margem esquerda para não sobrepor texto lateral
  const rightMargin = 20;
  const topMargin = 55; // Começar após o logo
  const bottomMargin = 35; // Espaço para rodapé vermelho + paginação
  const maxWidth = pageWidth - leftMargin - rightMargin; // ~160mm
  let yPos = topMargin; // Começar aos 55mm

  // Helper function to add text with line breaks
  const addText = (
    text: string,
    size: number = 10,
    isBold: boolean = false,
    align: 'left' | 'center' | 'justify' = 'left'
  ) => {
    pdf.setFontSize(size);
    pdf.setFont('helvetica', isBold ? 'bold' : 'normal');

    const lines = pdf.splitTextToSize(text, maxWidth);

    lines.forEach((line: string) => {
      // Verificar se precisa de nova página (antes do rodapé)
      if (yPos > pageHeight - bottomMargin) {
        pdf.addPage();
        // Adicionar background imediatamente após criar nova página
        pdf.addImage(bg, 'PNG', 0, 0, 210, 297);
        yPos = topMargin; // Resetar para início da área de conteúdo
      }

      // Posicionar texto considerando margem esquerda
      if (align === 'center') {
        pdf.text(line, pageWidth / 2, yPos, { align: 'center' });
      } else if (align === 'justify') {
        pdf.text(line, leftMargin, yPos, { align: 'justify', maxWidth: maxWidth });
      } else {
        pdf.text(line, leftMargin, yPos);
      }

      yPos += size * 0.5;
    });

    yPos += 3;
  };

  const addSpace = (space: number = 5) => {
    yPos += space;
  };

  // Helper function to add text with mixed bold/normal styles
  const addMixedText = (parts: Array<{ text: string; bold: boolean }>, size: number = 10) => {
    pdf.setFontSize(size);

    let xPos = leftMargin;

    const ensureSpaceForNextLine = () => {
      yPos += size * 0.5;
      xPos = leftMargin;
      if (yPos > pageHeight - bottomMargin) {
        pdf.addPage();
        pdf.addImage(bg, 'PNG', 0, 0, 210, 297);
        yPos = topMargin;
      }
    };

    parts.forEach((part) => {
      pdf.setFont('helvetica', part.bold ? 'bold' : 'normal');

      // Split by spaces to process word by word
      const tokens = part.text.split(/(\s+)/).filter((t) => t.length > 0);

      tokens.forEach((token) => {
        const tokenWidth = pdf.getTextWidth(token);

        // Check if need to break line before this token
        if (xPos > leftMargin && xPos + tokenWidth > leftMargin + maxWidth) {
          ensureSpaceForNextLine();
        }

        // Handle very long tokens that don't fit in a single line
        if (tokenWidth > maxWidth) {
          let buffer = '';
          for (const char of token) {
            const testBuffer = buffer + char;
            const testWidth = pdf.getTextWidth(testBuffer);

            if (xPos > leftMargin && xPos + testWidth > leftMargin + maxWidth) {
              pdf.text(buffer, xPos, yPos);
              ensureSpaceForNextLine();
              buffer = char;
            } else if (testWidth > maxWidth) {
              // Even at start of line, this exceeds max width
              if (buffer) {
                pdf.text(buffer, xPos, yPos);
                ensureSpaceForNextLine();
              }
              buffer = char;
            } else {
              buffer = testBuffer;
            }
          }
          if (buffer) {
            pdf.text(buffer, xPos, yPos);
            xPos += pdf.getTextWidth(buffer);
          }
        } else {
          // Normal token that fits
          pdf.text(token, xPos, yPos);
          xPos += tokenWidth;
        }
      });
    });

    yPos += size * 0.5 + 3;
  };

  // Function to add page numbers to all pages
  const addPageNumbers = (pdf: jsPDF) => {
    const totalPages = pdf.getNumberOfPages();

    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i);
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(100, 100, 100); // Cinza

      const pageText = `${i}/${totalPages}`;
      const textWidth = pdf.getTextWidth(pageText);

      // Posicionar no centro, acima do rodapé vermelho (~265mm)
      pdf.text(pageText, (pageWidth - textWidth) / 2, 265);

      // Resetar cor do texto
      pdf.setTextColor(0, 0, 0);
    }
  };

  // HEADER
  addText(
    'CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE MOTORISTA INDEPENDENTE EM VEÍCULOS DESCARACTERIZADOS (TVDE)',
    12,
    true,
    'center'
  );
  addSpace(5);

  // CONTRACTING PARTIES
  addMixedText(
    [
      { text: 'PRIMEIRO OUTORGANTE: ', bold: false },
      { text: data.driver.nome?.toUpperCase() || '', bold: true },
      { text: ', com NIF ', bold: false },
      { text: data.driver.nif || '', bold: true },
      { text: ', titular do ', bold: false },
      { text: data.driver.documento_tipo || 'Cartão de Cidadão', bold: true },
      { text: ' n.º ', bold: false },
      { text: data.driver.documento_numero || '', bold: true },
      { text: ', Carta de Condução n.º ', bold: false },
      { text: data.driver.carta_conducao || '', bold: true },
      { text: ', categorias ', bold: false },
      { text: data.driver.carta_categorias?.join(', ') || '', bold: true },
      { text: ', com validade até ', bold: false },
      {
        text: data.driver.carta_validade ? formatDate(new Date(data.driver.carta_validade)) : '',
        bold: true,
      },
      { text: ' e CMTVDE n.º ', bold: false },
      { text: data.driver.licenca_tvde_numero || '', bold: true },
      { text: ' válido até ', bold: false },
      {
        text: data.driver.licenca_tvde_validade
          ? formatDateSlash(new Date(data.driver.licenca_tvde_validade))
          : '',
        bold: true,
      },
      { text: ', com residência na ', bold: false },
      { text: data.driver.morada || '', bold: true },
      { text: ', com o email ', bold: false },
      { text: data.driver.email || '', bold: true },
      { text: ', adiante designado(a) como Primeiro Outorgante.', bold: false },
    ],
    10
  );
  addSpace(3);

  const empresaText = `SEGUNDA OUTORGANTE: ${data.empresa.nomeCompleto}, pessoa coletiva nº ${data.empresa.nif}, com sede na ${data.empresa.sede}, licença de Operador de TVDE nº ${data.empresa.licencaTVDE}, válida até ${data.empresa.licencaValidade}, representada por ${data.empresa.representante}, ${data.empresa.cargoRepresentante}, adiante designada por Segunda Outorgante,`;

  addText(empresaText, 10, false, 'justify');
  addSpace(3);

  // CONSIDERANDO QUE
  addText('Considerando que:', 10, false, 'justify');
  addSpace(2);
  addText(
    'a) O Primeiro Outorgante se dedica, como trabalhador independente e com carácter lucrativo, à atividade de motorista TVDE; e que,',
    10,
    false,
    'justify'
  );
  addSpace(2);
  addText(
    'b) O Primeiro Outorgante possui o certificado de motorista de TVDE emitido pelo IMT, I.P., nos termos do disposto na Lei n.º 45/2018, de 10 de agosto e na Portaria n.º 293/2018, de 31 de outubro,',
    10,
    false,
    'justify'
  );
  addSpace(3);
  addText(
    'É livre e de boa-fé celebrado o presente contrato de Prestação de Serviços, ao abrigo do disposto no art.º. 1154 do Código Civil e Lei nº 45/2018, de 10 de agosto, e, especialmente, pelas cláusulas seguintes:',
    10,
    false,
    'justify'
  );
  addSpace(5);

  // CLÁUSULA PRIMEIRA
  addText('CLÁUSULA PRIMEIRA', 11, true, 'center');
  addText('(Objeto do Contrato)', 10, false, 'center');
  addSpace(3);
  addText(
    '1. Pelo presente contrato, a Primeira Outorgante contrata os serviços de motorista TVDE do Segundo Outorgante, de forma independente e autónoma, em regime de prestação de serviços e nos termos do disposto nos artigos 1154º e seguintes do Código Civil, não tendo os Outorgantes a intenção de constituir uma relação de natureza laboral.',
    10,
    false,
    'justify'
  );
  addSpace(2);
  addText(
    '2. Os serviços a prestar pelo Primeiro Outorgante, no âmbito do presente contrato, serão concretizados com plena autonomia e sem sujeição a quaisquer ordens ou instruções, sem sujeição a um horário de trabalho, estando apenas sujeitos às regras constantes dos artigos e clausulas seguintes.',
    10,
    false,
    'justify'
  );
  addSpace(5);

  // CLÁUSULA SEGUNDA
  addText('CLÁUSULA SEGUNDA', 11, true, 'center');
  addText('(Das Obrigações do Primeiro Outorgante)', 10, false, 'center');
  addSpace(3);
  addText(
    '1. O Primeiro Outorgante, obtida que seja a sua conta motorista/TVDE nas Plataformas, realizará a sua prestação de serviços diretamente, não podendo delegar a mesma em terceiros.',
    10,
    false,
    'justify'
  );
  addSpace(2);
  addText(
    '2. O Primeiro Outorgante é responsável por disponibilizar os seus dados e cumprir o código de conduta e instruções exigíveis aos motoristas TVDE nas Plataformas em que estiver inscrito.',
    10,
    false,
    'justify'
  );
  addSpace(2);
  addText(
    '3. O Primeiro Outorgante deverá respeitar as normas referentes à higiene, organização e cuidado dos veículos e de todos os equipamentos utilizados para a prestação dos serviços ora contratualizada, visando o bom atendimento aos utilizadores da(s) plataforma(s) eletrónica(s) operada(s) pela Segunda Outorgante e utilizadores evitando assim comunicações negativas por parte da(s) referida(s) plataforma(s) e utilizadores.',
    10,
    false,
    'justify'
  );
  addSpace(2);
  addText(
    '4. O Primeiro Outorgante deverá respeitar todas as normas de higiene e segurança, nomeadamente todas as regras em vigor ou que venham a ser definidas como proteção à COVID 19.',
    10,
    false,
    'justify'
  );
  addSpace(2);
  addText(
    '5. O Primeiro Outorgante obriga-se a manter rigorosamente dentro dos prazos de validade e em conformidade com a legislação vigente toda a documentação e requisitos indispensáveis para o exercício da atividade objeto do presente contrato, especialmente os descritos na alínea (a) a (d), do nº 1 do art.º. 10 da Lei 45/2018, de 10 de agosto.',
    10,
    false,
    'justify'
  );
  addSpace(2);
  addText(
    '6. No âmbito da presente prestação de serviços, não é permitido fumar no interior dos veículos, assim como não poderá o Primeiro Outorgante encontrar-se sob efeito de álcool e/ou qualquer outro estupefaciente ou substâncias psicotrópicas descritas nas tabelas I a IV anexas ao Decreto-Lei nº 15/93, de 22 de janeiro, sob pena de responsabilização civil e criminal.',
    10,
    false,
    'justify'
  );
  addSpace(2);
  addText(
    '7. O Primeiro Outorgante é responsável por zelar pela efetiva limpeza do veículo que, para a cabal prestação dos serviços em causa, utilizar.',
    10,
    false,
    'justify'
  );
  addSpace(2);
  addText(
    '8. O Primeiro Outorgante é responsável por efetuar a participação imediata às Plataformas de objetos que se encontrem perdidos no interior do veículo, utilizando para o efeito a sua aplicação e informando de seguida a Segunda Outorgante.',
    10,
    false,
    'justify'
  );
  addSpace(2);
  addText(
    '9. O Primeiro Outorgante é responsável por informar de imediato a Segunda Outorgante de qualquer sinistro em que seja interveniente no âmbito da presente prestação de serviços.',
    10,
    false,
    'justify'
  );
  addSpace(2);
  addText(
    '10. O Primeiro Outorgante deverá ter uma condução defensiva, cumprir as regras rodoviárias em vigor.',
    10,
    false,
    'justify'
  );
  addSpace(2);
  addText(
    '11. Quaisquer infrações rodoviárias praticadas pelo Primeiro Outorgante durante a execução do presente contrato serão da sua inteira responsabilidade.',
    10,
    false,
    'justify'
  );
  addSpace(2);
  addText(
    '12. O Primeiro Outorgante é responsável pelos danos provenientes do risco próprio do veículo sempre que detenha a direção efetiva do mesmo, sem detrimento da obrigação de transferir a responsabilidade inerente aos riscos de utilização do veículo para Seguradora.',
    10,
    false,
    'justify'
  );
  addSpace(5);

  // CLÁUSULA TERCEIRA
  addText('CLÁUSULA TERCEIRA', 11, true, 'center');
  addText('(Organização do Tempo de Trabalho)', 10, false, 'center');
  addSpace(3);
  addText(
    '1. O período normal de trabalho do Primeiro Outorgante, conforme Decreto-Lei nº 117/2012, de 5 de junho, não poderá ultrapassar as 60 horas semanais e nunca ultrapassando as 48 horas em média num período de quatro meses.',
    10,
    false,
    'justify'
  );
  addSpace(2);
  addText(
    '2. O Primeiro Outorgante realizará os turnos que entender, em dias não fixos e de acordo com sua disponibilidade e necessidade, limitados às 10h de prestação do serviço diário.',
    10,
    false,
    'justify'
  );
  addSpace(2);
  addText(
    '3. O Primeiro Outorgante realizará intervalo para descanso de, no mínimo, 45 (quarenta e cinco) minutos a, no máximo, 1 (uma) hora. O intervalo para descanso poderá ser dividido em até 3 (três) períodos, com duração de 15 a 20 minutos cada período.',
    10,
    false,
    'justify'
  );
  addSpace(2);
  addText(
    '4. O Primeiro Outorgante não realizará períodos de prestação de serviços superiores a 6 (seis) horas consecutivas.',
    10,
    false,
    'justify'
  );
  addSpace(5);

  // CLÁUSULA QUARTA
  addText('CLÁUSULA QUARTA', 11, true, 'center');
  addText('(Validade do Contrato e Remuneração)', 10, false, 'center');
  addSpace(3);
  addText(
    `1. O presente contrato de prestação de serviço iniciará em ${formatDate(data.contractStartDate)} e terá duração de 12 (doze) meses, sendo automaticamente renovado por igual período caso não exista nenhuma informação em contrário.`,
    10,
    false,
    'justify'
  );
  addSpace(2);
  addText(
    '2. No final de cada ciclo de 7 dias (de 2ª feira a Domingo), a Segunda Outorgante obriga-se a pagar ao Primeiro Outorgante o montante proporcional a 100% sobre o valor líquido auferido no ciclo de 7 dias deduzido de todos os custos que não sejam responsabilidade da Segunda Outorgante.',
    10,
    false,
    'justify'
  );
  addSpace(2);
  addText(
    '3. A Segunda Outorgante deverá apresentar um Relatório do Ciclo, para os fins do que estabelece o nº 2 desta cláusula, até 4 dias úteis após o fim do ciclo respetivo;',
    10,
    false,
    'justify'
  );
  addSpace(2);
  addText(
    '4. Sobre os montantes referidos no nº 2 desta cláusula, a Segunda Outorgante efetuará os competentes descontos legais, à taxa legal, a título de retenção na fonte (IRS), quando for o caso;',
    10,
    false,
    'justify'
  );
  addSpace(2);
  addText(
    '5. O Primeiro Outorgante é o único e exclusivo responsável pelo cumprimento das determinações legais relativas a normas de segurança do trabalho, bem como pelos pagamentos e contribuições relativos a impostos, segurança social, seguros de acidentes de trabalho ou outras importâncias devidas e inerentes à sua atividade profissional liberal.',
    10,
    false,
    'justify'
  );
  addSpace(2);
  addText(
    '6. O pagamento referido no nº 2 só será efetuado após a apresentação por parte do Primeiro Outorgante da fatura-recibo do valor previsto no Relatório do Ciclo.',
    10,
    false,
    'justify'
  );
  addSpace(5);

  // CLÁUSULA QUINTA
  addText('CLÁUSULA QUINTA', 11, true, 'center');
  addText('(Da Proteção de Dados)', 10, false, 'center');
  addSpace(3);
  addText(
    '1. O Primeiro Outorgante declara expressamente que os dados pessoais transmitidos à Segunda Outorgante para efeitos de elaboração e execução do presente contrato são adequados, pertinentes e não excessivos relativamente às finalidades visadas.',
    10,
    false,
    'justify'
  );
  addSpace(2);
  addText(
    '2. O Primeiro Outorgante autoriza a Segunda Outorgante a proceder ao tratamento dos dados pessoais ora transmitidos, tratamento esse que a Segunda Outorgante se obriga a efetuar de acordo com o disposto na legislação aplicável em matéria de tratamento de dados pessoais.',
    10,
    false,
    'justify'
  );
  addSpace(2);
  addText(
    '3. O Primeiro Outorgante obriga-se a não revelar, em nenhuma circunstância, os dados de natureza pessoal recolhidos ou fornecidos à Segunda Outorgante de que tome conhecimento, seja pelo exercício da presente prestação de serviços, seja por modo inadvertido, sob pena de responder, civil e criminalmente, por qualquer prática indevida que viole os direitos do titular desses dados.',
    10,
    false,
    'justify'
  );
  addSpace(2);
  addText(
    '4. A Segunda Outorgante vai conservar os dados do Primeiro Outorgante pelos prazos necessários a dar cumprimento a obrigações legais, designadamente de 10 (dez) anos para cumprimento à obrigação legal de arquivo de toda a documentação de escrita comercial.',
    10,
    false,
    'justify'
  );
  addSpace(2);
  addText(
    '5. O Primeiro Outorgante poderá solicitar à Segunda Outorgante e esta, salvo impedimento legal, vai salvaguardar os direitos do Primeiro Outorgante: de acesso aos dados pessoais que lhe digam respeito, bem como a sua retificação ou o seu apagamento, e a limitação do tratamento, e o direito de se opor ao tratamento, bem como do direito à portabilidade dos dados; e ainda o direito de retirar consentimento em qualquer altura, sem comprometer a licitude do tratamento efetuado com base no cumprimento de obrigações legais ou com base no consentimento previamente dado; e também o direito de reclamação sobre o tratamento de dados junto da Comissão Nacional de Proteção de Dados.',
    10,
    false,
    'justify'
  );
  addSpace(2);
  addText(
    '6. Tendo em conta as técnicas mais avançadas, os custos de aplicação e a natureza, o âmbito, o contexto e as finalidades do tratamento, bem como os riscos, de probabilidade e gravidade variável, para os direitos e liberdades das pessoas singulares, a Segunda Outorgante aplica as medidas técnicas e organizativas adequadas para assegurar um nível de segurança adequado ao risco, incluindo, consoante o que for adequado.',
    10,
    false,
    'justify'
  );
  addSpace(2);
  addText(
    '7. Em caso de violação de dados pessoais a Segunda Outorgante notifica esse facto à Comissão Nacional de Proteção de Dados nos termos e condições previstos na lei. Se essa violação for suscetível de implicar um elevado risco para os direitos e liberdades do titular comunica-lhe esse facto, nos termos e condições previstos na lei.',
    10,
    false,
    'justify'
  );
  addSpace(5);

  // CLÁUSULA SEXTA
  addText('CLÁUSULA SEXTA', 11, true, 'center');
  addText('(Caducidade e Denúncia Contratual)', 10, false, 'center');
  addSpace(3);
  addText(
    '1. O presente contrato poderá ser denunciado por qualquer das partes em qualquer tempo, devendo apenas a parte que o deseja cessar encaminhar comunicação com 30 dias de antecedência, por meio de e-mail e por carta registada, à morada da outra parte.',
    10,
    false,
    'justify'
  );
  addSpace(2);
  addText(
    '2. A denúncia do contrato sem observância do prazo de pré-aviso determinado acima, obriga o denunciante ao pagamento de uma indemnização correspondente ao período de pré-aviso em falta, calculando-se o valor com base na média da remuneração auferida pelo Segundo Outorgante nos 6 (seis) meses anteriores à denúncia.',
    10,
    false,
    'justify'
  );
  addSpace(2);
  addText(
    '3. O incumprimento das obrigações contratuais legitima a resolução contratual e a consequente indemnização pelos eventuais danos sofridos, nos termos gerais da responsabilidade civil.',
    10,
    false,
    'justify'
  );
  addSpace(10);

  // ASSINATURA
  addText(
    'FEITO E ASSINADO, em duplicado, na data e local mencionados abaixo, pelas partes aí identificadas e assinadas, ficando um exemplar para cada uma das partes.',
    10,
    false,
    'justify'
  );
  addSpace(10);

  addText(`${data.signingCity}, ${formatDateExtended(data.signingDate)}`, 10, false, 'left');
  addSpace(5);

  addText('Primeiro Outorgante:', 10, false, 'left');
  addText('_______________________________________________________', 10, false, 'left');
  addSpace(5);

  addText('Segunda Outorgante:', 10, false, 'left');
  addText('_______________________________________________________', 10, false, 'left');

  // Add page numbers to all pages
  addPageNumbers(pdf);

  const fileName = `Contrato_${data.driver.nome.replace(/\s+/g, '_')}_${format(data.signingDate, 'dd-MM-yyyy')}.pdf`;
  if (action === 'print') {
    printPdf(pdf, fileName);
  } else {
    // Exportar PDF com nome personalizado
    pdf.save(fileName);
  }
};

export const validateDriverData = (driver: DriverData): string[] => {
  const missingFields: string[] = [];

  if (!driver.nome) missingFields.push('Nome');
  if (!driver.nif) missingFields.push('NIF');
  if (!driver.documento_tipo) missingFields.push('Tipo de Documento');
  if (!driver.documento_numero) missingFields.push('Número de Documento');
  if (!driver.carta_conducao) missingFields.push('Carta de Condução');
  if (!driver.carta_categorias || driver.carta_categorias.length === 0)
    missingFields.push('Categorias da Carta');
  if (!driver.carta_validade) missingFields.push('Validade da Carta');
  if (!driver.licenca_tvde_numero) missingFields.push('Número da Licença TVDE');
  if (!driver.licenca_tvde_validade) missingFields.push('Validade da Licença TVDE');
  if (!driver.morada) missingFields.push('Morada');
  if (!driver.email) missingFields.push('Email');

  return missingFields;
};
