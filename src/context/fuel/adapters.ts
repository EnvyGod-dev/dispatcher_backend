import { r2Storage } from '$/libs/storage/r2-storage';
import nodemailer, { type Transporter } from 'nodemailer';

export const uploadFile = async (key: string, body: Buffer, contentType: string): Promise<string> => {
  const bucket = r2Storage.storage.from('fuel');
  const { error } = await bucket.upload(key, body, { contentType });

  if (error) {
    throw error;
  }

  return bucket.getPublicUrl(key).data.publicUrl;
};

export const isOwnStorageUrl = (url: string): boolean => {
  const base = process.env.CLOUDFLARE_R2_PUBLIC_URL;
  return !!base && url.startsWith(base);
};

export const downloadFile = async (url: string): Promise<Buffer> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Файл татахад алдаа гарлаа (${res.status}): ${url}`);
  }
  return Buffer.from(await res.arrayBuffer());
};

let transporter: Transporter | null = null;

const getTransporter = () => {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT ?? 465);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? 'smtp.mail.mn',
      port,
      secure: port === 465,
      auth: {
        user: process.env.SMTP_USER ?? '',
        pass: process.env.SMTP_PASSWORD ?? '',
      },
    });
  }
  return transporter;
};

export type MailAttachment = { filename: string; content: Buffer; contentType?: string };

export const sendMail = async (input: {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  attachments?: MailAttachment[];
}) => {
  const fromName = process.env.SMTP_FROM_NAME ?? 'Stratum';
  const fromEmail = process.env.SMTP_FROM_EMAIL ?? process.env.SMTP_USER ?? '';

  await getTransporter().sendMail({
    from: `${fromName} <${fromEmail}>`,
    to: input.to,
    cc: input.cc && input.cc.length > 0 ? input.cc : undefined,
    subject: input.subject,
    html: input.html,
    attachments: input.attachments,
  });
};

export const isTelegramEnabled = () => !!process.env.TELEGRAM_BOT_TOKEN;

export const sendTelegram = async (chatId: string, text: string) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return;
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });

  if (!res.ok) {
    throw new Error(`Telegram алдаа (${res.status}): ${await res.text()}`);
  }
};

export const escapeHtml = (value: string | null | undefined) =>
  (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');