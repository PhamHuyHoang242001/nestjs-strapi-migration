import { SortType, SortTypeNumber } from '@common/enums';
import { Transform } from 'class-transformer';

/** Safely stringify any value including objects */
function safeString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v as string | number | boolean);
}

/** Trims whitespace and collapses multiple spaces */
export function Trim(): PropertyDecorator {
  return Transform((params) => {
    const value = params.value as unknown;

    if (Array.isArray(value)) {
      return (value as unknown[]).map((v) => safeString(v).trim().replace(/\s\s+/g, ' '));
    }
    return safeString(value).trim().replace(/\s\s+/g, ' ');
  });
}

/** Trims all whitespace including inner spaces */
export function TrimSpace(): PropertyDecorator {
  return Transform((params) => {
    const value = params.value as unknown;

    if (Array.isArray(value)) {
      return (value as unknown[]).map((v) => safeString(v).trim().replace(/\s/g, ''));
    }
    return safeString(value).trim().replace(/\s/g, '');
  });
}

export function ToLowerCase(): PropertyDecorator {
  return Transform((params) => {
    const value = params.value as unknown;

    if (Array.isArray(value)) {
      return (value as unknown[]).map((v) => safeString(v).toLowerCase());
    }

    return safeString(value).toLowerCase();
  });
}

export function ToUpperCase(): PropertyDecorator {
  return Transform((params) => {
    const value = params.value as unknown;

    if (Array.isArray(value)) {
      return (value as unknown[]).map((v) => safeString(v).toUpperCase());
    }

    return safeString(value).toUpperCase();
  });
}

export function ToInt(): PropertyDecorator {
  return Transform(
    (params) => {
      const value = params.value as string;
      return Number.parseInt(value, 10);
    },
    { toClassOnly: true },
  );
}

export function ToArray(): PropertyDecorator {
  return Transform(
    (params) => {
      const value = params.value as unknown;

      if (value === null || value === undefined) {
        return [];
      }

      return Array.isArray(value) ? (value as unknown[]) : [value];
    },
    { toClassOnly: true },
  );
}

export const ToBoolean = () => {
  const toPlain = Transform(
    ({ value }: { value: unknown }) => {
      return value;
    },
    {
      toPlainOnly: true,
    },
  );
  const toClass = (target: object, key: string) => {
    return Transform(
      ({ obj }: { obj: Record<string, unknown> }) => {
        return valueToBoolean(obj[key]);
      },
      {
        toClassOnly: true,
      },
    )(target, key);
  };
  return function (target: object, key: string) {
    toPlain(target, key);
    toClass(target, key);
  };
};

const valueToBoolean = (value: unknown): boolean | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (['true', 'on', 'yes', '1'].includes(safeString(value).toLowerCase())) {
    return true;
  }
  if (['false', 'off', 'no', '0'].includes(safeString(value).toLowerCase())) {
    return false;
  }
  return undefined;
};

export function ToSortType(): PropertyDecorator {
  return Transform(
    (params) => {
      const value = params.value as string | undefined;
      return value?.toLowerCase() === (SortType.ASC as string) ? SortTypeNumber.ASC : SortTypeNumber.DESC;
    },
    { toClassOnly: true },
  );
}
