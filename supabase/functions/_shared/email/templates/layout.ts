// Wrapper HTML partilhado por todos os templates de email — extrai o
// boilerplate (<!DOCTYPE>, largura máxima, cabeçalho escuro) que hoje está
// duplicado em cada Edge Function.
export function emailLayout(opts: { titulo: string; corpo: string; rodape?: string }): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #1a1a2e; padding: 24px; border-radius: 10px; text-align: center; margin-bottom: 20px;">
    <h1 style="color: #fff; margin: 0; font-size: 22px;">${opts.titulo}</h1>
  </div>
  <div style="background: #f9f9f9; padding: 24px; border-radius: 10px;">
    ${opts.corpo}
  </div>
  <p style="color: #666; font-size: 12px; text-align: center; margin-top: 20px;">
    ${opts.rodape ?? 'Email automático gerado pelo sistema WeGest.'}
  </p>
</body>
</html>`;
}
