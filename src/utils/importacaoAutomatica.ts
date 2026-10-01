export type PlataformaImportacao = 'uber' | 'bolt' | 'repsol' | 'edp' | 'bp' | 'viaverde';

export const ROTULO_PLATAFORMA: Record<PlataformaImportacao, string> = {
  uber: 'Uber',
  bolt: 'Bolt',
  repsol: 'Repsol',
  edp: 'EDP',
  bp: 'BP',
  viaverde: 'Via Verde',
};

/** Uber e Bolt trazem uma semana por ficheiro; os outros trazem a data em cada linha. */
export const PLATAFORMAS_SEMANAIS: readonly PlataformaImportacao[] = ['uber', 'bolt'];

export interface Periodo {
  inicio: string; // yyyy-MM-dd
  fim: string;
}

export interface ContaImportacao {
  id: string;
  nome: string;
  nomeEmpresa: string | null;
  plataforma: PlataformaImportacao;
}

/** Quanto do ficheiro já trabalhou em cada conta nas semanas anteriores. */
export interface Sobreposicao {
  /** Linhas (motorista × semana) desses motoristas nessa conta. */
  linhas: number;
  /** Motoristas distintos do ficheiro que já lá estiveram. */
  motoristas: number;
}

export type EstadoDeteccao = 'ok' | 'conflito' | 'escolher' | 'desconhecido';

export interface Deteccao {
  contaId: string | null;
  estado: EstadoDeteccao;
  motivo: string;
}

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Plataforma pelas colunas do ficheiro (o cabeçalho pode não estar na 1.ª linha). */
export function detectarPlataforma(texto: string): PlataformaImportacao | null {
  const topo = normalizar(texto.split(/\r?\n/).slice(0, 25).join('\n'));
  const tem = (...partes: string[]) => partes.every((p) => topo.includes(p));
  if (tem('uuid do motorista', 'pago a si')) return 'uber';
  if (tem('ganhos brutos (total)') || tem('identificador do motorista')) return 'bolt';
  if (tem('energia (kwh)') || tem('carregador', 'cartao')) return 'edp';
  if (tem('valor total fornecido') || tem('numeracao do negocio') || tem('dia hora', 'posto')) {
    return 'bp';
  }
  if (tem('conta repsol') || tem('num_tarjet') || tem('num. cartao') || tem('fec_oper')) {
    return 'repsol';
  }
  if (tem('barreira') && (tem('operador') || tem('matricula'))) return 'viaverde';
  return null;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Semana no nome: "20260921-20260927-...". Um fim de segunda a segunda conta até domingo. */
export function periodoDoNomeFicheiro(nome: string): Periodo | null {
  const m = nome.match(/(\d{4})(\d{2})(\d{2})-(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const data = (a: string, me: string, d: string) => {
    const x = new Date(Date.UTC(+a, +me - 1, +d));
    return iso(x) === `${a}-${me}-${d}` ? x : null;
  };
  const inicio = data(m[1], m[2], m[3]);
  const fim = data(m[4], m[5], m[6]);
  if (!inicio || !fim) return null;
  const dias = Math.round((fim.getTime() - inicio.getTime()) / 86_400_000);
  if (dias < 0 || dias > 7) return null;
  if (dias === 7) fim.setUTCDate(fim.getUTCDate() - 1);
  return { inicio: iso(inicio), fim: iso(fim) };
}

/** Segunda a domingo, como os resumos e os importadores esperam. */
export function ehSemanaCompleta(p: Periodo): boolean {
  const ini = new Date(`${p.inicio}T00:00:00Z`);
  const fim = new Date(`${p.fim}T00:00:00Z`);
  return ini.getUTCDay() === 1 && fim.getTime() - ini.getTime() === 6 * 86_400_000;
}

function separarLinhaCsv(linha: string, sep: string): string[] {
  const campos: string[] = [];
  let atual = '';
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (aspas && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else aspas = !aspas;
    } else if (c === sep && !aspas) {
      campos.push(atual);
      atual = '';
    } else atual += c;
  }
  campos.push(atual);
  return campos.map((x) => x.trim());
}

/** Valores de uma coluna (procurada pelo nome, sem acentos) em todas as linhas. */
function valoresDaColuna(texto: string, nomeColuna: string): string[] {
  const linhas = texto
    .trimStart() // tira também o BOM do Excel
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (linhas.length < 2) return [];
  const sep = [';', '\t', ','].reduce((melhor, s) =>
    linhas[0].split(s).length > linhas[0].split(melhor).length ? s : melhor
  );
  const cabecalho = separarLinhaCsv(linhas[0], sep).map(normalizar);
  const idx = cabecalho.findIndex((h) => h.includes(nomeColuna));
  if (idx < 0) return [];
  return linhas.slice(1).map((l) => separarLinhaCsv(l, sep)[idx] ?? '');
}

/** Identificadores dos motoristas no ficheiro: UUID Uber ou identificador Bolt. */
export function identificadoresDoFicheiro(
  plataforma: PlataformaImportacao,
  texto: string
): string[] {
  let valores: string[] = [];
  if (plataforma === 'uber') {
    valores = texto.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) ?? [];
    valores = valores.map((v) => v.toLowerCase());
  } else if (plataforma === 'bolt') {
    valores = valoresDaColuna(texto, 'identificador do motorista');
  }
  return [...new Set(valores.filter(Boolean))];
}

const PALAVRAS_GENERICAS = new Set([
  'uber',
  'bolt',
  'csv',
  'xlsx',
  'xls',
  'payments',
  'payment',
  'driver',
  'drivers',
  'pagamentos',
  'relatorio',
  'report',
  'lda',
  'unipessoal',
  'repsol',
  'edp',
  'via',
  'verde',
  'semana',
  'activity',
]);

const tokens = (s: string) =>
  normalizar(s)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t.length >= 3 && !/^\d+$/.test(t) && !PALAVRAS_GENERICAS.has(t));

/** O nome do ficheiro aponta para esta conta? ("UBER URBAN" → "Uber Urbango") */
export function nomeFicheiroApontaPara(nomeFicheiro: string, conta: ContaImportacao): boolean {
  const doFicheiro = tokens(nomeFicheiro);
  const daConta = tokens(`${conta.nome} ${conta.nomeEmpresa ?? ''}`);
  if (doFicheiro.length === 0 || daConta.length === 0) return false;
  const colado = doFicheiro.join('');
  return daConta.some(
    (c) =>
      (c.length >= 4 && colado.includes(c)) ||
      doFicheiro.some((t) => t === c || (t.length >= 4 && c.startsWith(t)))
  );
}

interface DecidirContaInput {
  plataforma: PlataformaImportacao;
  nomeFicheiro: string;
  contas: readonly ContaImportacao[];
  totalIdentificadores: number;
  sobreposicao: Readonly<Record<string, Sobreposicao>>;
}

/**
 * A conta de um ficheiro: os motoristas que lá vêm são a prova, o nome do
 * ficheiro é a pista. Se discordarem, não se adivinha: pede-se a escolha.
 */
export function decidirConta(input: DecidirContaInput): Deteccao {
  const { plataforma, nomeFicheiro, contas, totalIdentificadores, sobreposicao } = input;
  const candidatas = contas.filter((c) => c.plataforma === plataforma);
  const rotulo = ROTULO_PLATAFORMA[plataforma];
  if (candidatas.length === 0) {
    return {
      contaId: null,
      estado: 'desconhecido',
      motivo: `Não há nenhuma conta ${rotulo} activa.`,
    };
  }
  const peloNome = candidatas.filter((c) => nomeFicheiroApontaPara(nomeFicheiro, c));

  if (totalIdentificadores > 0) {
    const ranking = candidatas
      .map((c) => ({ conta: c, s: sobreposicao[c.id] ?? { linhas: 0, motoristas: 0 } }))
      .sort((a, b) => b.s.linhas - a.s.linhas);
    const [melhor, segundo] = ranking;
    if (melhor.s.linhas > 0) {
      const claro =
        melhor.s.motoristas >= Math.min(3, totalIdentificadores) &&
        melhor.s.linhas >= 2 * (segundo?.s.linhas ?? 0);
      if (!claro) {
        return {
          contaId: null,
          estado: 'escolher',
          motivo: `Os motoristas deste ficheiro aparecem em mais do que uma conta ${rotulo}.`,
        };
      }
      const outra = peloNome.find((c) => c.id !== melhor.conta.id);
      if (outra && !peloNome.some((c) => c.id === melhor.conta.id)) {
        return {
          contaId: null,
          estado: 'conflito',
          motivo: `O nome do ficheiro aponta para ${outra.nome}, mas ${melhor.s.motoristas} dos ${totalIdentificadores} motoristas trabalham na ${melhor.conta.nome}.`,
        };
      }
      return {
        contaId: melhor.conta.id,
        estado: 'ok',
        motivo: `${melhor.s.motoristas} dos ${totalIdentificadores} motoristas já trabalham nesta conta.`,
      };
    }
  }

  if (peloNome.length === 1) {
    return { contaId: peloNome[0].id, estado: 'ok', motivo: 'Pelo nome do ficheiro.' };
  }
  if (candidatas.length === 1) {
    return { contaId: candidatas[0].id, estado: 'ok', motivo: `Única conta ${rotulo} activa.` };
  }
  return {
    contaId: null,
    estado: 'escolher',
    motivo: 'Não foi possível saber a conta: escolha-a.',
  };
}

/** Contas semanais que ainda não têm dados dessa semana nem vêm nos ficheiros. */
export function contasEmFalta(
  contas: readonly ContaImportacao[],
  contasNosFicheiros: ReadonlySet<string>,
  contasComDados: ReadonlySet<string>
): ContaImportacao[] {
  return contas.filter(
    (c) =>
      PLATAFORMAS_SEMANAIS.includes(c.plataforma) &&
      !contasNosFicheiros.has(c.id) &&
      !contasComDados.has(c.id)
  );
}

const PLATAFORMA_DA_CONFIG: Record<string, PlataformaImportacao> = {
  uber: 'uber',
  bolt: 'bolt',
  repsol: 'repsol',
  edp: 'edp',
  bp: 'bp',
  viaverde: 'viaverde',
  via_verde: 'viaverde',
};

/** Linha de plataformas_configuracao → conta importável (as do robô contam pela plataforma-alvo). */
export function contaImportacaoDe(row: {
  id: string;
  nome: string;
  company_name: string | null;
  plataforma: string;
  robot_target_platform: string | null;
}): ContaImportacao | null {
  const alvo = row.plataforma === 'robot' ? row.robot_target_platform : row.plataforma;
  const plataforma = alvo ? PLATAFORMA_DA_CONFIG[alvo] : undefined;
  if (!plataforma) return null;
  return { id: row.id, nome: row.nome, nomeEmpresa: row.company_name, plataforma };
}

/** As últimas n semanas completas (segunda a domingo), a mais recente primeiro. */
export function semanasRecentes(hoje: Date, n: number): Periodo[] {
  const segunda = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()));
  segunda.setUTCDate(segunda.getUTCDate() - ((segunda.getUTCDay() + 6) % 7) - 7);
  return Array.from({ length: n }, (_, i) => {
    const ini = new Date(segunda);
    ini.setUTCDate(ini.getUTCDate() - 7 * i);
    const fim = new Date(ini);
    fim.setUTCDate(fim.getUTCDate() + 6);
    return { inicio: iso(ini), fim: iso(fim) };
  });
}

/** O que falta para um ficheiro poder ser importado; nulo quando está pronto. */
export function faltaParaImportar(linha: {
  plataforma: PlataformaImportacao | null;
  contaId: string | null;
  periodo: Periodo | null;
}): string | null {
  if (!linha.plataforma) return 'Ficheiro não reconhecido.';
  if (!linha.contaId) return 'Escolha a conta.';
  if (PLATAFORMAS_SEMANAIS.includes(linha.plataforma)) {
    if (!linha.periodo) return 'Escolha a semana.';
    if (!ehSemanaCompleta(linha.periodo)) return 'A semana tem de ir de segunda a domingo.';
  }
  return null;
}

/** Ficheiros do mesmo lote para a mesma conta e semana: o segundo apagaria o primeiro. */
export function repetidosNoLote(
  linhas: ReadonlyArray<{
    chave: string;
    plataforma: PlataformaImportacao | null;
    contaId: string | null;
    periodo: Periodo | null;
  }>
): Set<string> {
  const porAlvo = new Map<string, string[]>();
  for (const l of linhas) {
    if (!l.plataforma || !PLATAFORMAS_SEMANAIS.includes(l.plataforma)) continue;
    if (!l.contaId || !l.periodo) continue;
    const alvo = `${l.contaId}|${l.periodo.inicio}`;
    porAlvo.set(alvo, [...(porAlvo.get(alvo) ?? []), l.chave]);
  }
  return new Set([...porAlvo.values()].filter((c) => c.length > 1).flat());
}

const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** "21/09 a 27/09/2026" */
export const rotuloSemana = (p: Periodo) =>
  `${diaMes(p.inicio)} a ${diaMes(p.fim)}/${p.fim.slice(0, 4)}`;
