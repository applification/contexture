import * as React from 'react';

import { cn } from '@/lib/utils';

const segmentedControlSelectedClass =
  'bg-primary/20 text-primary hover:bg-primary/25 hover:text-primary';

const segmentedControlActiveStateClass =
  'data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:hover:bg-primary/25 data-[state=active]:hover:text-primary';

const segmentedControlItemClass =
  'text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary';

const ButtonGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    orientation?: 'horizontal' | 'vertical';
  }
>(({ className, orientation = 'horizontal', ...props }, ref) => (
  <div
    ref={ref}
    data-slot="button-group"
    data-orientation={orientation}
    className={cn(
      'inline-flex items-stretch rounded-md border border-input bg-background shadow-sm',
      orientation === 'vertical' ? 'flex-col' : 'flex-row',
      className,
    )}
    {...props}
  />
));
ButtonGroup.displayName = 'ButtonGroup';

const ButtonGroupSeparator = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    orientation?: 'horizontal' | 'vertical';
  }
>(({ className, orientation = 'vertical', ...props }, ref) => (
  <div
    ref={ref}
    aria-hidden="true"
    data-slot="button-group-separator"
    className={cn('shrink-0 bg-border', orientation === 'vertical' ? 'w-px' : 'h-px', className)}
    {...props}
  />
));
ButtonGroupSeparator.displayName = 'ButtonGroupSeparator';

const ButtonGroupText = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="button-group-text"
      className={cn('flex items-center px-3 text-sm text-muted-foreground', className)}
      {...props}
    />
  ),
);
ButtonGroupText.displayName = 'ButtonGroupText';

export {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
  segmentedControlActiveStateClass,
  segmentedControlItemClass,
  segmentedControlSelectedClass,
};
