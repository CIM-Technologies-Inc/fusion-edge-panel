# FusionEdge — Product Catalogue Admin

A WooCommerce-style product catalogue admin panel for managing companies, brands,
categories, and products. Built on the TailAdmin React template and backed by
Supabase (Postgres, Row-Level Security, Storage, Auth, and Edge Functions).

**Stack:** React 19 · TypeScript · Vite 6 · Tailwind CSS v4 · React Router 7 · Supabase

## Features

### Catalogue

- **Products** — simple and variable products, per-variation attributes, real
  inventory quantity, featured flag (featured items sort first), auto-generated
  slugs, and a 3-step create/edit wizard (type → company/brand/category → details).
- **Companies & brands** — companies own brands (many-to-many); a company's slug is
  derived from its unique name; brands are created from the company detail page.
- **Categories** — nested categories with per-category **required attributes**
  driven by [`src/config/requiredAttributes.json`](src/config/requiredAttributes.json)
  (text / number / url / color / image / RFA field types).
- **Media library** — image and `.rfa` uploads with a filterable picker; all
  image fields across the app pick from the library (no raw URL inputs).
- **Bulk price editing** across products and variations. Prices are in
  Philippine Peso (₱).

### Roles, permissions & scoping

- Role-based permissions per resource (view / add / edit / delete) plus carved-out
  actions: **approval.approve/reject**, **product.feature**, **product.stock**,
  **product.price**.
- **Company scoping** — company users only see and manage their own company's data;
  no-company staff see everything, gated by permission. Enforced in the UI and in
  Postgres RLS.
- User management (invite, deactivate, delete) via a service-role Edge Function,
  with invited-by / last-active tracking and a per-user permission viewer.

### Workflow & auditing

- **Product approval** — company-user publishes go to *pending*; admins approve or
  reject (with a reason) on a dedicated Approvals page with a before/after diff.
  Bell notifications flow both ways.
- **Activity log** — who changed what, with before → after values, for products,
  companies, and categories. Viewable per-record (pencil + ⋯ menu → right-side
  drawer) and on a global Activity page with type tabs and a date-range filter.

### Account

- Profile page with avatar/name editing and **change password**.
- Optional guided product tour, replayable from the dashboard Help button
  (it does not auto-start).

## Installation

### Prerequisites

- Node.js 18.x or later (20.x+ recommended)
- A Supabase project (Postgres, Auth, Storage) with the SQL migrations in
  `supabase/migrations/` applied in order, and the `admin-users` Edge Function
  deployed.

### Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` with your Supabase project credentials:

   ```bash
   VITE_SUPABASE_URL=your-project-url
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

3. Start the development server:

   ```bash
   npm run dev
   ```

4. Type-check / build:

   ```bash
   npx tsc -b   # type-check
   npm run build
   ```

> Migrations under `supabase/migrations/` are run manually in the Supabase SQL
> editor (they are gitignored). Apply any new migration before using the feature
> that depends on it.

---

Built on the free [TailAdmin React](https://tailadmin.com) template (MIT). The
template's original changelog and credits are preserved below.

## Changelog

### Version 2.3.0 - [April 28, 2026]
- Added **AI Dashboard** with token usage and revenue tracking.
- Added **Sales Dashboard** with retention and multi-channel analytics.
- Added **Finance Dashboard** with cashflow and balance management.
- Introduced **6 New Layout variations** for improved UI flexibility.
- Integrated **Advanced Data Visualization** with 7+ new chart types.

### Version 2.1.0 - [Dec 30, 2025]

- Resolved Date Picker positioning and input issues in Charts.

### Version 2.0.2 - [March 25, 2025]

- Upgraded to React 19
- Included overrides for packages to prevent peer dependency errors.
- Migrated from react-flatpickr to flatpickr package for React 19 support

### Version 2.0.1 - [February 27, 2025]

#### Update Overview

- Upgraded to Tailwind CSS v4 for better performance and efficiency.
- Updated class usage to match the latest syntax and features.
- Replaced deprecated class and optimized styles.

#### Next Steps

- Run npm install or yarn install to update dependencies.
- Check for any style changes or compatibility issues.
- Refer to the Tailwind CSS v4 [Migration Guide](https://tailwindcss.com/docs/upgrade-guide) on this release. if needed.
- This update keeps the project up to date with the latest Tailwind improvements. 🚀

### Version 2.0.0 - [February 2025]

A major update with comprehensive redesign and modern React patterns implementation.

#### Major Improvements

- Complete UI redesign with modern React patterns
- New features: collapsible sidebar, chat, and calendar
- Improved performance and accessibility
- Updated data visualization using ApexCharts

#### Key Features

- Redesigned dashboards (Ecommerce, Analytics, Marketing, CRM)
- Enhanced navigation with React Router integration
- Advanced tables with sorting and filtering
- Calendar with drag-and-drop support
- New UI components and improved existing ones

#### Breaking Changes

- Updated sidebar component API
- Migrated charts to ApexCharts
- Revised authentication system

[Read more](https://tailadmin.com/docs/update-logs/react) on this release.

### Version 1.3.7 - [June 20, 2024]

#### Enhancements

1. Remove Repetition of DefaultLayout in every Pages
2. Add ClickOutside Component for reduce repeated functionality in Header Message, Notification and User Dropdowns.

### Version 1.3.6 - [Jan 31, 2024]

#### Enhancements

1. Integrate flatpickr in [Date Picker/Form Elements]
2. Change color after select an option [Select Element/Form Elements].
3. Make it functional [Multiselect Dropdown/Form Elements].
4. Make best value editable [Pricing Table One/Pricing Table].
5. Rearrange Folder structure.

### Version 1.2.0 - [Apr 28, 2023]

- Add Typescript in TailAdmin React.

### Version 1.0.0 - Initial Release - [Mar 13, 2023]

- Initial release of TailAdmin React.

## License

TailAdmin React.js Free Version is released under the MIT License.

## Support

If you find this project helpful, please consider giving it a star on GitHub. Your support helps us continue developing
and maintaining this template.
