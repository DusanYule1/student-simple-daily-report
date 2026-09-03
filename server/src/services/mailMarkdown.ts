// 安全邮件 Markdown 渲染器（零依赖）。
// 策略：先整体 HTML 转义，再基于纯文本做有限 markdown 变换——
// 用户输入中的原始 HTML 永远以字面形式出现，不存在注入面。

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

type InlineToken =
  | { kind: 'text'; value: string }
  | { kind: 'link'; href: string; label: string };

// 行内解析：`code`、**bold**、*italic*、[label](http(s)://url)。
// 链接只接受 http/https；转义后的文本不含原始引号歧义（引号已是实体）。
const parseInline = (text: string): InlineToken[] => {
  const pattern =
    /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  const tokens: InlineToken[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      tokens.push({ kind: 'text', value: text.slice(cursor, match.index) });
    }
    if (match[1] !== undefined) {
      tokens.push({ kind: 'text', value: `<code>${match[1]}</code>` });
    } else if (match[2] !== undefined) {
      tokens.push({ kind: 'text', value: `<strong>${match[2]}</strong>` });
    } else if (match[3] !== undefined) {
      tokens.push({ kind: 'text', value: `<em>${match[3]}</em>` });
    } else if (match[4] !== undefined && match[5]) {
      tokens.push({
        kind: 'link',
        href: match[5],
        label: match[4],
      });
    }
    cursor = pattern.lastIndex;
  }
  if (cursor < text.length) {
    tokens.push({ kind: 'text', value: text.slice(cursor) });
  }
  return tokens;
};

const renderInline = (text: string): string => {
  // 输入已整体转义；匹配器在转义后的实体文本上工作。
  // 链接的 URL 与标签均来自转义文本，href 需再校验协议白名单。
  return parseInline(text)
    .map((token) => {
      if (token.kind === 'text') return token.value;
      const href = token.href;
      if (!/^https?:\/\//i.test(href)) return token.label;
      return `<a href="${href}" rel="noopener noreferrer">${token.label}</a>`;
    })
    .join('');
};

// 把转义后的多行文本拆成"行块"：普通段落行、- 列表行、``` 围栏代码块。
const renderBlockLines = (lines: string[]): string => {
  const parts: string[] = [];
  let listBuffer: string[] = [];
  let codeBuffer: string[] | null = null;

  const flushList = () => {
    if (listBuffer.length) {
      parts.push(`<ul>${listBuffer.map((item) => `<li>${item}</li>`).join('')}</ul>`);
      listBuffer = [];
    }
  };

  for (const line of lines) {
    if (codeBuffer !== null) {
      if (/^```/.test(line)) {
        parts.push(`<pre>${codeBuffer.join('<br>')}</pre>`);
        codeBuffer = null;
      } else {
        codeBuffer.push(line);
      }
      continue;
    }
    if (/^```/.test(line)) {
      flushList();
      codeBuffer = [];
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      listBuffer.push(renderInline(line.replace(/^[-*]\s+/, '')));
      continue;
    }
    flushList();
    parts.push(renderInline(line));
  }
  if (codeBuffer !== null) {
    parts.push(`<pre>${codeBuffer.join('<br>')}</pre>`);
  }
  flushList();
  return parts.join('<br>');
};

export const renderMailMarkdown = (value: unknown): string => {
  const raw = typeof value === 'string' ? value : '';
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '无') return '无';
  const escaped = escapeHtml(trimmed);
  const lines = escaped.split(/\r?\n/);
  return renderBlockLines(lines);
};