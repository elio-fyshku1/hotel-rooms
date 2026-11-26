/**
 * Login history and email alerts to the owner (workers logging in and out,
 * blocked logins from outside the hotel).
 *
 * Mail goes out through Gmail's SMTP server (or SMTP_HOST/SMTP_PORT from .env)
 * with the account and app password saved in Administrimi. Sending never blocks or breaks a login: alerts are
 * sent in the background and a failure is only written to the server log.
 */
import nodemailer from "nodemailer";
import { query } from "./db";

/** Mail settings from the settings row (server side only: holds the password). */
interface MailSettings {
  hotel_name: string;
  timezone: string;
  notify_email: string;
  smtp_user: string;
  smtp_password: string;
  notify_logins: boolean;
}

/** Reads the mail settings fresh each time, so changes in Administrimi apply at once. */
async function getMailSettings(): Promise<MailSettings> {
  const rows = await query<MailSettings>(
    `select hotel_name, timezone, notify_email, smtp_user, smtp_password, notify_logins
       from settings where id = 1`
  );
  return rows[0];
}

/**
 * Sends one email to the owner. Throws when mail is not set up or Gmail
 * refuses (used as is by the "send test email" button).
 */
export async function sendOwnerEmail(subject: string, text: string): Promise<void> {
  const mail = await getMailSettings();
  if (!mail.notify_email || !mail.smtp_user || !mail.smtp_password) {
    throw new Error("Email-i nuk është konfiguruar.");
  }

  // Gmail by default; SMTP_HOST / SMTP_PORT in .env point it at another mail server
  const port = Number(process.env.SMTP_PORT || 465);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure: port === 465, // 465 = TLS from the start, 587/25 = STARTTLS or plain
    auth: { user: mail.smtp_user, pass: mail.smtp_password },
  });
  await transport.sendMail({
    from: `"${mail.hotel_name}" <${mail.smtp_user}>`,
    to: mail.notify_email,
    subject,
    text,
  });
}

/** "26.11.2026, 20:45" in the hotel's timezone. */
function hotelTime(timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("day")}.${part("month")}.${part("year")}, ${part("hour")}:${part("minute")}`;
}

/** One row of the login history (see login_log in schema.sql). */
export async function logLogin(entry: {
  username: string;
  userId: number | null;
  result: "ok" | "logout" | "wrong_password" | "outside_hotel";
  ip: string;
  userAgent: string;
  fromHotel: boolean;
}): Promise<void> {
  await query(
    `insert into login_log (username, user_id, result, ip, user_agent, from_hotel)
     values ($1, $2, $3, $4, $5, $6)`,
    [entry.username, entry.userId, entry.result, entry.ip, entry.userAgent, entry.fromHotel]
  );
}

export interface LoginAlert {
  name: string;                          // full name or username
  kind: "login" | "logout" | "blocked";  // blocked = tried from outside the hotel
  ip: string;
  userAgent: string;
  fromHotel: boolean;
}

// Subject and first line of each alert
const ALERT_TEXT = {
  login: { subject: "Hyrje", line: "hyri në sistem." },
  logout: { subject: "Dalje", line: "doli nga sistemi." },
  blocked: { subject: "⚠ Hyrje e bllokuar", line: "provoi të hyjë jashtë internetit të hotelit. Hyrja u bllokua." },
};

/**
 * Emails the owner when a worker logs in or out (if login alerts are on), or
 * is refused outside the hotel (always, when mail is set up).
 * Runs in the background: the login does not wait for it.
 */
export function alertLogin(alert: LoginAlert): void {
  void (async () => {
    const mail = await getMailSettings();
    if (!mail.notify_email || !mail.smtp_user || !mail.smtp_password) return;
    if (alert.kind !== "blocked" && !mail.notify_logins) return;

    const time = hotelTime(mail.timezone);
    const text = ALERT_TEXT[alert.kind];
    const body = [
      `${alert.name} ${text.line}`,
      "",
      `Ora:        ${time}`,
      `IP:         ${alert.ip || "-"} (${alert.fromHotel ? "interneti i hotelit" : "jashtë hotelit"})`,
      `Shfletuesi: ${alert.userAgent || "-"}`,
      "",
      mail.hotel_name,
    ].join("\n");

    await sendOwnerEmail(`${text.subject}: ${alert.name}, ${time}`, body);
  })().catch((error) => console.error("Login email failed:", error));
}
