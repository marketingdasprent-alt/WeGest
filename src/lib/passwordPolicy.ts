// Política de palavra-passe partilhada pela app (registo de motorista e
// definição/redefinição em /reset-password). Manter num só sítio evita
// que um ponto de entrada aceite passwords mais fracas do que outro.

export interface PasswordChecks {
  minLength: boolean;
  hasLetter: boolean;
  hasNumber: boolean;
}

/** Requisitos individuais (para mostrar indicadores no formulário). */
export function passwordChecks(pwd: string): PasswordChecks {
  return {
    minLength: pwd.length >= 8,
    hasLetter: /[a-zA-Z]/.test(pwd),
    hasNumber: /[0-9]/.test(pwd),
  };
}

/** true se cumpre todos os requisitos (mínimo 8, com letra e número). */
export function isPasswordStrong(pwd: string): boolean {
  return Object.values(passwordChecks(pwd)).every(Boolean);
}

export const PASSWORD_POLICY_MESSAGE =
  'A palavra-passe não cumpre os requisitos: mínimo 8 caracteres, com letras e números.';

/** Itens para renderizar a checklist de requisitos, por ordem. */
export const PASSWORD_REQUIREMENTS: { key: keyof PasswordChecks; label: string }[] = [
  { key: 'minLength', label: 'Mínimo 8 caracteres' },
  { key: 'hasLetter', label: 'Pelo menos uma letra' },
  { key: 'hasNumber', label: 'Pelo menos um número (0-9)' },
];
