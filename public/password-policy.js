// Shared by the browser and server so the visible checklist matches validation.
export const passwordRules = [
  { id: 'length', label: 'Pelo menos 12 caracteres', test: value => value.length >= 12 },
  { id: 'upper', label: 'Uma letra maiúscula', test: value => /\p{Lu}/u.test(value) },
  { id: 'lower', label: 'Uma letra minúscula', test: value => /\p{Ll}/u.test(value) },
  { id: 'number', label: 'Um número', test: value => /[0-9]/.test(value) },
  { id: 'symbol', label: 'Um símbolo, como !, @ ou #', test: value => /[^\p{L}\p{N}\s]/u.test(value) },
];
export function passwordError(value) {
  if (typeof value !== 'string') return 'Informe uma senha.';
  if (new TextEncoder().encode(value).length > 72) return 'A senha ficou longa demais. Use menos caracteres.';
  if (passwordRules.some(rule => !rule.test(value))) return 'Use pelo menos 12 caracteres, com letra maiúscula, minúscula, número e símbolo.';
  return '';
}
