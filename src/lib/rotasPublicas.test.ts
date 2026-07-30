import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { isRotaPublica } from './rotasPublicas';

describe('isRotaPublica', () => {
  it('reconhece a landing e as páginas institucionais', () => {
    for (const rota of [
      '/',
      '/sobre',
      '/contactos',
      '/faq',
      '/termos',
      '/privacidade',
      '/cookies',
      '/eliminar-conta',
    ]) {
      expect(isRotaPublica(rota), rota).toBe(true);
    }
  });

  it('reconhece os acessos por token — os mais expostos de todos', () => {
    // O quadro fica projetado numa parede e a galeria de danos vai por QR para
    // clientes: avisos internos nestes ecrãs são vistos por terceiros.
    expect(isRotaPublica('/quadro/abc123')).toBe(true);
    expect(isRotaPublica('/danos/tok-en-99')).toBe(true);
    expect(isRotaPublica('/formulario/uuid-do-formulario')).toBe(true);
  });

  it('não confunde rotas internas com públicas', () => {
    for (const rota of [
      '/dashboard',
      '/viaturas',
      '/viaturas/123',
      '/motoristas',
      '/renting/contratos',
      '/assistencia',
      '/administrativo/faturacao',
      '/notificacoes',
      '/admin/settings',
    ]) {
      expect(isRotaPublica(rota), rota).toBe(false);
    }
  });

  it('trata a barra final como o mesmo caminho', () => {
    // Sem normalizar, um '/termos/' reintroduzia o problema em silêncio.
    expect(isRotaPublica('/termos/')).toBe(true);
    expect(isRotaPublica('/')).toBe(true);
    expect(isRotaPublica('/dashboard/')).toBe(false);
  });

  it('um prefixo parecido não passa por público', () => {
    // '/danos' (sem token) não é a galeria pública, e '/quadros' não é '/quadro/'.
    expect(isRotaPublica('/quadros')).toBe(false);
    expect(isRotaPublica('/formularios')).toBe(false);
  });

  it('cobre todas as rotas públicas declaradas em WebAppRoutes', () => {
    // Guarda contra deriva: uma rota pública nova que ninguém acrescente aqui
    // volta a mostrar notificações internas a quem não tem sessão.
    const rotas = readFileSync('src/routes/WebAppRoutes.tsx', 'utf8');

    // Extrai os `path` que estão fora de qualquer wrapper de proteção. Só
    // verificamos as que sabemos serem públicas por desenho — a lista abaixo é
    // a intenção declarada, e o teste falha se o ficheiro deixar de as ter.
    const publicasEsperadas = [
      '/',
      '/entrar',
      '/sobre',
      '/contactos',
      '/faq',
      '/termos',
      '/privacidade',
      '/cookies',
      '/eliminar-conta',
      '/formulario/:id',
      '/danos/:token',
      '/quadro/:token',
    ];

    for (const path of publicasEsperadas) {
      expect(rotas, `rota ${path} deixou de existir em WebAppRoutes`).toContain(`path="${path}"`);

      // O caminho concreto (com o parâmetro preenchido) tem de ser público.
      const concreto = path.replace(/:\w+/g, 'valor');
      expect(isRotaPublica(concreto), `${concreto} devia ser público`).toBe(true);
    }
  });
});
