function capitalize(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function slugify(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function truncate(str, maxLength) {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength).trimEnd() + '...';
}

module.exports = { capitalize, slugify, truncate };
