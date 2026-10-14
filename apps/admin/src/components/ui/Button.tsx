import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-secondary)] focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)]',
        destructive: 'bg-red-600 text-white hover:bg-red-700',
        outline: 'border border-slate-300 bg-white text-slate-900 hover:bg-slate-50',
        secondary: 'bg-slate-200 text-slate-900 hover:bg-slate-300',
        ghost: 'hover:bg-slate-100 text-slate-900',
        link: 'text-[var(--color-primary)] underline-offset-4 hover:underline',
      },
      size: {
        default: 'min-h-11 px-4 py-2',
        sm: 'min-h-11 px-3 text-xs',
        lg: 'min-h-12 px-6',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

/*
 * Bug UX-1390: a variant's own text colour (ghost, outline and secondary use
 * text-slate-900; default and destructive use text-white) and a caller's text
 * colour (for example text-red-700 on a Delete button) are both single-class
 * utilities, so the one that shows is decided by Tailwind's stylesheet order
 * (alphabetical for colours), not by the order of the classes. text-red-700
 * and text-sky-700 lost to text-slate-900, so red warning buttons rendered
 * dark slate. When the caller passes a text colour, the variant's text colour
 * for the same modifier (none, hover:, focus:, ...) is dropped so only the
 * caller's colour is left. Text sizes (text-xs, text-sm, text-lg, ...),
 * alignment and wrapping utilities are not colours and never count. With no
 * caller text colour the class string is exactly what it was before.
 * Test: src/components/ui/__tests__/bug-ux-1390-button-caller-text-colour-wins.test.tsx
 */
const PALETTE_TEXT_COLOUR =
  /^text-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|mauve|olive|mist|taupe)-(?:50|[1-9]00|950)(?:\/\S+)?$/;
const KEYWORD_TEXT_COLOUR = /^text-(?:white|black|current|inherit|transparent)(?:\/\S+)?$/;
const ARBITRARY_TEXT = /^text-(?:\[(.+)\]|\((.+)\))(?:\/\S+)?$/;
const ARBITRARY_COLOUR_VALUE =
  /^(?:color:|#|var\(|--|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\()/i;

/** Returns the modifier prefix (e.g. '' or 'hover:') when the class is a text colour, otherwise null. */
function textColourModifier(token: string): string | null {
  let depth = 0;
  let cut = 0;
  for (let i = 0; i < token.length; i += 1) {
    const ch = token[i];
    if (ch === '[' || ch === '(') depth += 1;
    else if (ch === ']' || ch === ')') depth -= 1;
    else if (ch === ':' && depth === 0) cut = i + 1;
  }
  const utility = token.slice(cut).replace(/^!/, '').replace(/!$/, '');
  if (PALETTE_TEXT_COLOUR.test(utility) || KEYWORD_TEXT_COLOUR.test(utility)) {
    return token.slice(0, cut);
  }
  const arbitrary = ARBITRARY_TEXT.exec(utility);
  if (arbitrary && ARBITRARY_COLOUR_VALUE.test(arbitrary[1] ?? arbitrary[2] ?? '')) {
    return token.slice(0, cut);
  }
  return null;
}

function resolveButtonClassName(variantClasses: string, className: string): string {
  const callerColourModifiers = new Set<string>();
  for (const token of className.split(/\s+/)) {
    if (!token) continue;
    const modifier = textColourModifier(token);
    if (modifier !== null) callerColourModifiers.add(modifier);
  }
  if (callerColourModifiers.size === 0) return `${variantClasses} ${className}`;
  const kept = variantClasses.split(/\s+/).filter((token) => {
    if (!token) return false;
    const modifier = textColourModifier(token);
    return modifier === null || !callerColourModifiers.has(modifier);
  });
  return `${kept.join(' ')} ${className}`;
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant, size, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={resolveButtonClassName(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { buttonVariants };
