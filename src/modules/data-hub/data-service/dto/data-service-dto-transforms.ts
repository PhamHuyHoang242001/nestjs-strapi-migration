// Shared class-transformer helpers for data service DTOs.

// Free text from the form is stored trimmed; non-strings are left for the validator to reject.
export const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

// peak_tps / timeout / max_file_size are VARCHAR columns but forms often send numbers.
export const numberToString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'number' ? String(value) : value;

// Text a reader would see in an HTML fragment: tags, &nbsp; and whitespace dropped. An editor that was left empty
// still sends markup such as "<p><br></p>", which must count as empty.
export const visibleHtmlText = (html: string): string =>
  html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .trim();
