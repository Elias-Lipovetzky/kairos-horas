function namePart(value) {
  const cleaned = String(value || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '-')
    .replace(/[\s-]+/g, '-')
    .replace(/^[.\s-]+|[.\s-]+$/g, '');
  // Leave room for both names and the period within filesystem filename limits.
  const encoder = new TextEncoder();
  let part = '';
  for (const character of cleaned) {
    if (encoder.encode(part + character).length > 60) break;
    part += character;
  }
  return part.replace(/[.\s-]+$/g, '');
}

function shortDate(date) {
  return date ? date.slice(8, 10) + date.slice(5, 7) : '';
}

export function exportFilename({ employee, place, from, to }, format) {
  const parts = ['kairos-horas', namePart(employee), namePart(place)];
  if (from && to) parts.push(`${shortDate(from)}-al-${shortDate(to)}`);
  else if (from) parts.push(`desde-${shortDate(from)}`);
  else if (to) parts.push(`hasta-${shortDate(to)}`);
  return parts.filter(Boolean).join('-') + '.' + format;
}

export function exportDisposition(filename) {
  const ascii = filename
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\x20-\x7e]/g, '_');
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export function downloadFilename(header, format) {
  const encoded = header?.match(/filename\*=UTF-8''([^;]+)/i);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1]);
    } catch {
      // Older servers or proxies can omit or alter the encoded filename.
    }
  }
  return header?.match(/filename="([^"]+)"/i)?.[1] || `kairos-horas.${format}`;
}
