/**
 * Printable barcode labels for the key cards. Admins only.
 *   /admin/labels           all active cards
 *   /admin/labels?card=12   one card (e.g. a replacement)
 */
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import LabelSheet from "@/components/admin/LabelSheet";

export const dynamic = "force-dynamic";

interface LabelsPageProps {
  searchParams: Promise<{ card?: string }>;
}

/** Loads the active cards (or the one requested) and renders the label sheet. */
export default async function LabelsPage({ searchParams }: LabelsPageProps) {
  await requireUser(true);
  const { card } = await searchParams;

  const labels = await query<{ id: number; code: string; room: string; label: string }>(
    `select k.id, k.code, r.number as room, k.label
       from key_cards k
       join rooms r on r.id = k.room_id
      where k.active and r.active
        and ($1::int is null or k.id = $1)
      order by nullif(regexp_replace(r.number, '\\D', '', 'g'), '')::bigint nulls last, r.number, k.id`,
    [card ? Number(card) : null]
  );

  return <LabelSheet labels={labels} />;
}
