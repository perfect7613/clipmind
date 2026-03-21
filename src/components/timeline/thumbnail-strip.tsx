"use client";

import { useEffect, useState } from "react";

interface ThumbnailStripProps {
  clipId: string;
  durationS: number;
  currentTime: number;
  onSeek: (time: number) => void;
}

interface Thumbnail {
  index: number;
  url: string;
}

export function ThumbnailStrip({ clipId, durationS, currentTime, onSeek }: ThumbnailStripProps) {
  const [thumbnails, setThumbnails] = useState<Thumbnail[]>([]);

  useEffect(() => {
    fetch(`/api/clips/${clipId}/thumbnails`)
      .then((r) => r.json())
      .then((data) => {
        if (data.thumbnails) setThumbnails(data.thumbnails);
      })
      .catch(() => {});
  }, [clipId]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    onSeek(pct * durationS);
  };

  const playheadPct = durationS > 0 ? (currentTime / durationS) * 100 : 0;

  return (
    <div className="relative h-16 bg-muted rounded overflow-hidden cursor-pointer" onClick={handleClick}>
      {/* Thumbnail images */}
      <div className="flex h-full">
        {thumbnails.length > 0 ? (
          thumbnails.map((thumb) => (
            <img
              key={thumb.index}
              src={thumb.url}
              alt=""
              className="h-full object-cover flex-shrink-0"
              style={{ width: `${100 / thumbnails.length}%` }}
              draggable={false}
            />
          ))
        ) : (
          <div className="flex items-center justify-center w-full text-xs text-muted-foreground">
            Loading thumbnails...
          </div>
        )}
      </div>

      {/* Playhead */}
      <div
        className="absolute top-0 w-0.5 h-full bg-primary z-10 pointer-events-none"
        style={{ left: `${playheadPct}%` }}
      />
    </div>
  );
}
