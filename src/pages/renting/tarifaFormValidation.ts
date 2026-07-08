export interface TarifaFormValidationInput {
  grupo_id: string;
  nome: string;
  preco_dia: string;
  para_tvde: boolean;
  precosModelo: Record<string, string>;
}

export interface TarifaFormValidationError {
  title: string;
  description?: string;
}

export function getTarifaFormValidationError(input: TarifaFormValidationInput): TarifaFormValidationError | null {
  if (!input.nome.trim()) {
    return { title: 'Nome é obrigatório' };
  }

  if (!input.para_tvde) {
    if (!input.grupo_id) {
      return { title: 'Selecione um grupo' };
    }

    if (!input.preco_dia.trim()) {
      return { title: 'Preço/dia é obrigatório' };
    }
  }

  if (input.para_tvde) {
    const temAlgum = Object.values(input.precosModelo).some(
      (v) => v.trim() !== '' && !Number.isNaN(parseFloat(v))
    );
    if (!temAlgum) {
      return {
        title: 'Tarifa TVDE sem preços',
        description: 'Defina o preço semanal de pelo menos um modelo na aba "Preço por modelo".',
      };
    }
  }

  return null;
}
