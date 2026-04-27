import * as React from 'react';

type DivProps = React.HTMLAttributes<HTMLDivElement>;

export const Card = React.forwardRef<HTMLDivElement, DivProps>(
  ({ className = '', ...props }, ref) => (
    <div
      ref={ref}
      className={`rounded-lg border border-slate-200 bg-white shadow-sm ${className}`}
      {...props}
    />
  )
);
Card.displayName = 'Card';

export const CardHeader = React.forwardRef<HTMLDivElement, DivProps>(
  ({ className = '', ...props }, ref) => (
    <div ref={ref} className={`flex flex-col space-y-1.5 p-6 ${className}`} {...props} />
  )
);
CardHeader.displayName = 'CardHeader';

export const CardTitle = React.forwardRef<HTMLDivElement, DivProps>(
  ({ className = '', ...props }, ref) => (
    <div
      ref={ref}
      className={`text-lg font-semibold leading-none tracking-tight text-slate-900 ${className}`}
      {...props}
    />
  )
);
CardTitle.displayName = 'CardTitle';

export const CardDescription = React.forwardRef<HTMLDivElement, DivProps>(
  ({ className = '', ...props }, ref) => (
    <div ref={ref} className={`text-sm text-slate-500 ${className}`} {...props} />
  )
);
CardDescription.displayName = 'CardDescription';

export const CardContent = React.forwardRef<HTMLDivElement, DivProps>(
  ({ className = '', ...props }, ref) => (
    <div ref={ref} className={`p-6 pt-0 ${className}`} {...props} />
  )
);
CardContent.displayName = 'CardContent';

export const CardFooter = React.forwardRef<HTMLDivElement, DivProps>(
  ({ className = '', ...props }, ref) => (
    <div ref={ref} className={`flex items-center p-6 pt-0 ${className}`} {...props} />
  )
);
CardFooter.displayName = 'CardFooter';
