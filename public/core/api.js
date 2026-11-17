import { state } from './state.js';

let sessionExpired = () => {};
export function onSessionExpired(callback) {
  sessionExpired = callback;
}

export async function api(path, options = {}) {
  let res;
  try {
    res = await fetch('/api' + path, {
      ...options,
      headers: { 'Content-Type': 'application/json', 'X-Kairos-Client': 'web', ...options.headers },
    });
  } catch {
    throw new Error(
      'No hay conexión con el servidor. Conservamos los datos en pantalla; reintentá sin recargar.',
    );
  }
  const data = await res.json();
  if (!res.ok) {
    const e = Object.assign(new Error(data.message || 'No se pudo completar la operación.'), data, {
      status: res.status,
    });
    if (res.status === 401 && state.user) {
      state.user = null;
      sessionExpired();
    }
    throw e;
  }
  return data;
}
