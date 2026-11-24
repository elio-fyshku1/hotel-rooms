/**
 * Row types for the admin page.
 */
export interface AdminRoom {
  id: number;
  number: string;
  floor: number | null;
  active: boolean;
  card_count: number;
}

export interface AdminCard {
  id: number;
  code: string;
  label: string;
  active: boolean;
  room_id: number;
  room: string;
}

export interface AdminUser {
  id: number;
  username: string;
  full_name: string;
  role: "admin" | "worker";
  active: boolean;
}

/**
 * Runs a change against the API, shows the result message and reloads the
 * page data. Returns true on success. Provided by AdminPanel to each section.
 */
export type RunChange = (change: () => Promise<unknown>, successMessage: string) => Promise<boolean>;
