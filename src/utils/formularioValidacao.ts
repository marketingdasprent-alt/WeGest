import { validarTelefone } from '@/lib/pt-validators';
import type { FormField } from '@/components/formularios/DynamicFieldEditor';

/** Erros dos campos de um passo do formulário público, por id do campo. */
export function errosDosCampos(
  campos: FormField[],
  dados: Record<string, unknown>
): Record<string, string> {
  const erros: Record<string, string> = {};

  for (const campo of campos) {
    const valor = dados[campo.id];
    if (campo.required && (!valor || valor === '')) {
      erros[campo.id] = `${campo.label} é obrigatório`;
      continue;
    }
    // Um telefone partido chega ao CRM sem forma de ligar ao contacto.
    if ((campo.type === 'tel' || campo.type === 'phone') && valor) {
      const { valid, message } = validarTelefone(String(valor));
      if (!valid) erros[campo.id] = message ?? 'Número de telefone inválido';
    }
  }

  return erros;
}
