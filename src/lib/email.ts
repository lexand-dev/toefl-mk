import { Resend } from "resend";

export type TransactionalEmail = (message: {
  to: string;
  subject: string;
  url: string;
}) => Promise<void>;

export const sendTransactionalEmail: TransactionalEmail = async ({ to, subject, url }) => {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!key || !from) throw new Error("RESEND_API_KEY and RESEND_FROM are required to send mail");

  const { error } = await new Resend(key).emails.send({
    from,
    to,
    subject,
    text: `Open this link to continue: ${url}`,
  });
  if (error) throw new Error(`Email delivery failed: ${error.message}`);
};
