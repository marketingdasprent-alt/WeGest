/**
 * Quem é o destinatário fiscal de uma factura de contrato.
 *
 * Antes, escolher "Condutor" ou "Motorista" no diálogo de faturação não mudava
 * nada em TVDE: o destinatário caía sempre no titular do contrato (a empresa) e
 * era o NIF dela que seguia para o emissor fiscal. Esta função é a decisão,
 * isolada e testável, de quem fica no documento.
 *
 * Duas restrições da base de dados moldam o resultado:
 *   · `contrato_cobrancas.destinatario_papel` só aceita 'cliente' | 'condutor'
 *     — um motorista escolhido grava-se como 'condutor', que é o que ele é no
 *     contrato;
 *   · `contrato_cobrancas.destinatario_id` tem FK para `clientes(id)` — o id de
 *     um motorista NÃO entra ali. Daí `precisaFichaCliente`: quem chama tem de
 *     trocar o id do motorista pelo da ficha de cliente dele (RPC
 *     `garantir_cliente_do_motorista`) antes de gravar.
 */

export type EntidadeFaturacao = 'cliente' | 'condutor' | 'motorista';

export interface DestinatarioEntidade {
  id: string;
  nome: string;
  /** 'motorista' → o `id` vem de `motoristas_ativos`, não de `clientes`. */
  tipo?: 'cliente' | 'motorista';
  /** Linha de `contrato_condutores` que originou esta entidade. */
  contratoCondutorId?: string;
}

export interface DestinatarioResolvido {
  destinatario: DestinatarioEntidade;
  papel: 'cliente' | 'condutor';
  contratoCondutorId: string | null;
  /** true → o `destinatario.id` é de um motorista e tem de ser convertido
   *  numa ficha de `clientes` antes de gravar a cobrança. */
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

  // Sem entidade escolhida (ou o contrato não a tem) o documento fica no
  // titular — é o comportamento antigo, agora só como fallback.
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
