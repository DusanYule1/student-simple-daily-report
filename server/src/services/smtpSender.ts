import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import nodemailer from 'nodemailer';
import { isLocalMode, localDbPath } from '../local/bootstrap';

export const SMTP_ENV_KEYS = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM',
] as const;

export type MailChannel = 'resend' | 'smtp' | 'local-preview' | 'none';

export const resolveMailChannel = (): MailChannel => {
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.SMTP_HOST && process.env.SMTP_USER) return 'smtp';
  if (isLocalMode()) return 'local-preview';
  return 'none';
};

export type TransportOptions = {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string | undefined };
};

export const buildTransportOptions = (): TransportOptions => {
  const host = process.env.SMTP_HOST as string;
  const user = process.env.SMTP_USER as string;
  const port = Number(process.env.SMTP_PORT || 465);
  // QQ mail (and most providers) use implicit TLS on 465; STARTTLS on 587.
  const secure = process.env.SMTP_SECURE !== undefined
    ? process.env.SMTP_SECURE === 'true'
    : port === 465;
  return { host, port, secure, auth: { user, pass: process.env.SMTP_PASS } };
};

export const resolveSmtpFrom = (): string =>
  process.env.SMTP_FROM || (process.env.SMTP_USER as string);

export const previewDir = (): string => `${localDbPath()}.mail`;

const writeLocalMailPreview = (
  reportDate: string,
  recipients: string[],
  subject: string,
  html: string,
): void => {
  const file = join(previewDir(), `${reportDate}.html`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `<!-- ${subject} | 收件人(${recipients.length}): ${recipients.join(', ')} -->\n${html}`);
  console.log(`[local-mail] 邮件预览已写入 ${file}`);
};

export const sendViaSmtp = async (
  recipients: string[],
  subject: string,
  html: string,
): Promise<void> => {
  const options = buildTransportOptions();
  if (!options.auth.pass) {
    throw new Error('SMTP_PASS 未配置（QQ 邮箱请在设置→账户中生成授权码）');
  }
  const transporter = nodemailer.createTransport({
    host: options.host,
    port: options.port,
    secure: options.secure,
    auth: options.auth,
  });
  const from = resolveSmtpFrom();
  for (const recipient of recipients) {
    await transporter.sendMail({ from, to: recipient, subject, html });
  }
};

export const writeMailPreview = writeLocalMailPreview;