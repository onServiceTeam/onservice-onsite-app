import React, { useEffect, useId, useMemo, useState } from 'react';
import { Checkbox } from '@/components/ui/Checkbox';
import { Textarea } from '@/components/ui/Textarea';

// ─── Provider vetting rubric ────────────────────────────────────────────────
//
// The company's vetting rubric, baked into the approval flow. An admin must
// confirm every item AND write a >=10-char rationale before a pending provider
// can be approved. On approve, the parent sends the rationale plus the
// one-line checklist summary (see buildChecklistSummary) into the same audited
// server transaction that changes the provider's status.

export interface VettingItem {
  key: string;
  label: string;
}

// Mirrors the company vetting rubric in docs/operations/04. Items that depend on
// optional application data say "or noted as none" so an admin can still confirm
// they reviewed it for a legit solo worker who has no website/registration.
export const VETTING_ITEMS: VettingItem[] = [
  { key: 'gov_id', label: 'Government ID front and back reviewed and legible' },
  { key: 'selfie_match', label: 'Selfie matches the ID' },
  { key: 'nbi', label: 'NBI clearance present and not expired' },
  { key: 'address', label: 'Business / home address looks real and local' },
  { key: 'area_categories', label: 'Service area + chosen services are sensible' },
  { key: 'experience', label: 'Experience, skills, and credentials are plausible' },
  { key: 'registrations', label: 'Business registrations / certifications reviewed (or noted as none)' },
  { key: 'references', label: 'At least one reference reviewed and looks contactable' },
  { key: 'online', label: 'Website / social links checked (or noted as none)' },
  { key: 'no_fraud', label: 'No duplicate-account or fraud red flags' },
];

export const RATIONALE_MIN_LENGTH = 10;
export const RATIONALE_MAX_LENGTH = 2000;

/** One-line summary recorded in the quality note alongside the rationale. */
export function buildChecklistSummary(): string {
  return `Vetting checklist confirmed (${VETTING_ITEMS.length}/${VETTING_ITEMS.length}): ${VETTING_ITEMS.map((i) => i.label).join('; ')}.`;
}

export interface VettingState {
  /** True only when every item is ticked AND the rationale meets the API bounds. */
  isComplete: boolean;
  rationale: string;
}

interface VettingChecklistProps {
  /** Called on every change so the parent can gate its Approve button. */
  onChange: (state: VettingState) => void;
}

export function VettingChecklist({ onChange }: VettingChecklistProps): React.ReactElement {
  const rationaleId = useId();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [rationale, setRationale] = useState('');
  const [rationaleTouched, setRationaleTouched] = useState(false);

  const allChecked = useMemo(
    () => VETTING_ITEMS.every((i) => checked[i.key]),
    [checked],
  );
  const rationaleLength = rationale.trim().length;
  const rationaleOk = rationaleLength >= RATIONALE_MIN_LENGTH && rationaleLength <= RATIONALE_MAX_LENGTH;
  const showRationaleError = rationaleTouched && !rationaleOk;
  const isComplete = allChecked && rationaleOk;

  useEffect(() => {
    onChange({ isComplete, rationale: rationale.trim() });
  }, [isComplete, rationale, onChange]);

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-[var(--color-text)]">Vetting checklist</p>
      <p className="text-xs text-[var(--color-text-secondary)]">
        Confirm each item before approving. The rationale and checklist summary are saved with the approval audit record.
      </p>

      <ul className="space-y-2">
        {VETTING_ITEMS.map((item) => (
          <li key={item.key}>
            <label className="flex items-start gap-2 text-sm text-[var(--color-text)] cursor-pointer">
              <Checkbox
                checked={Boolean(checked[item.key])}
                onCheckedChange={(v) =>
                  setChecked((prev) => ({ ...prev, [item.key]: Boolean(v) }))
                }
                aria-label={item.label}
                className="mt-0.5"
              />
              <span>{item.label}</span>
            </label>
          </li>
        ))}
      </ul>

      <div>
        <label
          htmlFor={rationaleId}
          className="block text-sm font-medium text-[var(--color-text)] mb-1.5"
        >
          Approval rationale <span aria-hidden="true">*</span>
        </label>
        <Textarea
          id={rationaleId}
          rows={3}
          aria-label="Approval rationale"
          aria-required="true"
          aria-invalid={showRationaleError}
          aria-describedby={`${rationaleId}-guidance${showRationaleError ? ` ${rationaleId}-error` : ''}`}
          minLength={RATIONALE_MIN_LENGTH}
          maxLength={RATIONALE_MAX_LENGTH}
          placeholder="Why is this provider being approved? (min 10 characters)"
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          onBlur={() => setRationaleTouched(true)}
        />
        <p id={`${rationaleId}-guidance`} className="mt-1 text-xs text-[var(--color-text-secondary)]">
          Use {RATIONALE_MIN_LENGTH} to {RATIONALE_MAX_LENGTH} characters. {rationaleLength}/{RATIONALE_MAX_LENGTH}
        </p>
        {showRationaleError && (
          <p id={`${rationaleId}-error`} role="alert" className="mt-1 text-xs text-[var(--color-text)]">
            {rationaleLength > RATIONALE_MAX_LENGTH
              ? `Shorten the rationale to ${RATIONALE_MAX_LENGTH} characters or fewer.`
              : `At least ${RATIONALE_MIN_LENGTH} characters required, excluding surrounding spaces.`}
          </p>
        )}
      </div>
    </div>
  );
}

export default VettingChecklist;
