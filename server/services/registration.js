import { text } from '../domain.js';
import { email } from './accounts.js';

export function normalizeRegistration(input) {
  return {
    name: text(input.name, 'Nombre'),
    email: email(input.email),
    password: input.password,
  };
}
