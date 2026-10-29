export function inr(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}
