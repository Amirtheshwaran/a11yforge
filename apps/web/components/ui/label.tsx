"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";

import { cn } from "@/lib/utils";

function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>): React.JSX.Element {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "font-mono text-[11px] font-semibold uppercase leading-[14px] tracking-[0.08em] text-ink",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
