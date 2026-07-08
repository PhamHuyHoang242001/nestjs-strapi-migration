// Explicit field-name mapper for bi-payment: DTO camelCase (Strapi parity) ↔ entity snake_case.
// Mỗi service gọi mapCamelToSnake(dto, MAPPING) với mapping table rõ ràng (explicit) —
// tránh silent drift khi entity đổi tên field (đã gặp ở is_apply_upload_file).

/**
 * Map object camelCase → snake_case theo mapping table.
 * Chỉ map field có trong mapping, bỏ qua field ko khai báo (explicit, ko auto-convert).
 * Giá trị null/undefined được giữ nguyên.
 */
export function mapCamelToSnake<T extends Record<string, unknown>>(
  dto: T,
  mapping: Record<string, string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [camelKey, value] of Object.entries(dto)) {
    const snakeKey = mapping[camelKey];
    if (snakeKey !== undefined) {
      result[snakeKey] = value;
    }
    // Field ko có trong mapping → bỏ qua (caller phải khai báo đầy đủ).
  }
  return result;
}

/**
 * Map camelCase query params → snake_case cho query builder (cho search DTO field lọc).
 * Tương tự mapCamelToSnake nhưng dành cho filter object.
 */
export function mapCamelQueryToSnake(
  query: Record<string, unknown>,
  mapping: Record<string, string>,
): Record<string, unknown> {
  return mapCamelToSnake(query, mapping);
}
