export function formatTitle(title) {
  return String(title).trim().replace(/\s+/g, ' ');
}

export function pluralize(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}
