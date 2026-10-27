import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-2 rounded-[4px] border border-linesoft bg-raised px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.02em] text-inkdim",
  {
    variants: {
      variant: {
        default: "border-linesoft text-inkdim",
        solid: "border-ink bg-ink font-bold text-canvas",
        outline: "border-line bg-transparent text-ink",
        faint: "border-linesoft text-inkfaint",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>): React.JSX.Element {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
