// Fields kept in every consumer history row, in a fixed order so equality checks are stable.
export interface ConsumerSnapshot {
  code: string;
  name: string;
  category: string;
  owner_unit_id: number | null;
  system_id: number | null;
  system_service: string | null;
  short_description: string;
  avatar_url: string | null;
  status: string;
  // Sorted ascending so the same set in any order compares equal.
  so_app_user_ids: number[];
}

export function buildConsumerSnapshot(src: {
  code: string;
  name: string;
  category: string;
  owner_unit_id?: number | string | null;
  system_id?: number | string | null;
  system_service?: string | null;
  short_description: string;
  avatar_url?: string | null;
  status: string;
  so_app_user_ids: Array<number | string>;
}): ConsumerSnapshot {
  return {
    code: src.code,
    name: src.name,
    category: src.category,
    owner_unit_id: src.owner_unit_id ? Number(src.owner_unit_id) : null,
    system_id: src.system_id ? Number(src.system_id) : null,
    // An empty string means no service, like null.
    system_service: src.system_service ? src.system_service : null,
    short_description: src.short_description,
    // An empty string clears the avatar like null does.
    avatar_url: src.avatar_url ? src.avatar_url : null,
    status: src.status,
    so_app_user_ids: src.so_app_user_ids.map(Number).sort((a, b) => a - b),
  };
}

export const snapshotsEqual = (a: ConsumerSnapshot, b: ConsumerSnapshot): boolean =>
  JSON.stringify(a) === JSON.stringify(b);
