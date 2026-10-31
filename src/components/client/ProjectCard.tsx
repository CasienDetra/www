"use client";

import type { projectConfig } from "@/lib/types";

interface ProjectCardProps {
  item: projectConfig & { images?: string[]; videoId?: string | null };
}

function repoLabel(item: projectConfig) {
  return item.links?.[0]?.url.replace(/^https?:\/\//, "") ?? item.data.title;
}

export function ProjectCard({ item }: ProjectCardProps) {
  const firstImage = item.images?.[0] ?? null;
  const hasVideo = item.videoId && !firstImage;

  return (
    <a href={`/project/${item.id}/`} className="group flex h-full flex-col bg-muted border border-border/50 overflow-hidden hover:border-foreground/20 hover:bg-card select-none">
      {hasVideo ? (
        <div className="aspect-4/3 overflow-hidden border-b border-border">
          <iframe
            src={`https://player.vimeo.com/video/${item.videoId}?badge=0&autopause=0&player_id=0&app_id=58479&autoplay=1&muted=1&loop=1&controls=0`}
            title={`${item.data.title} demo video`}
            frameBorder="0"
            allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            className="w-full h-full object-cover pointer-events-none"
            loading="lazy"
          />
        </div>
      ) : firstImage ? (
        <div className="aspect-4/3 overflow-hidden border-b border-border">
          <img loading="lazy" width={1200} src={firstImage} alt={item.data.title} className="w-full h-full object-cover grayscale-100 group-hover:grayscale-0 animation" />
        </div>
      ) : (
        <div className="aspect-4/3 flex items-end border-b border-border bg-background p-4 font-mono">
          <span className="text-xs text-muted-foreground/70 break-all">{repoLabel(item)}</span>
        </div>
      )}

      <div className="flex-1 p-3 bg-muted group-hover:bg-card animation">
        <span className="text-xs text-muted-foreground">{item.data.category}</span>

        <h3 className="mt-2 text-xl leading-snug text-foreground/80 group-hover:text-foreground/90 animation line-clamp-1">{item.data.title}</h3>

        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{item.data.description}</p>

        {item.data.tags && item.data.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {item.data.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="text-xs px-2 py-0.5 bg-muted/60 text-muted-foreground/80 rounded-sm border border-border">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </a>
  );
}
