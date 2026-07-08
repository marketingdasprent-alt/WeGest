interface PessoaNomeEmail {
  nome: string;
  email: string | null;
}

interface CondutorContrato {
  cliente: PessoaNomeEmail | null;
  motorista: PessoaNomeEmail | null;
}

interface ResolverCondutorArgs {
  condutorContrato: CondutorContrato | null;
  motoristaViaturaAtivo: PessoaNomeEmail | null;
}

interface CondutorResolvido {
  nome: string;
  email: string;
}

/**
 * Prioridade: cliente do contrato_condutores > motorista do contrato >
 * motorista ATIVO associado à viatura (fallback só quando o contrato não
 * define condutor nenhum). Nunca mistura as duas — se o contrato já tem
 * condutor, o fallback da viatura nunca é considerado.
 */
export function resolverCondutor(args: ResolverCondutorArgs): CondutorResolvido {
  const { condutorContrato, motoristaViaturaAtivo } = args;

  if (condutorContrato?.cliente) {
    return { nome: condutorContrato.cliente.nome, email: condutorContrato.cliente.email ?? '' };
  }
  if (condutorContrato?.motorista) {
    return { nome: condutorContrato.motorista.nome, email: condutorContrato.motorista.email ?? '' };
  }
  if (motoristaViaturaAtivo) {
    return { nome: motoristaViaturaAtivo.nome, email: motoristaViaturaAtivo.email ?? '' };
  }
  return { nome: '', email: '' };
}
