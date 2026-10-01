import { describe, expect, it } from 'vitest';

import { escapeHtml, sanitizeRichHtml, serializeForInlineScript } from '@/lib/safeHtml';

describe('safeHtml', () => {
  it('remove scripts, handlers e URLs javascript mantendo formatação segura', () => {
    const html = sanitizeRichHtml(
      '<p onclick="alert(1)"><strong>Olá</strong><img src=x onerror=alert(1)><a href="javascript:alert(1)">link</a><script>alert(1)</script></p>'
    );

    expect(html).toContain('<strong>Olá</strong>');
    expect(html).not.toMatch(/script|onclick|onerror|javascript:/i);
  });

  it('escapa texto para interpolação em documentos HTML', () => {
    expect(escapeHtml('<img src=x onerror="x"> & Ana')).toBe(
      '&lt;img src=x onerror=&quot;x&quot;&gt; &amp; Ana'
    );
  });

  it('serializa dados sem permitir fechar um script inline', () => {
    const serialized = serializeForInlineScript(['</script><script>alert(1)</script>']);
    expect(serialized).not.toContain('</script>');
    expect(serialized).toContain('\\u003c/script\\u003e');
  });
});
