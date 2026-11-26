/**
 * Security settings. Admins only.
 *   PATCH { notify_email, smtp_user, smtp_password, notify_logins, hotel_ips, workers_only_from_hotel }
 *         smtp_password empty = keep the saved one; hotel_ips one address per line
 *   POST  sends a test email to notify_email
 */
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { withErrorHandling, UserError } from "@/lib/errors";
import { sendOwnerEmail } from "@/lib/notify";
import { parseIpList } from "@/lib/network";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV6 = /^[0-9a-f:]+$/i;

// Save the email alert settings and the hotel network rule
export const PATCH = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser(true);
  if (user instanceof NextResponse) return user;

  const body = await request.json();
  const notifyEmail = String(body.notify_email ?? "").trim();
  const smtpUser = String(body.smtp_user ?? "").trim();
  // Google shows app passwords in groups of four ("abcd efgh ..."): spaces don't count
  const smtpPassword = String(body.smtp_password ?? "").replace(/\s+/g, "");

  if (notifyEmail && !EMAIL.test(notifyEmail)) throw new UserError("Email-i për njoftime nuk është i saktë.");
  if (smtpUser && !EMAIL.test(smtpUser)) throw new UserError("Adresa Gmail dërguese nuk është e saktë.");

  const ips = parseIpList(String(body.hotel_ips ?? ""));
  for (const ip of ips) {
    const v4 = IPV4.exec(ip);
    if (!(v4 && v4.slice(1).every((part) => Number(part) <= 255)) && !(ip.includes(":") && IPV6.test(ip))) {
      throw new UserError(`"${ip}" nuk është adresë IP e saktë.`);
    }
  }

  // Turning the rule on with no hotel address would lock every worker out
  const onlyHotel = Boolean(body.workers_only_from_hotel);
  if (onlyHotel && ips.length === 0) {
    throw new UserError("Shtoni më parë IP-në e hotelit.");
  }

  await query(
    `update settings
        set notify_email = $1, smtp_user = $2,
            smtp_password = case when $3 = '' then smtp_password else $3 end,
            notify_logins = $4, hotel_ips = $5, workers_only_from_hotel = $6
      where id = 1`,
    [notifyEmail, smtpUser, smtpPassword, Boolean(body.notify_logins), ips.join("\n"), onlyHotel]
  );
  return NextResponse.json({ ok: true });
});

// Send a test email with the saved settings
export const POST = withErrorHandling(async () => {
  const user = await requireApiUser(true);
  if (user instanceof NextResponse) return user;

  try {
    await sendOwnerEmail("Provë: njoftimet e sistemit", "Email-i i njoftimeve funksionon.");
  } catch (error) {
    const text = (error as Error).message;
    if (/Invalid login|Username and Password not accepted|535/i.test(text)) {
      throw new UserError("Gmail nuk e pranoi adresën ose fjalëkalimin e aplikacionit.");
    }
    throw new UserError(`Email-i nuk u dërgua: ${text}`);
  }
  return NextResponse.json({ ok: true });
});
