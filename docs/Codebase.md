# Understanding the Kairos codebase

Start here when reviewing the application. This refactor separates the screens, HTTP routes, shared
logic, and styles. The existing API contract and database schema remain the compatibility
boundaries.

## Read these files first

1. `public/app.js` starts the browser application and installs session/navigation callbacks.
2. `public/core/shell.js` renders the header and menu, then opens the selected screen.
3. `public/views/load.js` implements the main workflow: one container per employee, containing their
   workplace records.
4. `server/index.js` starts migrations, the HTTP listener, and periodic cleanup.
5. `server/app.js` assembles middleware and registers the API routes in order.
6. `server/routes/records.js` handles saving, editing, and deleting hours.
7. `docs/openapi.json` describes the HTTP interface independently of its implementation.

## Directory map

```text
public/
  app.js                  Browser startup and connection/session events
  core/
    api.js                JSON requests and HTTP errors
    catalog.js            Fetching shared employees, workplaces, and owners
    state.js              Shared in-memory state
    navigation.js         Callback for switching or refreshing the shell
    shell.js              Header, menu, logout, and screen selection
    dom.js                DOM helpers, form submission, dates, and display formatting
    ids.js                UUID generation, including HTTP on the local network
    labels.js             Display labels for actions, entities, and history fields
  views/
    access.js             Login and password recovery
    load.js               Multi-employee batch entry
    records.js            Record list, exports, and editing
    catalog.js            Administration of employees, workplaces, owners, and users
    notifications.js      Notification queue and review actions
    history.js            Per-record and general audit history
  components/
    brand.js              Shared Kairos logo and management-tool caption
    notification-card.js  Event hierarchy, clickable notification, and corner timestamp
    catalog-entry.js       One consistent clickable card for administration entities
    record-card.js        Record presentation with compact mobile timing and action menu
    icons.js              Small inline SVG icons for interface actions
    account-menu.js       Profile, notification bell, and pending-account notice
    export-menu.js        Excel/PDF chooser next to the applied results
    hours.js              Workplace row rendering, durations, totals, and warning display
    filters.js            Shared filter controls, query strings, and pagination
    sort-control.js       Accessible sorting selector shared by list screens
    date-input.js         dd/mm/yyyy entry, native calendar picker, and ISO form values
  search.js               Search suggestions and selection behavior
  dialogs.js              Confirm/cancel dialog
  batch.js                Pure conversion of employee groups into API records
  styles.css              Ordered imports of the files in styles/
  styles/                 Readable CSS split by purpose
  assets/                 Kairos logo, icon, and original image reference

server/
  index.js                Process entry point
  app.js                  Express application assembly; does not start a listener
  auth.js                 Sessions, password hashing, roles, and access throttling
  domain.js               Input validation and business warning rules
  db.js                   PostgreSQL pool, migrations, and transaction wrapper
  schema.sql              Database tables and constraints
  admin.js                Initial account and local password-reset commands
  import-company.mjs      Transactional CSV import and private account snapshot CLI
  middleware/
    request-security.js   Client header, same-origin protection, and no-store headers
    errors.js             Consistent API error responses
  routes/
    access.js             Public login/recovery and protected session endpoints
    catalog.js            Employee, workplace, and owner endpoints
    users.js              Account administration
    records.js            Hours, atomic batches, optimistic versions, and soft deletes
    audit.js              Audit/history endpoints
    notifications.js      Notification filtering and review
    exports.js            Export request validation and data selection
  services/
    accounts.js           Shared account/email helpers
    registration.js       Public account-request normalization
    audit.js              Audit and notification creation within a transaction
    records.js            Record filters, queries, and entity availability checks
    locks.js              Named PostgreSQL transaction locks
    export-files.js       Excel and PDF rendering
    sorting.js            Whitelisted SQL order expressions and deterministic tie breakers

shared/
  dates.js                Date-only formatting, Argentine timestamps, and strict date parsing
                          Served at /shared and copied into the Docker image
  export-names.js         Filter-based filenames and download-header encoding/decoding

scripts/
  check-source.mjs        Syntax checks for all JavaScript modules
  Preparar-Importacion.mjs  Private CSV diagnosis without database changes
  Reiniciar-Importar.mjs  Verified backup, scoped volume replacement, import, and rollback
  lib/                    Source discovery and contract-test helpers
  templates/word/         Readable XML templates for Word documents
  Convert-MarkdownToWord.ps1  Shared Markdown-to-Word conversion
  Generar-Manual.ps1      Generate the user manual
  Generar-Requerimientos.ps1  Generate the requirements document
  backup.sh               Database backup
  verify-backup.sh        Restore into a temporary database to verify a backup

test/                     Domain, contract, structure, HTTP, and optional browser tests
docs/                     Technical guides, API contract, and user manual
requerimientos/           Requirements and original draft
data/                     User-provided test catalog
```

## Follow one operation: saving hours

1. `views/load.js` renders the employee containers. `search.js` binds employee and workplace inputs.
2. The user edits rows. `state.draftGroups` preserves the current draft between screen renders.
3. `core/dom.js` handles form submission and asks for confirmation through `dialogs.js`.
4. `batch.js` converts the grouped UI data into a flat array. Every record retains its employee ID.
5. `core/api.js` sends JSON to `POST /api/records/batch` with the session cookie and client header.
6. `routes/records.js` normalizes rows using `domain.js` and opens a transaction using `db.js`.
7. `services/records.js` checks related entities and existing records. `domain.js` detects warnings.
8. When confirmation is needed, the API returns `409`, warnings, and an opaque confirmation token.
9. The frontend displays those warnings. After confirmation it retries with the same submission ID.
10. The backend saves records, audit events, notifications, and the idempotent result in one
    transaction. Success clears the completed draft.

## State and dependencies

`core/state.js` exports one mutable object. Screens use `state.user`, `state.catalog`,
`state.draftGroups`, and the relevant filters/pages. These values are not persistent browser
storage; reloading can discard an unfinished draft.

The HTTP helper does not import a screen. It exposes a session-expired callback, installed by
`app.js`. Navigation similarly uses a callback so screens do not import the shell that imports them.
This keeps the dependency graph straightforward and avoids circular screen initialization.

Backend routes retain the HTTP request/response handling. Shared rules belong in `domain.js` or a
focused service. `db.transaction()` supplies a client, commits on success, and rolls back on an
exception. Use that same client for related audit and notification writes.

`services/locks.js` names the internal advisory-lock IDs. A call such as
`lockForTransaction(client, DATABASE_LOCKS.recordWrites)` makes concurrent writers wait while a
transaction checks and saves records. PostgreSQL releases the lock automatically at commit or
rollback. It does not create a business record or keep an employee locked after a request finishes.
When an operation needs multiple locks, preserve the existing acquisition order.

## Where to make a change

| Change                                    | Start in                                                     |
| ----------------------------------------- | ------------------------------------------------------------ |
| Page header or menu                       | `public/core/shell.js`                                       |
| Main entry workflow                       | `public/views/load.js`                                       |
| Employee/workplace suggestions            | `public/search.js`                                           |
| Workplace row fields and displayed totals | `public/components/hours.js`                                 |
| Which employee owns a submitted row       | `public/batch.js`                                            |
| Save/cancel dialog appearance or behavior | `public/dialogs.js` and `public/styles/branding.css`         |
| Filter layout or pagination               | `public/components/filters.js`                               |
| Color palette and general controls        | `public/styles/base.css`                                     |
| Employee-container layout                 | `public/styles/load.css`                                     |
| Record validity or warning thresholds     | `server/domain.js`                                           |
| Saving batches or handling versions       | `server/routes/records.js`                                   |
| Shared SQL and entity availability        | `server/services/records.js`                                 |
| Export columns or PDF layout              | `server/services/export-files.js`                            |
| HTTP fields, routes, or statuses          | Update `docs/openapi.json` and the corresponding route/tests |

CSS import order is intentional: base, layout, records, shared components, earlier responsive rules,
search controls, employee containers, then branding/overrides. This preserves the previous cascade.

## Readability rules and commands

The final `catalog.css` and `filters.css` styles refine administration cards and the shared filter
panel. Filter fields use the same label row and control height; notification-only fields are grouped
under More options. See [design references and decisions](Design-notes.md).

Source uses two-space JavaScript/CSS indentation and Prettier with a target width of 100 characters.
HTML templates have `/* HTML */` annotations so the formatter can indent them too. SQL is written
over multiple lines. PowerShell uses four-space indentation. Word XML templates are separate files.

Aim for **about 100 characters per line**, using meaningful function names, clear indentation, and
small modules to make the code easy to review. This is a readability target, not an arbitrary hard
character limit. URLs, machine-readable API descriptions, and other indivisible strings can exceed
it when wrapping them would make the source less clear. Prettier applies the shared formatting
conventions; structural tests check module connections rather than line lengths.

```bash
npm run check          # Syntax checks for all JavaScript modules
npm test               # Business, contract, structure, and enabled integration suites
npm run test:contract  # API documentation and optional HTTP checks
npm run format        # Format supported source files after installing dev dependencies
npm run format:check  # Detect formatting changes without writing them
```

The structure tests also check local named imports and the frontend module graph. The route coverage
test reads all `server/routes/*.js` files and compares their operations with OpenAPI.

PostgreSQL integration still requires `TEST_DATABASE_URL`. Browser tests require `KAIROS_UI_TEST=1`
and Chrome. A skipped test is not evidence that the corresponding running service was verified.

To regenerate delivery documents from their Markdown sources, run the two `Generar-*.ps1` wrappers
from PowerShell. They share the same converter and XML templates; the requirements and user manual
remain Word documents for delivery.

## Apply the refactor to the running installation

```powershell
docker compose up -d --build app
```

Refresh the browser afterward. PostgreSQL continues using its existing volume. These source changes
do not apply to an already built image until it is rebuilt.
