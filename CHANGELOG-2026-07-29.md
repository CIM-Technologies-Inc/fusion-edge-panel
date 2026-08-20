# Changelog — 2026-07-29

Work completed today, grouped for ClickUp. Each item notes whether it needs a
**DB migration** or **deploy** action.

---

## 1. Fixed: attribute values leaking into other products
- On the **New Product** page, adding an attribute value no longer writes it to
  the global pool. Values are held locally and saved as **product-owned**
  (private) only when the product is created.
- Confirmed model: values added on the **Attributes admin page** = global;
  values added on a **product** = that product only.
- Files: `src/components/product/AttributeBuilder.tsx`, `src/pages/ProductNew.tsx`
- ✅ No migration needed.

## 2. Cleanup queries for stray / junk attribute data
- SQL to find global values that leaked, plus junk `data-cim-*` / `data-*`
  attributes scraped from WordPress markup.
- ⚠️ **Open item:** deletion is paused pending a blast-radius check
  (`cim_junk_blast_radius.sql`) — must confirm no real variations depend on
  those attributes before deleting.
- Files: `supabase/find_stray_global_terms.sql`, `supabase/inspect_cim_junk.sql`,
  `supabase/cim_junk_blast_radius.sql`

## 3. Attributes admin page — edit image values
- Value editor is now type-aware: **color** → color picker; **image** →
  thumbnail preview + URL field + **Choose** (media library); validates image
  URLs on save.
- File: `src/pages/Attributes.tsx`
- ✅ No migration needed.

## 4. Product page — edit values (product-owned only)
- Edit pencil on value chips to change name / color / image, **only for values
  owned by that product** (global values stay read-only to protect other
  products).
- Files: `src/components/product/AttributeBuilder.tsx`,
  `src/pages/ProductNew.tsx`, `src/types/catalogue.ts`
- ✅ No migration needed.

## 5. User management (view / invite / create / edit / delete / ban / roles)
- **Roles:** new `admin` / `staff` / `customer` enum on `profiles`; `is_admin`
  auto-synced so existing security still works.
- **Users page:** list with email, search/sort/pagination, inline role change,
  ban/reactivate, delete, edit name, and Add-user modal (Invite or Create).
  Admin-only, wired into sidebar + router.
- **Edge Function** (`admin-users`) for privileged actions using the
  service-role key, with admin verification and self-sabotage protection.
- Files: `supabase/migrations/0003_user_roles.sql`,
  `supabase/functions/admin-users/index.ts`,
  `supabase/functions/admin-users/DEPLOY.md`, `src/pages/Users.tsx`,
  `src/hooks/useUsers.ts`, `src/lib/users.ts`, `src/App.tsx`,
  `src/layout/AppSidebar.tsx`
- ⚠️ **Action required:** (a) run `0003_user_roles.sql`; (b) deploy the Edge
  Function + set `SERVICE_ROLE_KEY`.

## 6. Fixed: "permission denied for table users" on Users page
- The `admin_users` view ran with caller rights and couldn't read `auth.users`.
  Recreated it with owner rights (the `is_admin()` filter still limits rows to
  admins).
- Files: `supabase/migrations/0004_fix_admin_users_view.sql` (+ corrected
  `0003`)
- ⚠️ **Action required:** run `0004_fix_admin_users_view.sql`.

---

## 7. Brands (new — every product now has a brand)
- New **Brands** page under Product (sidebar + `/product/brands`): name, slug,
  description, logo (photo via media picker), search/sort/pager — mirrors
  Categories.
- Brand is **required** on products; a **Brand** dropdown was added to the
  New and Edit product forms with validation.
- Migration seeds a **"Generic"** brand and backfills all existing products to
  it, so the required rule holds without breaking anything.
- `useProduct` falls back gracefully if the migration hasn't run yet (brand-free
  query) so product pages never break pre-migration.
- Files: `supabase/migrations/0005_brands.sql`, `src/pages/Brands.tsx`,
  `src/lib/brands.ts`, `src/hooks/useBrands.ts`, `src/hooks/useBrandsFull.ts`,
  `src/hooks/useProduct.ts`, `src/pages/ProductNew.tsx`,
  `src/pages/ProductEdit.tsx`, `src/pages/ProductDetail.tsx`,
  `src/lib/products.ts`, `src/types/catalogue.ts`, `src/App.tsx`,
  `src/layout/AppSidebar.tsx`
- ⚠️ **Action required:** run `0005_brands.sql`.

## 8. Companies (new — a company owns brands)
- New **Companies** page under Product (sidebar + `/product/companies`): name,
  slug, description, logo — mirrors Brands.
- A company **owns brands**: the Brand form gets an **optional** Company
  dropdown ("None" allowed); the Brands list shows and searches by company.
- Products still pick a **brand** only — a product's company is derived through
  its brand (no company_id on products).
- `useBrandsFull` falls back gracefully if 0006 hasn't run yet (company-free
  query), so the Brands page never breaks pre-migration.
- Files: `supabase/migrations/0006_companies.sql`, `src/pages/Companies.tsx`,
  `src/lib/companies.ts`, `src/hooks/useCompanies.ts`,
  `src/hooks/useCompaniesFull.ts`, `src/pages/Brands.tsx`,
  `src/lib/brands.ts`, `src/hooks/useBrandsFull.ts`, `src/types/catalogue.ts`,
  `src/App.tsx`, `src/layout/AppSidebar.tsx`
- ⚠️ **Action required:** run `0006_companies.sql`.

## 9. Company⇄Brand reshaped to many-to-many + company on products
- A **company owns brands** as a **many-to-many** (`brand_companies` join): a
  brand can belong to several companies. Old single `brands.company_id` was
  migrated into the join and dropped.
- **Assign brands from the Companies page** (brand checklist in the modal).
- **Products now pick a Company, then a filtered Brand.** Company drives the
  brand list; both required. Existing products backfilled to a "Generic"
  company. This is what makes company appear on the product Add/Edit forms.
- `useProduct` / `useBrandsFull` degrade gracefully pre-migration.
- Files: `supabase/migrations/0007_brand_companies.sql`,
  `src/hooks/useCompanyBrands.ts`, `src/pages/Companies.tsx`,
  `src/pages/Brands.tsx`, `src/lib/companies.ts`, `src/lib/brands.ts`,
  `src/hooks/useBrandsFull.ts`, `src/hooks/useCompaniesFull.ts`,
  `src/hooks/useProduct.ts`, `src/pages/ProductNew.tsx`,
  `src/pages/ProductEdit.tsx`, `src/pages/ProductDetail.tsx`,
  `src/lib/products.ts`, `src/types/catalogue.ts`
- ⚠️ **Action required:** run `0007_brand_companies.sql`.

## 10. 3D model on products
- Product Add/Edit forms get a **3D model** section: paste a `.glb`/`.gltf` URL
  **or upload** one (stored in Supabase Storage, 30 MB cap), with a live
  interactive preview (orbit + zoom + auto-rotate).
- The public product page shows an interactive **3D viewer** when a model is set.
- Uses `@google/model-viewer` (installed via npm, self-contained — no CDN).
- New `products.model_3d_url` column (optional). `useProduct` degrades
  gracefully if 0008 hasn't run.
- Files: `supabase/migrations/0008_product_model3d.sql`,
  `src/components/product/Model3DViewer.tsx`,
  `src/components/product/Model3DField.tsx`, `src/lib/media.ts`
  (`uploadModel3D`), `src/lib/products.ts`, `src/hooks/useProduct.ts`,
  `src/types/catalogue.ts`, `src/pages/ProductNew.tsx`,
  `src/pages/ProductEdit.tsx`, `src/pages/ProductDetail.tsx`; added dep
  `@google/model-viewer`.
- ⚠️ **Action required:** run `0008_product_model3d.sql`.

## 11. Dashboard rebuilt for the catalogue
- Replaced the demo sales/orders dashboard with a real catalogue overview:
  stat cards (products, variations, categories/brands/companies, users),
  charts (products added per month, products by category), a Recent products
  table, and a Needs-attention list (unpublished / missing image).
- Files: `src/components/dashboard/CatalogueDashboard.tsx`,
  `src/hooks/useDashboardStats.ts`, `src/pages/Dashboard/Home.tsx`.
- No migration needed.

## 12. Branding — dark logo, dark mode default, sign-in video
- Dark-mode logo (`log-fusion-dark.png`) now swaps in for the sidebar,
  header, and sign-in page in dark mode.
- Dark mode is the default (with a no-flash pre-paint init); users can still
  toggle and their choice is remembered.
- Sign-in page's right half is now a background video with the logo overlaid.
- Files: `src/layout/AppSidebar.tsx`, `src/layout/AppHeader.tsx`,
  `src/context/ThemeContext.tsx`, `index.html`,
  `src/pages/AuthPages/AuthPageLayout.tsx`.
- No migration needed.

## 13. Per-variation extra attributes
- Each variation can now carry free-typed extra attributes (e.g. Material,
  Dimension), each with multiple values — added on the variation form as
  add-attribute / add-value chips. Fully dynamic (any number of attributes).
- Shown as specs on the public product page for the selected variation.
- New `variation_meta` table stores them; loading degrades gracefully if the
  migration hasn't run.
- Files: `supabase/migrations/0009_variation_meta.sql`,
  `src/components/product/VariationBuilder.tsx`, `src/lib/variationsAdmin.ts`,
  `src/hooks/useProduct.ts`, `src/pages/ProductEdit.tsx`,
  `src/pages/ProductDetail.tsx`, `src/types/catalogue.ts`,
  `src/components/form/input/InputField.tsx`.
- ⚠️ **Action required:** run `0009_variation_meta.sql`.

## 14. Fix — variations showing no value in the editor
- Some variations rendered blank because their `variation_terms` referenced an
  attribute the product no longer offers (leftover WordPress `data-cim-*` junk,
  e.g. `data-cim-hex`). The editor only renders offered attributes, so those
  looked empty.
- SQL fix removes only the orphaned variation-terms (never a real selection);
  variation rows, prices, images, and extra attributes are untouched.
- Currently affects 1 product; script is safe to run across all.
- Files: `supabase/fix_orphaned_variation_terms.sql`
  (and product-specific `supabase/fix_basel_tile_variations.sql`).
- ⚠️ **Action required:** run `fix_orphaned_variation_terms.sql`.

## 15. Data reset tooling
- Scripts to wipe dummy data safely (transaction-wrapped, with row-count
  checks): full catalogue reset keeping logins, and a products-only reset that
  keeps brands/companies/categories/attributes.
- Files: `supabase/reset_catalogue_data.sql`,
  `supabase/reset_products_only.sql`.

---

## Outstanding action items (checklist)
- [ ] Run migration `0003_user_roles.sql`
- [ ] Run migration `0004_fix_admin_users_view.sql`
- [ ] Run migration `0005_brands.sql` (adds brands + backfills existing products to "Generic")
- [ ] Run migration `0006_companies.sql` (adds companies + optional brand→company link)
- [ ] Run migration `0007_brand_companies.sql` (company⇄brand many-to-many + company on products, backfills "Generic")
- [ ] Run migration `0008_product_model3d.sql` (adds products.model_3d_url for the 3D viewer)
- [ ] Run migration `0009_variation_meta.sql` (per-variation extra attributes)
- [ ] Run `fix_orphaned_variation_terms.sql` (fixes variations showing no value)
- [ ] Deploy Edge Function: `supabase functions deploy admin-users` + set `SERVICE_ROLE_KEY`
- [ ] Run `cim_junk_blast_radius.sql` and decide on deleting the `data-*` junk attributes

---

## Verification
- `npx tsc -b` → exit 0
- `npm run build` → succeeds
