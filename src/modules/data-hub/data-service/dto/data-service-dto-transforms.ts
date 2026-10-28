// Shared class-transformer helpers for data service DTOs.

// Free text from the form is stored trimmed; non-strings are left for the validator to reject.
export const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

// peak_tps / timeout / max_file_size are VARCHAR columns but forms often send numbers.
export const numberToString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'number' ? String(value) : value;
