/** Upper-cases a string's first letter, leaving the rest as-is. */
export function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
