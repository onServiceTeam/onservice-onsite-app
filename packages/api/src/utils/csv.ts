/**
 * CSV formula-injection guard.
 *
 * Spreadsheet apps (Excel / LibreOffice / Google Sheets) treat a cell whose
 * first character is a formula trigger (= + - @, or a leading TAB / CR) as a
 * formula and execute it on open. User-controlled free text (names, notes,
 * chat messages, tester feedback, audit before/after values) flows into the
 * CSV exports, so a crafted value like =HYPERLINK(...) or =cmd|'/c calc'!A1
 * would run when a compliance officer / admin / data subject opens the file.
 *
 * neutralizeCsvFormula prefixes such a cell with a single quote so the
 * spreadsheet renders it as literal text instead of evaluating it. Call this
 * BEFORE the comma/quote/newline quoting in each CSV cell escaper.
 */
export function neutralizeCsvFormula(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}
