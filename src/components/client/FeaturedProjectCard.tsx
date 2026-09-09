"use client";

import { useEffect, useRef, useState } from "react";
import type { projectConfig } from "@/lib/types";

type ProjectWithVideo = projectConfig & { heroImage?: string; videoId?: string | null };

function VideoCard({ item, videoId }: { item: projectConfig; videoId: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0.5 }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const shouldPlay = isVisible && !isHovered;

  const embedUrl = `https://player.vimeo.com/video/${videoId}?badge=0&autopause=0&player_id=0&app_id=58479&autoplay=1&muted=1&loop=1&controls=0`;

  return (
    <div
      ref={containerRef}
      className="group block bg-muted border border-border overflow-hidden hover:border-secondary-foreground/30 relative hover:bg-background active:scale-100 hover:scale-102 animation"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <a href={`/project/${item.id}`} className="block">
        <div className="aspect-4/3 overflow-hidden">
          <iframe
            ref={iframeRef}
            src={shouldPlay ? embedUrl : `https://player.vimeo.com/video/${videoId}?badge=0&autopause=0&player_id=0&app_id=58479&muted=1&controls=0`}
            title={`${item.data.title} demo video`}
            frameBorder="0"
            allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            className="w-full h-full object-cover pointer-events-none"
            loading="lazy"
          />
        </div>

        <div className="p-4 bg-muted group-hover:bg-card animation z-10">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">{item.data.category}</span>

          <span className="mt-2 text-xl font-medium leading-snug text-foreground/90 group-hover:text-foreground/90 animation line-clamp-1">{item.data.title}</span>

          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{item.data.description}</p>

          {item.data.tags && item.data.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {item.data.tags.slice(0, 3).map((keyword) => (
                <span key={keyword} className="text-xs px-2 py-0.5 bg-background group-hover:bg-muted text-muted-foreground/80 rounded-sm border border-border animation">
                  {keyword}
                </span>
              ))}
            </div>
          )}
        </div>
      </a>
    </div>
  );
}

export function FeaturedProjectCard({ items }: { items: ProjectWithVideo[] }) {
  const recentProjects = items.slice(0, 3);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 select-none">
      {recentProjects.map((item) => {
        if (item.videoId && !item.heroImage) {
          return <VideoCard key={item.id} item={item} videoId={item.videoId} />;
        }

        const firstImage = item.heroImage || null;

        return (
          <a key={item.id} href={`/project/${item.id}`} className="group block bg-muted border border-border overflow-hidden hover:border-secondary-foreground/30 relative hover:bg-background active:scale-100 hover:scale-102 animation">
            {firstImage && (
              <div className="aspect-4/3 overflow-hidden">
                <img loading="lazy" width={1200} src={firstImage} alt={item.data.title} className="w-full h-full object-cover grayscale-100 group-hover:grayscale-0 animation" />
              </div>
            )}

            <div className="p-4 bg-muted group-hover:bg-card animation z-10">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">{item.data.category}</span>

              <span className="mt-2 text-xl font-medium leading-snug text-foreground/90 group-hover:text-foreground/90 animation line-clamp-1">{item.data.title}</span>

              <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{item.data.description}</p>

              {item.data.tags && item.data.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {item.data.tags.slice(0, 3).map((keyword) => (
                    <span key={keyword} className="text-xs px-2 py-0.5 bg-background group-hover:bg-muted text-muted-foreground/80 rounded-sm border border-border animation">
                      {keyword}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </a>
        );
      })}
    </div>
  );
}