// Public policy-reading entry point. Reuse the existing document screen, not
// the customer layout: viewing terms must not require signing in first.
// Customer account routes keep their existing role guard and API permissions.
export { default } from './customer/terms';
