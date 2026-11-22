import { accountMetadata } from "@/features/storefront/lib/account-metadata";

export { default } from "@/features/storefront/screens/AccountPrivatesPage";

export function generateMetadata() {
  return accountMetadata("Private sessions");
}
