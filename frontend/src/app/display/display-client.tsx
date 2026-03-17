"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";

interface ContentItem {
  id: number;
  title: string;
  content_type: string;
  content_data: Record<string, unknown> | null;
  duration: number;
}

interface DisplayData {
  screen: { id: number; name: string; resolution: string; orientation: string };
  playlist: { id: number | null; name: string };
  content: ContentItem[];
}

const API = process.env.NEXT_PUBLIC_API_URL || "";

export function DisplayClient() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code") || "";
  const [data, setData] = useState<DisplayData | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchDisplay = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/signage/display/${code}`);
      if (!res.ok) {
        setError(res.status === 404 ? "Screen not found or inactive" : "Failed to load display");
        return;
      }
      const json = await res.json();
      setData(json);
      setError(null);
    } catch {
      setError("Cannot connect to server");
    }
  }, [code]);

  // Initial fetch + refresh every 60s
  useEffect(() => {
    fetchDisplay();
    const interval = setInterval(fetchDisplay, 60000);
    return () => clearInterval(interval);
  }, [fetchDisplay]);

  // Auto-rotate content
  useEffect(() => {
    if (!data?.content?.length) return;

    const item = data.content[currentIndex];
    const duration = (item?.duration || 15) * 1000;

    timerRef.current = setTimeout(() => {
      setTransitioning(true);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % data.content.length);
        setTransitioning(false);
      }, 600);
    }, duration);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [data, currentIndex]);

  // --- Error state ---
  if (error) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-black text-white">
        <div className="text-center">
          <div className="mb-4 text-6xl">📺</div>
          <h1 className="mb-2 text-2xl font-bold">{error}</h1>
          <p className="text-muted-foreground">Retrying automatically...</p>
        </div>
      </div>
    );
  }

  // --- Loading state ---
  if (!data) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-black text-white">
        <div className="text-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-border border-t-white mx-auto" />
          <p className="text-muted-foreground">Loading display...</p>
        </div>
      </div>
    );
  }

  // --- No content ---
  if (!data.content.length) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gradient-to-br from-gray-900 to-black text-white">
        <div className="text-center">
          <h1 className="mb-2 text-3xl font-bold">{data.screen.name}</h1>
          <p className="text-muted-foreground">No content scheduled</p>
        </div>
      </div>
    );
  }

  const item = data.content[currentIndex];

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black text-white">
      {/* Content area */}
      <div
        className={`absolute inset-0 flex items-center justify-center transition-opacity duration-500 ${transitioning ? "opacity-0" : "opacity-100"
          }`}
      >
        <ContentRenderer item={item} />
      </div>

      {/* Progress dots */}
      {data.content.length > 1 && (
        <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-2">
          {data.content.map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all duration-300 ${i === currentIndex ? "w-8 bg-white" : "w-2 bg-white/30"
                }`}
            />
          ))}
        </div>
      )}

      {/* Screen name watermark */}
      <div className="absolute top-4 right-4 text-xs text-white/20">
        {data.screen.name}
      </div>
    </div>
  );
}

// --- Content Renderers by Type ---

function ContentRenderer({ item }: { item: ContentItem }) {
  const d = (item.content_data || {}) as Record<string, unknown>;

  switch (item.content_type) {
    case "menu_items":
      return <MenuItemsSlide data={d} title={item.title} />;
    case "promotion":
      return <PromotionSlide data={d} title={item.title} />;
    case "daily_special":
      return <DailySpecialSlide data={d} title={item.title} />;
    case "image":
      return <ImageSlide data={d} />;
    case "custom_text":
    default:
      return <CustomTextSlide data={d} title={item.title} />;
  }
}

function MenuItemsSlide({ data, title }: { data: Record<string, unknown>; title: string }) {
  const items = (data.items as Array<{ name: string; price: number; description?: string }>) || [];
  const bgColor = (data.bg_color as string) || "#111827";

  return (
    <div className="flex h-full w-full flex-col p-12" style={{ backgroundColor: bgColor }}>
      <h1 className="mb-8 text-center text-5xl font-bold tracking-tight">{title}</h1>
      <div className="grid flex-1 grid-cols-2 gap-6 overflow-hidden">
        {items.map((item, i) => (
          <div key={i} className="flex items-start justify-between rounded-xl bg-white/5 p-6">
            <div className="flex-1">
              <h3 className="text-2xl font-semibold">{item.name}</h3>
              {item.description && (
                <p className="mt-1 text-lg text-muted-foreground">{item.description}</p>
              )}
            </div>
            <span className="ml-4 text-2xl font-bold text-amber-400">
              &euro;{item.price?.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PromotionSlide({ data, title }: { data: Record<string, unknown>; title: string }) {
  const subtitle = (data.subtitle as string) || "";
  const discount = (data.discount as string) || "";
  const bgColor = (data.bg_color as string) || "#7c3aed";
  const validUntil = (data.valid_until as string) || "";

  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center p-16 text-center"
      style={{ backgroundColor: bgColor }}
    >
      {discount && (
        <div className="mb-6 rounded-full bg-white/20 px-8 py-3 text-3xl font-bold backdrop-blur">
          {discount}
        </div>
      )}
      <h1 className="mb-4 text-6xl font-black tracking-tight">{title}</h1>
      {subtitle && <p className="mb-8 text-2xl text-white/80">{subtitle}</p>}
      {validUntil && (
        <p className="text-lg text-white/50">Valid until {validUntil}</p>
      )}
    </div>
  );
}

function DailySpecialSlide({ data, title }: { data: Record<string, unknown>; title: string }) {
  const dish = (data.dish as string) || title;
  const description = (data.description as string) || "";
  const price = data.price as number | undefined;
  const chef = (data.chef as string) || "";

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-amber-900 to-amber-950 p-16 text-center">
      <p className="mb-4 text-xl uppercase tracking-[0.3em] text-amber-400">Today&apos;s Special</p>
      <h1 className="mb-4 text-6xl font-black">{dish}</h1>
      {description && <p className="mb-6 max-w-2xl text-2xl text-white/70">{description}</p>}
      {price != null && (
        <div className="mb-4 text-4xl font-bold text-amber-400">&euro;{price.toFixed(2)}</div>
      )}
      {chef && <p className="text-lg text-white/40">by Chef {chef}</p>}
    </div>
  );
}

function ImageSlide({ data }: { data: Record<string, unknown> }) {
  const url = (data.url as string) || (data.image_url as string) || "";
  const alt = (data.alt as string) || "Display image";

  if (!url) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-card">
        <p className="text-muted-foreground">No image configured</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} className="h-full w-full object-cover" />
    </div>
  );
}

function CustomTextSlide({ data, title }: { data: Record<string, unknown>; title: string }) {
  const body = (data.body as string) || (data.text as string) || "";
  const bgColor = (data.bg_color as string) || "#1e293b";
  const fontSize = (data.font_size as string) || "text-4xl";

  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center p-16 text-center"
      style={{ backgroundColor: bgColor }}
    >
      <h1 className="mb-6 text-5xl font-bold">{title}</h1>
      <p className={`max-w-4xl leading-relaxed text-white/80 ${fontSize}`}>{body}</p>
    </div>
  );
}
