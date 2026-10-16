// Corpo do PUT /conta/candidatura: os campos do rascunho, todos opcionais e sem ficheiros.
// Valida só o formato (como validarCorpoCandidatura); os checksums de NIF e IBAN e a
// obrigatoriedade para submeter ficam no SQL. Só devolve o que veio no pedido.
import {
  CATEGORIAS_CARTA,
  CATEGORIAS_MAXIMO,
  CODIGO_POSTAL,
  CONSENTIMENTO_FUTURO_MS,
  IBAN,
  INICIO_MAXIMO_DIAS,
  NIF,
  somarDias,
  TIPOS_DOCUMENTO,
  UUID,
  validadeFutura,
} from './candidaturas.ts';
import { lerDataComFuso } from './disponibilidade.ts';
import { EMAIL, lerData, objecto, obrigatorio, opcional, TELEFONE } from './reservas.ts';

export type RascunhoCandidatura = Record<string, unknown>;
type Validacao = { ok: true; valor: RascunhoCandidatura } | { ok: false; mensagem: string };
type Campo = (v: unknown, dia: string, agora: Date) => { valor: unknown } | { mensagem: string };

const bom = (valor: unknown) => ({ valor });
const mau = (mensagem: string) => ({ mensagem });

const textoCurto =
  (nome: string, max: number): Campo =>
  (v) => {
    const t = obrigatorio(v, max);
    return t ? bom(t) : mau(`${nome} tem de ser texto não vazio (até ${max} caracteres).`);
  };

/** Objecto aninhado com campos opcionais: um campo desconhecido ou mal formado recusa. */
const objectoParcial =
  (nome: string, campos: Record<string, Campo>): Campo =>
  (v, dia, agora) => {
    const o = objecto(v);
    if (!o) return mau(`${nome} tem de ser um objecto.`);
    const saida: Record<string, unknown> = {};
    for (const [k, valor] of Object.entries(o)) {
      const validar = campos[k];
      if (!validar) return mau(`${nome}.${k} não é um campo aceite.`);
      const r = validar(valor, dia, agora);
      if ('mensagem' in r) return mau(r.mensagem);
      saida[k] = r.valor;
    }
    return bom(saida);
  };

const validade =
  (nome: string): Campo =>
  (v, dia) => {
    const d = validadeFutura(v, dia);
    return d ? bom(d) : mau(`${nome} é uma data AAAA-MM-DD depois de hoje.`);
  };

const CAMPOS: Record<string, { nulavel?: true; validar: Campo }> = {
  nome: { validar: textoCurto('nome', 200) },
  email: {
    validar: (v) => {
      const e = obrigatorio(v, 254)?.toLowerCase() ?? null;
      return e && EMAIL.test(e) ? bom(e) : mau('email inválido.');
    },
  },
  telefone: {
    validar: (v) => {
      const t = obrigatorio(v, 20);
      return t && TELEFONE.test(t) ? bom(t) : mau('telefone inválido.');
    },
  },
  nif: {
    validar: (v) => {
      const n = typeof v === 'string' ? v.replace(/\s/g, '') : '';
      return NIF.test(n) ? bom(n) : mau('nif tem de ter 9 dígitos (NIF português).');
    },
  },
  morada: { validar: textoCurto('morada', 200) },
  codigo_postal: {
    validar: (v) => {
      const c = obrigatorio(v, 8);
      return c && CODIGO_POSTAL.test(c)
        ? bom(c)
        : mau('codigo_postal tem de ter o formato 0000-000.');
    },
  },
  cidade: { validar: textoCurto('cidade', 100) },
  documento: {
    validar: objectoParcial('documento', {
      tipo: (v) =>
        TIPOS_DOCUMENTO.find((t) => t === v)
          ? bom(v)
          : mau(`documento.tipo tem de ser um de: ${TIPOS_DOCUMENTO.join(', ')}.`),
      numero: textoCurto('documento.numero', 40),
      validade: validade('documento.validade'),
    }),
  },
  carta_conducao: {
    validar: objectoParcial('carta_conducao', {
      numero: textoCurto('carta_conducao.numero', 40),
      categorias: (v) =>
        Array.isArray(v) &&
        v.length > 0 &&
        v.length <= CATEGORIAS_MAXIMO &&
        v.every((k) => typeof k === 'string' && CATEGORIAS_CARTA.has(k))
          ? bom(v)
          : mau(
              `carta_conducao.categorias é uma lista (até ${CATEGORIAS_MAXIMO}) de: ${[...CATEGORIAS_CARTA].join(', ')}.`
            ),
      validade: validade('carta_conducao.validade'),
    }),
  },
  licenca_tvde: {
    nulavel: true,
    validar: objectoParcial('licenca_tvde', {
      numero: textoCurto('licenca_tvde.numero', 40),
      validade: validade('licenca_tvde.validade'),
    }),
  },
  em_formacao_tvde: {
    validar: (v) => (typeof v === 'boolean' ? bom(v) : mau('em_formacao_tvde é true ou false.')),
  },
  iban: {
    validar: (v) => {
      const i = typeof v === 'string' ? v.replace(/\s/g, '').toUpperCase() : '';
      return IBAN.test(i) ? bom(i) : mau('iban inválido.');
    },
  },
  modelo_pretendido_id: {
    nulavel: true,
    validar: (v) =>
      typeof v === 'string' && UUID.test(v)
        ? bom(v)
        : mau('modelo_pretendido_id tem de ser um UUID.'),
  },
  data_inicio_pretendida: {
    nulavel: true,
    validar: (v, dia) => {
      const d = lerData(v);
      return d && d >= dia && d <= somarDias(dia, INICIO_MAXIMO_DIAS)
        ? bom(d)
        : mau(
            `data_inicio_pretendida é uma data AAAA-MM-DD entre hoje e daqui a ${INICIO_MAXIMO_DIAS} dias.`
          );
    },
  },
  observacoes: {
    nulavel: true,
    validar: (v) => {
      const o = opcional(v, 1000);
      return o === undefined ? mau('observacoes tem no máximo 1000 caracteres.') : bom(o);
    },
  },
  consentimento: {
    validar: (v, _dia, agora) => {
      const c = objecto(v);
      const versao = c ? obrigatorio(c.versao, 50) : null;
      const aceite = c && typeof c.aceite_em === 'string' ? lerDataComFuso(c.aceite_em) : null;
      if (!c || Object.keys(c).some((k) => k !== 'versao' && k !== 'aceite_em')) {
        return mau('consentimento só aceita versao e aceite_em.');
      }
      if (!versao || !aceite || aceite.getTime() > agora.getTime() + CONSENTIMENTO_FUTURO_MS) {
        return mau(
          'consentimento precisa de versao e de aceite_em (ISO 8601 com fuso, não no futuro).'
        );
      }
      return bom({ versao, aceite_em: aceite.toISOString() });
    },
  },
};

export const CAMPOS_RASCUNHO = Object.keys(CAMPOS);

export function validarRascunho(corpo: unknown, agora = new Date()): Validacao {
  const c = objecto(corpo);
  if (!c) return { ok: false, mensagem: 'Corpo tem de ser um objecto JSON.' };
  const entradas = Object.entries(c);
  if (entradas.length === 0) return { ok: false, mensagem: 'Envie pelo menos um campo.' };
  const dia = agora.toISOString().slice(0, 10);
  const valor: RascunhoCandidatura = {};
  for (const [nome, v] of entradas) {
    // Hasownproperty: "constructor" e afins não podem passar por campo conhecido.
    const campo = Object.hasOwn(CAMPOS, nome) ? CAMPOS[nome] : undefined;
    if (!campo) return { ok: false, mensagem: `${nome} não é um campo aceite.` };
    if (v === null) {
      if (!campo.nulavel) return { ok: false, mensagem: `${nome} não pode ser null.` };
      valor[nome] = null;
      continue;
    }
    const r = campo.validar(v, dia, agora);
    if ('mensagem' in r) return { ok: false, mensagem: r.mensagem };
    valor[nome] = r.valor;
  }
  return { ok: true, valor };
}
