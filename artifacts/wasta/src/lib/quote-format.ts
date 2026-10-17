/** The wire contract stores a fraction: 0.5 means a 50% deposit. */
export const formatDepositPercent = (fraction: number): string =>
  new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 2 }).format(fraction);
