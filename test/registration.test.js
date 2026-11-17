import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRegistration } from '../server/services/registration.js';

test('registration normalizes identity and ignores requested roles or activation', () => {
  const result = normalizeRegistration({
    name: '  New Person  ',
    email: ' PERSON@EXAMPLE.TEST ',
    password: 'test-password-123',
    role: 'admin',
    active: true,
    registration_pending: false,
  });
  assert.deepEqual(result, {
    name: 'New Person',
    email: 'person@example.test',
    password: 'test-password-123',
  });
});

test('registration rejects missing names and malformed email addresses', () => {
  assert.throws(() => normalizeRegistration({ name: '', email: 'person@example.test' }));
  assert.throws(() => normalizeRegistration({ name: 'Person', email: 'invalid' }));
});
