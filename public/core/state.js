import { newId } from './ids.js';

// Runtime state lives only in memory. Every screen reads the same object.
export const state = {
  user: null,
  catalog: { employees: [], places: [], owners: [] },
  users: [],
  view: 'load',
  activeEntity: 'employees',
  recordSort: 'date_desc',
  notificationSort: 'date_desc',
  catalogSort: 'name_asc',
  auditSort: 'date_desc',
  recordPage: 0,
  notificationPage: 0,
  auditPage: 0,
  draftGroups: [{ employee_id: '', rows: [{}] }],
  submissionId: newId(),
  recordFilters: {},
  notificationFilters: { state: 'pending' },
  busy: false,
  navigationOpen: false,
};
