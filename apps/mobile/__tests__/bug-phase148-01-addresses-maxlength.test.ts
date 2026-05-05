// BUG-PHASE148-01 — apps/mobile/app/customer/addresses.tsx had FIVE
// text inputs (fullAddress, barangay, city, province, notes) with
// no maxLength. Server's createAddressSchema caps:
//
//   fullAddress: max(500)
//   barangay:    max(100)
//   city:        max(100)
//   province:    max(100)
//   notes:       max(500)
//
// Continuation of the Phase 145/146/147 sweep. After this phase,
// every customer-facing form input on mobile that hits a server
// `.max(N)` validator now has matching client-side maxLength.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../app/customer/addresses.tsx'),
  'utf8',
);

describe('BUG-PHASE148-01 — addresses inputs enforce server caps', () => {
  it('Full Address has maxLength={500}', () => {
    expect(SOURCE).toMatch(/Full Address[\s\S]+?value=\{fullAddress\}[\s\S]+?maxLength=\{500\}/);
  });

  it('Barangay has maxLength={100}', () => {
    expect(SOURCE).toMatch(/Barangay[\s\S]+?value=\{barangay\}[\s\S]+?maxLength=\{100\}/);
  });

  it('City / Municipality has maxLength={100}', () => {
    expect(SOURCE).toMatch(/City \/ Municipality[\s\S]+?value=\{city\}[\s\S]+?maxLength=\{100\}/);
  });

  it('Province has maxLength={100}', () => {
    expect(SOURCE).toMatch(/Province[\s\S]+?value=\{province\}[\s\S]+?maxLength=\{100\}/);
  });

  it('Notes has maxLength={500}', () => {
    expect(SOURCE).toMatch(/Notes \(optional\)[\s\S]+?value=\{notes\}[\s\S]+?maxLength=\{500\}/);
  });

  it('PHASE148 fix-comment is preserved', () => {
    expect(SOURCE).toMatch(/BUG-PHASE148-01 fix/);
  });
});
