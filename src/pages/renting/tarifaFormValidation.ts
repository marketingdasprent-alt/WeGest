export interface PrecoModeloForm {
  // TVDE
  preco_semana: string;
  km_mensal: string;
  km_adicional_valor: string;
  franquia_valor: string;
  caucao_valor: string;
  // Rent-a-Car (independentes do TVDE — não partilham campos)
  preco_dia: string;
  preco_mes: string;
  km_mensal_iva: string;
  km_adicional_valor_iva: string;
  franquia_valor_iva: string;
  caucao_valor_iva: string;
}

export interface TarifaFormValidationInput {
  grupo_id: string;
  nome: string;
  preco_dia: string;
  para_tvde: boolean;
  precosModelo: Record<string, PrecoModeloForm>;
}

export interface TarifaFormValidationError {
  title: string;
  description?: string;
}

function temPreco(valor: string): boolean {
  return valor.trim() !== '' && !Number.isNaN(parseFloat(valor));
}

export function getTarifaFormValidationError(
  input: TarifaFormValidationInput
): TarifaFormValidationError | null {
  if (!input.nome.trim()) {
    return { title: 'Nome é obrigatório' };
  }

  // Ambos os regimes definem o preço por modelo na aba "Modelos":
  //   TVDE       → exige preço/semana em pelo menos um modelo
  //   Rent-a-Car → exige diária (preco_dia) em pelo menos um modelo
  if (input.para_tvde) {
    const temAlgum = Object.values(input.precosModelo).some((v) => temPreco(v.preco_semana));
    if (!temAlgum) {
      return {
        title: 'Tarifa TVDE sem preços',
        description: 'Defina o preço semanal de pelo menos um modelo na aba "Modelos".',
      };
    }
  } else {
    const temAlgum = Object.values(input.precosModelo).some((v) => temPreco(v.preco_dia));
    if (!temAlgum) {
      return {
        title: 'Tarifa Rent-a-Car sem preços',
        description: 'Defina a diária de pelo menos um modelo na aba "Modelos".',
      };
    }
  }

  return null;
}
