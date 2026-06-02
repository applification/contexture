import * as LabelPrimitive from '@radix-ui/react-label';
import type * as React from 'react';
import { cn } from '@/lib/utils';

function Field({ className, ...props }: React.ComponentProps<'div'>): React.ReactNode {
  return (
    <div
      data-slot="field"
      className={cn('grid gap-1.5 data-[invalid=true]:text-destructive', className)}
      {...props}
    />
  );
}

function FieldGroup({ className, ...props }: React.ComponentProps<'div'>): React.ReactNode {
  return <div data-slot="field-group" className={cn('grid gap-3', className)} {...props} />;
}

function FieldLabel({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>): React.ReactNode {
  return (
    <LabelPrimitive.Root
      data-slot="field-label"
      className={cn('text-sm font-medium leading-none text-foreground', className)}
      {...props}
    />
  );
}

function FieldDescription({ className, ...props }: React.ComponentProps<'p'>): React.ReactNode {
  return (
    <p
      data-slot="field-description"
      className={cn('text-xs leading-snug text-muted-foreground', className)}
      {...props}
    />
  );
}

interface FieldErrorProps extends React.ComponentProps<'div'> {
  errors?: Array<{ message?: string } | undefined>;
}

function FieldError({ className, errors, children, ...props }: FieldErrorProps): React.ReactNode {
  const messages = errors
    ?.map((error) => error?.message)
    .filter((message): message is string => Boolean(message));
  const body = messages && messages.length > 0 ? messages.join(' ') : children;

  if (!body) return null;

  return (
    <div
      data-slot="field-error"
      className={cn('text-xs font-medium leading-snug text-destructive', className)}
      {...props}
    >
      {body}
    </div>
  );
}

export { Field, FieldDescription, FieldError, FieldGroup, FieldLabel };
