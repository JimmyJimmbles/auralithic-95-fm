import { createTransport } from 'nodemailer';
import { config } from '../config.js';

export type Mailer = {
  sendLoginCode: (email: string, code: string) => Promise<void>;
};

export const createMailer = (): Mailer => {
  if (config.mail.mode === 'off') {
    return {
      sendLoginCode: async () => {
        throw new Error('Mail is off');
      },
    };
  }
  if (config.mail.mode === 'log') {
    return {
      sendLoginCode: async (email, code) => {
        console.info(`admin login code for ${email}: ${code}`);
      },
    };
  }
  const smtp = config.mail;
  const transport = createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: { user: smtp.user, pass: smtp.pass },
  });
  return {
    sendLoginCode: async (email, code) => {
      await transport.sendMail({
        from: smtp.from,
        to: email,
        subject: 'Your Auralithic admin code',
        text: `Your Auralithic login code is ${code}. It expires in 10 minutes.`,
      });
    },
  };
};
