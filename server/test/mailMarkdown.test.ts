import assert from 'node:assert/strict';
import * as nodeTest from 'node:test';
import { renderMailMarkdown } from '../src/services/mailMarkdown';

const { test } = nodeTest;

test('plain text becomes escaped paragraphs with line breaks', () => {
  const html = renderMailMarkdown('今天完成登录模块\n明天继续调试');
  assert.equal(html, '今天完成登录模块<br>明天继续调试');
});

test('bold italic and inline code are rendered', () => {
  assert.equal(
    renderMailMarkdown('完成 **登录模块** 与 *鉴权* 和 `token` 逻辑'),
    '完成 <strong>登录模块</strong> 与 <em>鉴权</em> 和 <code>token</code> 逻辑',
  );
});

test('dash lists are grouped into ul', () => {
  const html = renderMailMarkdown('- 第一项\n- 第二项\n后续文本');
  assert.equal(html, '<ul><li>第一项</li><li>第二项</li></ul><br>后续文本');
});

test('fenced code blocks escape content and wrap in pre', () => {
  const html = renderMailMarkdown('结果如下\n```\n<b>raw</b>\n```\n完毕');
  assert.equal(html, '结果如下<br><pre>&lt;b&gt;raw&lt;/b&gt;</pre><br>完毕');
});

test('raw html in user input never reaches the output as markup', () => {
  const html = renderMailMarkdown('<script>alert(1)</script> & **ok**');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('<strong>ok</strong>'));
});

test('event handler attributes are stripped from links', () => {
  const html = renderMailMarkdown('[点我](https://example.com)看详情');
  assert.ok(html.includes('href="https://example.com"'));
  assert.ok(!html.toLowerCase().includes('onerror'));
  assert.ok(!html.toLowerCase().includes('javascript:'));
});

test('javascript urls are not linked', () => {
  const html = renderMailMarkdown('[x](javascript:alert(1))');
  assert.ok(!html.includes('href="javascript:'));
});

test('empty and undefined values fall back to 无', () => {
  assert.equal(renderMailMarkdown(null), '无');
  assert.equal(renderMailMarkdown(''), '无');
  assert.equal(renderMailMarkdown('无'), '无');
});