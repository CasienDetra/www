import type { blogConfig } from "@/lib/types";
import { RiArrowRightUpLine } from "@remixicon/react";

export function FeaturedBlogCard({ item }: { item: blogConfig }) {
  return (
    <a href={`/blog/${item.id}/`} className="group flex items-start gap-3 p-3 px-5 border-l-3 border-l-foreground/10 hover:border-l-secondary-foreground/60 border border-border/50 hover:border-border bg-background hover:bg-muted/80 animation select-none">
      <div className="flex-1 min-w-0">
        <span className="text-xs text-muted-foreground">{item.data.category}</span>

        <h3 className="mt-2 text-lg font-medium text-foreground/90 leading-snug line-clamp-1">{item.data.title}</h3>

        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-1">{item.data.description}</p>
      </div>

      <RiArrowRightUpLine className="mt-1 size-4 shrink-0 text-muted-foreground/60 group-hover:text-foreground group-hover:-translate-y-0.5 group-hover:translate-x-0.5 animation" />
    </a>
  );
}
