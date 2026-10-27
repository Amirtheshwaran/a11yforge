import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "rounded-md border px-4 py-3 text-[13px]",
  {
    variants: {
      variant: {
        default: "border-line bg-transparent text-inkdim",
        destructive: "border-ink bg-transparent font-semibold text-ink",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>): React.JSX.Element {
  return (
    <div
      data-slot="alert"
      role={variant === "destructive" ? "alert" : undefined}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element {
  return (
    <div
      data-slot="alert-title"
      className={cn("mb-1 font-mono text-[12px] font-bold uppercase tracking-[0.06em] text-ink", className)}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element {
  return (
    <div data-slot="alert-description" className={cn("text-inkdim", className)} {...props} />
  );
}

export { Alert, AlertTitle, AlertDescription };
