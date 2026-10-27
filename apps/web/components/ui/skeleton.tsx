import * as React from "react";

import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-[4px] bg-hover", className)}
      {...props}
    />
  );
}

export { Skeleton };
