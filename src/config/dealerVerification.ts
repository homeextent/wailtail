// Workflow choices are prompts for human review, not automated verification standards.
export const DEALER_VERIFICATION_METHODS = [
  'Licensing register and representative authorization review',
  'Direct regulator confirmation and representative authorization review',
  'Business document and representative authority review',
  'Combined manual checks'
] as const;
export const DEALER_VERIFICATION_SOURCES = [
  'Official licensing register', 'Regulator correspondence',
  'Business or licence documents', 'Combined supporting records', 'Other'
] as const;

/** datetime-local uses the browser's local timezone; stored timestamps remain epoch milliseconds. */
export function dealerLocalDateInput(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '';
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function parseDealerLocalDate(value: string, originalTimestamp?: number) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return NaN;
  // An unchanged existing value retains seconds and its original DST occurrence.
  if (originalTimestamp && dealerLocalDateInput(originalTimestamp) === value) return originalTimestamp;
  const timestamp = new Date(value).getTime();
  // Reject normalized invalid dates and local clock times skipped by daylight saving.
  return dealerLocalDateInput(timestamp) === value ? timestamp : NaN;
}
