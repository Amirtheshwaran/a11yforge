import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[4px] text-sm font-medium transition-opacity outline-none focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-ink text-canvas font-semibold hover:opacity-90",
        secondary:
          "border border-line bg-raised text-ink hover:bg-hover hover:border-inkdim",
        ghost: "text-inkdim hover:text-ink hover:bg-raised",
        outline:
          "border border-line bg-transparent text-ink hover:bg-hover",
        link: "text-ink underline underline-offset-4 hover:text-inkdim",
      },
      size: {
        default: "h-9 px-3",
        sm: "h-8 px-3 text-[13px]",
        lg: "h-12 px-6 text-base font-semibold",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }): React.JSX.Element {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
