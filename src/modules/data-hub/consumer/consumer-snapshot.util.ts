// Fields kept in every consumer history row, in a fixed order so equality checks are stable.
export interface ConsumerSnapshot {
  code: string;
  name: string;
  category: string;
  division_id: number;
  department_id: number | null;
  short_description: string;
  status: string;
  // Sorted ascending so the same set in any order compares equal.
  business_contact_user_ids: number[];
}

const nullableId = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export function buildConsumerSnapshot(src: {
  code: string;
  name: string;
  category: string;
  division_id: number | string;
  department_id?: number | string | null;
  short_description: string;
  status: string;
  business_contact_user_ids: Array<number | string>;
}): ConsumerSnapshot {
  return {
    code: src.code,
    name: src.name,
    category: src.category,
    division_id: Number(src.division_id),
    department_id: nullableId(src.department_id),
    short_description: src.short_description,
    status: src.status,
    business_contact_user_ids: src.business_contact_user_ids.map(Number).sort((a, b) => a - b),
  };
}

export const snapshotsEqual = (a: ConsumerSnapshot, b: ConsumerSnapshot): boolean =>
  JSON.stringify(a) === JSON.stringify(b);
