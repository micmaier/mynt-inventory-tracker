import { Resend } from "resend";

export function getResendClient() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY missing");
  }
  return new Resend(process.env.RESEND_API_KEY);
}

export function getEmailConfig() {
  const from = process.env.RESEND_FROM;
  const to = process.env.INVENTORY_ALERT_TO;
  const appUrl = process.env.INVENTORY_APP_URL;

  if (!from) throw new Error("RESEND_FROM missing");
  if (!to) throw new Error("INVENTORY_ALERT_TO missing");
  if (!appUrl) throw new Error("INVENTORY_APP_URL missing");

  return { from, to, appUrl };
}
