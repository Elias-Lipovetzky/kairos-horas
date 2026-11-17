const base = (process.env.KAIROS_API_URL || 'http://127.0.0.1:8080/api').replace(/\/$/, '');
if (!process.env.KAIROS_TEST_EMAIL || !process.env.KAIROS_TEST_PASSWORD)
  throw new Error('Definir correo y clave del administrador mediante variables de entorno.');
let cookie = '';
async function request(path, method = 'GET', body) {
  const response = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Kairos-Client': 'web', Cookie: cookie },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.message);
  return { value, response };
}
try {
  const login = await request('/login', 'POST', {
    email: process.env.KAIROS_TEST_EMAIL,
    password: process.env.KAIROS_TEST_PASSWORD,
  });
  cookie = login.response.headers.get('set-cookie')?.split(';')[0];
  if (login.value.role !== 'admin') throw new Error('Requiere administrador.');
  const correct = 'Due\u00f1o de prueba - reemplazar';
  const bad = new Set([
    Buffer.from(correct, 'utf8').toString('latin1'),
    Buffer.from(correct.slice(0, -1), 'utf8').toString('latin1'),
  ]);
  const { owners } = (await request('/catalog')).value;
  const changed = [];
  for (const owner of owners) {
    if (!bad.has(owner.name)) continue;
    await request('/catalog/owners/' + owner.id, 'PUT', {
      name: correct,
      phone: owner.phone,
      active: owner.active,
    });
    changed.push(owner.id);
  }
  const verified = (await request('/catalog')).value.owners;
  if (changed.some((id) => !verified.some((o) => o.id === id && o.name === correct)))
    throw new Error('No se pudo verificar la corrección.');
  console.log(
    `Corrección UTF-8 verificada: ${changed.length} dueños de prueba actualizados. Se conservaron sus IDs y relaciones.`,
  );
} finally {
  if (cookie) await request('/logout', 'POST');
}
