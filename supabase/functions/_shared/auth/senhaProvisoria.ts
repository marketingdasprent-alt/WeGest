export const PRAZO_HORAS = 72;

// Sem 0/O/o, 1/l/I: a senha é lida num email e escrita à mão no telemóvel.
const MAIUSCULAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const MINUSCULAS = 'abcdefghijkmnpqrstuvwxyz';
const DIGITOS = '23456789';
const TODOS = MAIUSCULAS + MINUSCULAS + DIGITOS;

// Rejeição por módulo para não enviesar os caracteres.
function inteiroAleatorio(limite: number): number {
  const maximo = Math.floor(0x100000000 / limite) * limite;
  const buffer = new Uint32Array(1);
  do crypto.getRandomValues(buffer);
  while (buffer[0] >= maximo);
  return buffer[0] % limite;
}

const escolher = (alfabeto: string) => alfabeto[inteiroAleatorio(alfabeto.length)];

/** Cumpre a política da app (8+, letra e número) e garante as três classes. */
export function gerarSenhaProvisoria(comprimento = 12): string {
  if (comprimento < 8) throw new RangeError('comprimento mínimo da senha é 8');
  const caracteres = [escolher(MAIUSCULAS), escolher(MINUSCULAS), escolher(DIGITOS)];
  while (caracteres.length < comprimento) caracteres.push(escolher(TODOS));
  for (let i = caracteres.length - 1; i > 0; i--) {
    const j = inteiroAleatorio(i + 1);
    [caracteres[i], caracteres[j]] = [caracteres[j], caracteres[i]];
  }
  return caracteres.join('');
}
