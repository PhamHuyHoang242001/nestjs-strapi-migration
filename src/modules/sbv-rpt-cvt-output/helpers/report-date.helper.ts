import { BadRequestException } from '@nestjs/common';

/**
 * Parse "YYYY-MM-DD" or "YYYY-MM" into a structured object.
 * Ported from strapiv5-old/src/common/util.ts:parseReportDateInput
 */
export function parseReportDateInput(reportDate: string) {
  if (!reportDate || typeof reportDate !== 'string') {
    throw new BadRequestException('Invalid reportDate');
  }

  const dayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(reportDate);
  if (dayMatch) {
    const year = Number(dayMatch[1]);
    const monthIndex = Number(dayMatch[2]) - 1;
    const day = Number(dayMatch[3]);
    const baseDate = new Date(year, monthIndex, day);
    if (isNaN(baseDate.getTime())) {
      throw new BadRequestException('Invalid reportDate');
    }
    return { mode: 'DAY' as const, baseDate, year, monthIndex, day };
  }

  const monthMatch = /^(\d{4})-(\d{2})$/.exec(reportDate);
  if (monthMatch) {
    const year = Number(monthMatch[1]);
    const monthIndex = Number(monthMatch[2]) - 1;
    const baseDate = new Date(year, monthIndex, 1);
    if (isNaN(baseDate.getTime())) {
      throw new BadRequestException('Invalid reportDate');
    }
    return { mode: 'MONTH' as const, baseDate, year, monthIndex };
  }

  throw new BadRequestException('Invalid reportDate format. Expected YYYY-MM-DD or YYYY-MM');
}

/**
 * Build search date range based on frequency code.
 * Ported from strapiv5-old/src/common/util.ts:buildSearchDate
 */
export function buildSearchDate(
  baseDate: Date,
  frqCode?: string,
  dateMode?: string,
): { startDate: Date; endDate: Date } | null {
  if (!baseDate || isNaN(baseDate.getTime())) return null;

  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const day = baseDate.getDate();

  if (dateMode === 'MONTH') {
    return { startDate: new Date(year, month, day), endDate: new Date(year, month + 1, 0) };
  }
  return { startDate: new Date(year, month, day), endDate: new Date(year, month, day) };
}

/**
 * Build the due date for a given frequency.
 * Ported 1:1 from strapiv5-old/src/common/util.ts:buildDueDate
 */
export function buildDueDate(baseDate: Date, frqCode: string, dateMode: string): Date | null | undefined {
  if (!baseDate || isNaN(baseDate.getTime())) return null;
  const today = new Date();
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();

  switch (frqCode) {
    case 'D': {
      if (dateMode === 'MONTH') return new Date(year, month + 1, 0);
      return baseDate;
    }
    case 'M': {
      if (dateMode === 'DAY') {
        const targetDate = new Date(year, month + 1, 0);
        if (baseDate.getTime() !== targetDate.getTime()) return null;
        return baseDate;
      }
      return new Date(year, month + 1, 0);
    }
    case 'Y': {
      const targetDate = new Date(year, 11, 31);
      if (dateMode === 'MONTH') {
        if (targetDate.getTime() > today.getTime()) return undefined;
        if (targetDate.getMonth() !== baseDate.getMonth()) return undefined;
        return targetDate;
      }
      if (baseDate.getTime() !== targetDate.getTime()) return null;
      return baseDate;
    }
    case 'Q': {
      const quarter = Math.floor(month / 3);
      const qEndMonth = quarter * 3 + 2;
      const targetDate = new Date(year, qEndMonth + 1, 0);
      if (baseDate.getMonth() < qEndMonth) return undefined;
      if (dateMode === 'MONTH') return targetDate;
      if (baseDate.getTime() !== targetDate.getTime()) return null;
      return baseDate;
    }
    case 'M3': {
      const validM3Date = [10, 20];
      if (dateMode === 'DAY') {
        if (
          baseDate.getTime() !== new Date(year, month + 1, 0).getTime() &&
          !validM3Date.includes(baseDate.getDate())
        ) {
          return undefined;
        }
        return baseDate;
      }
      if (
        baseDate.getTime() !== new Date(year, month + 1, 0).getTime() &&
        baseDate.getTime() !== new Date(year, month, 1).getTime()
      ) {
        return baseDate;
      }
      let m3DueDate = new Date(year, month + 1, 0);
      if (m3DueDate > today) {
        m3DueDate = today;
        if (m3DueDate.getDate() <= 10) return new Date(m3DueDate.getFullYear(), m3DueDate.getMonth(), 10);
        if (m3DueDate.getDate() <= 20) return new Date(m3DueDate.getFullYear(), m3DueDate.getMonth(), 20);
        return new Date(m3DueDate.getFullYear(), m3DueDate.getMonth() + 1, 0);
      }
      if (m3DueDate.getDate() <= 10) return new Date(year, month, 10);
      if (m3DueDate.getDate() <= 20) return new Date(year, month, 20);
      return new Date(year, month + 1, 0);
    }
    case 'Y2': {
      const targetDate = [new Date(year, 6, 0).getTime(), new Date(year, 12, 0).getTime()];
      if (dateMode === 'DAY') {
        if (!targetDate.includes(baseDate.getTime())) return undefined;
        return baseDate;
      }
      const y2DueDate = new Date(year, month > 5 ? 12 : 6, 0);
      if (y2DueDate < today) {
        if (baseDate.getMonth() === y2DueDate.getMonth()) return new Date(year, month + 1, 0);
        return undefined;
      }
      return undefined;
    }
    default:
      return null;
  }
}

/** Format a Date as "YYYY-MM-DD" key string */
export function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}
