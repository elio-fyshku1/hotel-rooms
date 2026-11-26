/**
 * Hotel network: workers may use the app only from the hotel's internet
 * line (its public IP addresses, saved in Administrimi), admins from anywhere.
 *
 * On the server the app is reachable only through Caddy, which puts the
 * visitor's real address in X-Forwarded-For. The last entry is the one Caddy
 * added, so a value sent by the visitor can't pass for the hotel's address.
 */
import { headers } from "next/headers";
import { query } from "./db";

/** The visitor's IP address ("" when unknown, e.g. without a proxy). */
export async function clientIp(): Promise<string> {
  const list = (await headers()).get("x-forwarded-for") ?? "";
  const last = list.split(",").pop()?.trim() ?? "";
  return last.replace(/^::ffff:/, ""); // IPv4 written as IPv6
}

/** "80.90.92.91\n..." -> ["80.90.92.91", ...] */
export function parseIpList(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((ip) => ip.trim())
    .filter(Boolean);
}

export interface HotelRule {
  on: boolean;        // workers only from the hotel
  ips: string[];      // the hotel's addresses
}

/** The rule and the hotel's addresses from the settings row. */
export async function getHotelRule(): Promise<HotelRule> {
  const rows = await query<{ on: boolean; ips: string }>(
    "select workers_only_from_hotel as on, hotel_ips as ips from settings where id = 1"
  );
  return { on: rows[0].on, ips: parseIpList(rows[0].ips) };
}

/** True when the address belongs to the hotel. */
export function isHotelIp(ip: string, rule: HotelRule): boolean {
  return ip !== "" && rule.ips.includes(ip);
}
