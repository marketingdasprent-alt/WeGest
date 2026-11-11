/**
 * `mariasilva@gmail.com` → `ma********@gmail.com`. Mostra ao motorista com que
 * e-mail já tem conta sem expor o endereço inteiro a quem só sabe o e-mail da ficha.
 */
export function mascararEmail(email: string): string {
  const [local, dominio] = email.trim().split('@');
  if (!local || !dominio) return '***';
  const visiveis = local.length <= 2 ? 1 : 2;
  return `${local.slice(0, visiveis)}${'*'.repeat(Math.max(local.length - visiveis, 3))}@${dominio}`;
}
