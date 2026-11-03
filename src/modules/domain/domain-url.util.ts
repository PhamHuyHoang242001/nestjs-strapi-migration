// Domains are stored as lower-case origins without a trailing slash; input is folded the same way before it is
// compared, so " API-INT.vpbank.com.vn/ " finds https://api-int.vpbank.com.vn.
export const normalizeDomainUrl = (value: string): string => {
  const v = value.trim().toLowerCase().replace(/\/+$/, '');
  if (v === '') return v;
  return /^https?:\/\//.test(v) ? v : `https://${v}`;
};
