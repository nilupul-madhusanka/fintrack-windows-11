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
