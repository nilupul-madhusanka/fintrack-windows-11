/** Format minor-unit strings without passing money through floating point. */
export function money(value: string): string {
  const amount = BigInt(value);
  const absolute = amount < 0n ? -amount : amount;
  return `${amount < 0n ? "−" : ""}LKR ${(absolute / 100n).toLocaleString("en-LK")}.${(absolute % 100n).toString().padStart(2, "0")}`;
}

export function localDate(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function decimal(value: string): string {
  const amount = BigInt(value),
    absolute = amount < 0n ? -amount : amount;
  return `${amount < 0n ? "-" : ""}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
}
export function displayDate(value: string, format: string): string {
  const [y, m, d] = value.split("-");
  return format === "day-first"
    ? `${d}/${m}/${y}`
    : format === "month-first"
      ? `${m}/${d}/${y}`
      : value;
}
export function monthFilter(period: string) {
  const [year, month] = period.split("-").map(Number);
  const last = new Date(year, month, 0).getDate();
  return {
    start: `${period}-01`,
    end: `${period}-${last}`,
    kind: "",
    accountId: "",
    categoryId: "",
    search: "",
    offset: 0,
  };
}
