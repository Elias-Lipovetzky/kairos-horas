import { state } from './state.js';
import { api } from './api.js';

export async function loadCatalog() {
  state.catalog = await api('/catalog');
}
