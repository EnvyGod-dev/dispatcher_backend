import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    const config: EmailConfig = {
      host: process.env.SMTP_HOST || 'smtp.mail.mn',
      port: parseInt(process.env.SMTP_PORT || '465'),
      secure: process.env.SMTP_PORT === '465', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER || 'info@stratum.mn',
        pass: process.env.SMTP_PASSWORD || '4)d9tNi3tcAu',
      },
    };

    this.transporter = nodemailer.createTransport(config);
  }

  async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      console.log('✅ Email service connected successfully');
      return true;
    } catch (error) {
      console.error('❌ Email service connection failed:', error);
      return false;
    }
  }

  async sendWelcomeEmail(
    firstName: string,
    lastName: string,
    userEmail: string,
    username: string,
    temporaryPassword: string
  ): Promise<boolean> {
    try {
      console.log({
        firstName,
        lastName,
        userEmail,
        username,
        temporaryPassword,
      });

      const htmlContent = renderEmailTemplate('/src/libs/mail.html', {
        firstName,
        lastName,
        username,
        password: temporaryPassword,
        loginUrl: 'http://stratum.mn/signin',
      });

      const result = await this.transporter.sendMail({
        from: `${process.env.SMTP_FROM_NAME || 'Stratum'} <${process.env.SMTP_FROM_EMAIL || 'info@stratum.mn'
          }>`,
        to: userEmail,
        subject: 'Welcome to Stratum - Танд бүртгэл үүслээ',
        html: htmlContent,
      });

      return true;
    } catch (error) {
      console.error('❌ Email send failed:', error);
      return false;
    }
  }
}

export const initializeEmailService = async () => {
  const connected = await emailService.verifyConnection();
  if (!connected) {
    console.warn('⚠️ Email service failed to connect. Check SMTP settings.');
  }
};

export const renderEmailTemplate = (
  templateFileName: string,
  data: {
    firstName: string;
    lastName: string;
    username: string;
    password: string;
    loginUrl: string;
  }
) => {
  try {
    const templatePath = path.join(process.cwd(), templateFileName);

    let html = fs.readFileSync(templatePath, 'utf-8');

    html = html.replace(/{{firstName}}/g, data.firstName);
    html = html.replace(/{{lastName}}/g, data.lastName);
    html = html.replace(/{{email}}/g, data.username);
    html = html.replace(/{{password}}/g, data.password);
    html = html.replace(/{{loginUrl}}/g, data.loginUrl);

    console.log(`✅ Template rendered successfully`);
    return html;
  } catch (error) {
    console.error('Error reading email template:', error);
    throw new Error('Failed to render email template');
  }
};

export const emailService = new EmailService();
