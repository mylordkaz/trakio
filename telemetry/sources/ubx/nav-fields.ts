// UBX navigation time and heading fields, as laid out in NAV-PVT and the
// RaceBox data message that mirrors it.

export type UtcTimeFields = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  nanosecond: number;
  validityFlags: number;
};

// validDate | validTime | fullyResolved must all be set for the UTC fields to
// be trusted; otherwise the phone clock stands in.
const UTC_VALIDITY_MASK = 0x07;

export function utcFieldsToRecordedAt(fields: UtcTimeFields): number {
  if ((fields.validityFlags & UTC_VALIDITY_MASK) !== UTC_VALIDITY_MASK) {
    return Date.now();
  }

  const date = new Date(
    Date.UTC(fields.year, fields.month - 1, fields.day, fields.hour, fields.minute, fields.second)
  );
  const ms = date.getTime() + fields.nanosecond / 1_000_000;
  return Math.round(ms);
}

// Headings are 1e-5 degrees; anything outside [0, 360) is not a heading.
export function normalizeHeading(raw: number): number | null {
  const deg = raw / 1e5;
  if (deg < 0 || deg >= 360) {
    return null;
  }
  return deg;
}
