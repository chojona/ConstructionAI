import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-[var(--size-target-min)] min-w-[var(--size-target-min)] items-center justify-center gap-[var(--space-2)] whitespace-nowrap rounded-[var(--radius-md)] border border-solid px-[18px] text-[length:var(--font-size-md)] font-semibold leading-[var(--font-line-height-md)] shadow-[0_1px_2px_0_rgba(16,24,40,0.05)] transition-colors disabled:cursor-not-allowed disabled:border-[var(--color-border-default)] disabled:bg-[var(--color-bg-disabled)] disabled:text-[var(--color-text-disabled)] disabled:shadow-none aria-disabled:cursor-not-allowed aria-disabled:border-[var(--color-border-default)] aria-disabled:bg-[var(--color-bg-disabled)] aria-disabled:text-[var(--color-text-disabled)] aria-disabled:shadow-none",
  {
    variants: {
      variant: {
        default: "border-[var(--color-bg-brand)] bg-[var(--color-bg-brand)] text-[var(--color-text-on-brand)] hover:border-[var(--color-bg-brand-hover)] hover:bg-[var(--color-bg-brand-hover)]",
        outline: "button-outline border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] text-[var(--color-text-label)] hover:bg-[var(--color-bg-hover)] disabled:border-[var(--color-border-default)] disabled:bg-[var(--color-bg-surface)] disabled:shadow-[0_1px_2px_0_rgba(16,24,40,0.05)] aria-disabled:border-[var(--color-border-default)] aria-disabled:bg-[var(--color-bg-surface)] aria-disabled:shadow-[0_1px_2px_0_rgba(16,24,40,0.05)]",
        ghost: "border-transparent bg-transparent text-[var(--color-text-secondary)] shadow-none hover:bg-[var(--color-bg-hover)]",
      },
      size: {
        default: "h-[var(--size-target-min)] px-[18px]",
        sm: "h-[var(--size-target-min)] px-[18px]",
        lg: "h-12 px-[22px]",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Component = asChild ? Slot : "button";
    return <Component ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />;
  },
);
Button.displayName = "Button";

export { buttonVariants };
