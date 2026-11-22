import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { sanitizeStudioLogoSvg } from "../features/keystone/utils/studioLogo";
import { sanitizeStoreLogoSvg } from "../features/keystone/utils/storeLogo";
import { normalizeStudioLogoColor } from "../features/keystone/lib/storefront-branding";
import { HUE_PRESETS, LOGO_ICONS } from "../features/platform/store-settings/lib/icon-registry";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const custom = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" fill="#16a34a"/></svg>';

test("the studio sanitizer is the E-commerce sanitizer", () => {
  assert.equal(sanitizeStudioLogoSvg, sanitizeStoreLogoSvg);
  assert.equal(sanitizeStudioLogoSvg(custom), custom);
  assert.equal(sanitizeStudioLogoSvg('<svg onload="alert(1)"></svg>'), "");
  assert.equal(sanitizeStudioLogoSvg('<svg><path style="x"/></svg>'), "");
});

test("every library logo survives the sanitizer, and the registry is E-commerce's", () => {
  assert.equal(LOGO_ICONS.length, 42);
  for (const icon of LOGO_ICONS) assert.equal(sanitizeStudioLogoSvg(icon.lightSvg), icon.lightSvg, icon.id);
  assert.deepEqual(HUE_PRESETS.map((preset) => preset.value), [0, 30, 60, 120, 180, 270, 330]);
});

test("the hue is normalized to 0-359", () => {
  assert.equal(normalizeStudioLogoColor("390"), "30");
  assert.equal(normalizeStudioLogoColor("-30"), "330");
  assert.equal(normalizeStudioLogoColor("red"), "0");
});

test("the page renders the E-commerce block and saves through upsert + revalidate", () => {
  const page = read("features/platform/store-settings/screens/StoreSettingsPage.tsx");
  assert.match(page, /\{\/\* Logo Icon Selector \*\/\}/);
  assert.match(page, /\{\/\* Logo Color Selector \*\/\}/);
  assert.match(page, /Edit SVG Code/);
  assert.match(page, /grid grid-cols-4 gap-2 p-2/);
  assert.doesNotMatch(page, /LogoPicker|LogoColorField/);
  assert.match(page, /data\.logoIcon = draft\.logoIcon/);
  assert.match(page, /data\.logoColor = normalizeStudioLogoColor\(draft\.logoColor\)/);
  const action = read("features/platform/store-settings/actions/store-settings.ts");
  assert.match(action, /upsertStudioSettings\(data: \$data/);
  assert.match(action, /revalidatePath\("\/", "layout"\)/);
  const mutation = read("features/keystone/mutations/studioSettingsLifecycle.ts");
  assert.match(mutation, /const sanitized = sanitizeStudioLogoSvg\(submitted\)/);
  assert.match(mutation, /output\.logoColor = normalizeStudioLogoColor\(input\.logoColor\)/);
});
