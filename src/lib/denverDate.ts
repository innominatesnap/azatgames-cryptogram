export function denverDateString(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Denver',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  let year = '';
  let month = '';
  let day = '';
  for (const part of parts) {
    if (part.type === 'year') year = part.value;
    if (part.type === 'month') month = part.value;
    if (part.type === 'day') day = part.value;
  }
  return year + '-' + month + '-' + day;
}

export function previousDate(iso: string): string {
  return shiftDate(iso, -1);
}

export function shiftDate(iso: string, days: number): string {
  const [yearText, monthText, dayText] = iso.split('-');
  const stamp = Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText), 12, 0, 0);
  const next = new Date(stamp + days * 24 * 60 * 60 * 1000);
  const year = String(next.getUTCFullYear());
  const month = String(next.getUTCMonth() + 1).padStart(2, '0');
  const day = String(next.getUTCDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}
