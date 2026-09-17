// A cobrança só aceita cliente/condutor e referencia `clientes`; o chamador
// converte motoristas para a respetiva ficha antes de gravar.

export type EntidadeFaturacao = 'cliente' | 'condutor' | 'motorista';

export interface DestinatarioEntidade {
  id: string;
  nome: string;
  tipo?: 'cliente' | 'motorista';
  contratoCondutorId?: string;
}

export interface DestinatarioResolvido {
  destinatario: DestinatarioEntidade;
  papel: 'cliente' | 'condutor';
  contratoCondutorId: string | null;
  precisaFichaCliente: boolean;
}

export function resolverDestinatario(
  entidade: EntidadeFaturacao,
  opcoes: {
    cliente: DestinatarioEntidade;
    condutor?: DestinatarioEntidade | null;
    motorista?: DestinatarioEntidade | null;
  }
): DestinatarioResolvido {
  const escolhido =
    entidade === 'condutor' ? opcoes.condutor : entidade === 'motorista' ? opcoes.motorista : null;

  if (!escolhido) {
    return {
      destinatario: opcoes.cliente,
      papel: 'cliente',
      contratoCondutorId: null,
      precisaFichaCliente: false,
    };
  }

  return {
    destinatario: escolhido,
    papel: 'condutor',
    contratoCondutorId: escolhido.contratoCondutorId ?? null,
    precisaFichaCliente: escolhido.tipo === 'motorista',
  };
}
