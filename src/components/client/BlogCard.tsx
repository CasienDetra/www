import type { blogConfig } from "@/lib/types";

import { RiArrowRightUpLine } from "@remixicon/react";
import { format, parse } from "date-fns";

export function BlogCard({ item }: { item: blogConfig }) {
  const parsedDate = parse(item.data.date, "dd-MM-yyyy", new Date());
  const formattedDate = format(parsedDate, "MMM d, yyyy");

  return (
    <a href={`/blog/${item.id}/`} className="group flex flex-col gap-2 p-3 border border-border/50 hover:border-border hover:bg-muted animation select-none">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{item.data.category}</span>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm text-muted-foreground">{formattedDate}</span>
          <RiArrowRightUpLine className="size-4 text-muted-foreground/60 group-hover:text-foreground animation" />
        </div>
      </div>
      <div className="flex flex-col items-start justify-start px-1">
        <h3 className="text-lg font-medium leading-snug text-foreground/90 line-clamp-1">{item.data.title}</h3>
        <p className="mt-0.5 text-sm text-muted-foreground line-clamp-1">{item.data.description}</p>
      </div>
    </a>
  );
}
