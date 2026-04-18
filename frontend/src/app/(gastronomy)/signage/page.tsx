"use client";

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import {
  Monitor,
  Plus,
  Trash2,
  Play,
  Film,
  Layout,
  Copy,
  Check,
  ToggleLeft,
  ToggleRight,
  Clock,
  Wifi,
  WifiOff,
  Settings,
} from "lucide-react";

interface Screen {
  id: number;
  name: string;
  location: string | null;
  screen_code: string;
  resolution: string;
  orientation: string;
  is_active: boolean;
  current_playlist_id: number | null;
  last_ping_at: string | null;
  created_at: string;
}

interface Content {
  id: number;
  title: string;
  content_type: string;
  content_data_json: Record<string, unknown> | null;
  duration_seconds: number;
  is_active: boolean;
  created_at: string;
}

interface Playlist {
  id: number;
  name: string;
  items_json: { content_id: number; duration_override?: number }[] | null;
  schedule_json: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
}

type Tab = "screens" | "content" | "playlists";

const CONTENT_TYPES = [
  { value: "menu_items", label: "Menu Items" },
  { value: "promotion", label: "Promotion" },
  { value: "daily_special", label: "Daily Special" },
  { value: "custom_text", label: "Custom Text" },
  { value: "image", label: "Image" },
];

const CONTENT_TYPE_COLORS: Record<string, string> = {
  menu_items: "bg-blue-500/10 text-blue-400",
  promotion: "bg-purple-500/10 text-purple-400",
  daily_special: "bg-amber-500/10 text-amber-400",
  custom_text: "bg-emerald-500/10 text-emerald-400",
  image: "bg-cyan-500/10 text-cyan-400",
};

export default function SignagePage() {
  const [tab, setTab] = useState<Tab>("screens");
  const [loading, setLoading] = useState(true);
  const [screens, setScreens] = useState<Screen[]>([]);
  const [content, setContent] = useState<Content[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [showAddScreen, setShowAddScreen] = useState(false);
  const [showAddContent, setShowAddContent] = useState(false);
  const [showAddPlaylist, setShowAddPlaylist] = useState(false);
  const [newScreen, setNewScreen] = useState({ name: "", location: "", resolution: "1920x1080", orientation: "landscape" });
  const [newContent, setNewContent] = useState({ title: "", content_type: "menu_items", duration_seconds: "15" });
  const [newPlaylist, setNewPlaylist] = useState({ name: "" });
  const [copied, setCopied] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [sRes, cRes, pRes] = await Promise.all([
        api.get("/signage/screens"),
        api.get("/signage/content"),
        api.get("/signage/playlists"),
      ]);
      setScreens(sRes.data);
      setContent(cRes.data);
      setPlaylists(pRes.data);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const copyCode = (code: string) => {
    const text = `${window.location.origin}/display/${code}`;
    navigator.clipboard.writeText(text).catch(() => {
      // Fallback for non-HTTPS or permission-denied contexts
      const el = document.createElement("textarea");
      el.value = text;
      el.style.cssText = "position:fixed;opacity:0;";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    });
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleAddScreen = async () => {
    if (!newScreen.name) return;
    try {
      await api.post("/signage/screens", newScreen);
      setNewScreen({ name: "", location: "", resolution: "1920x1080", orientation: "landscape" });
      setShowAddScreen(false);
      fetchData();
    } catch {}
  };

  const handleAddContent = async () => {
    if (!newContent.title) return;
    try {
      await api.post("/signage/content", {
        title: newContent.title,
        content_type: newContent.content_type,
        duration_seconds: parseInt(newContent.duration_seconds || "15"),
      });
      setNewContent({ title: "", content_type: "menu_items", duration_seconds: "15" });
      setShowAddContent(false);
      fetchData();
    } catch {}
  };

  const handleAddPlaylist = async () => {
    if (!newPlaylist.name) return;
    try {
      await api.post("/signage/playlists", { name: newPlaylist.name });
      setNewPlaylist({ name: "" });
      setShowAddPlaylist(false);
      fetchData();
    } catch {}
  };

  const handleDeleteScreen = async (id: number) => { try { await api.delete(`/signage/screens/${id}`); fetchData(); } catch {} };
  const handleDeleteContent = async (id: number) => { try { await api.delete(`/signage/content/${id}`); fetchData(); } catch {} };
  const handleDeletePlaylist = async (id: number) => { try { await api.delete(`/signage/playlists/${id}`); fetchData(); } catch {} };

  const handleAssignPlaylist = async (screenId: number, playlistId: number) => {
    try { await api.put(`/signage/screens/${screenId}`, { current_playlist_id: playlistId }); fetchData(); } catch {}
  };

  if (loading) {
    return <div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-DEFAULT" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Monitor className="h-7 w-7 text-accent-DEFAULT" /> Digital Signage
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Manage screens, content, and playlists</p>
        </div>
        <div className="flex gap-2">
          {tab === "screens" && <button onClick={() => setShowAddScreen(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-DEFAULT text-white text-sm font-medium"><Plus className="h-4 w-4" /> Add Screen</button>}
          {tab === "content" && <button onClick={() => setShowAddContent(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-DEFAULT text-white text-sm font-medium"><Plus className="h-4 w-4" /> Add Content</button>}
          {tab === "playlists" && <button onClick={() => setShowAddPlaylist(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-DEFAULT text-white text-sm font-medium"><Plus className="h-4 w-4" /> Add Playlist</button>}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Screens", value: screens.length, icon: Monitor, color: "text-blue-400" },
          { label: "Online", value: screens.filter((s) => s.last_ping_at && (Date.now() - new Date(s.last_ping_at).getTime()) < 60000).length, icon: Wifi, color: "text-emerald-400" },
          { label: "Content", value: content.length, icon: Film, color: "text-purple-400" },
          { label: "Playlists", value: playlists.length, icon: Play, color: "text-amber-400" },
        ].map((s) => (
          <div key={s.label} className="bg-card rounded-xl border border-border p-3 flex items-center gap-3">
            <s.icon className={`h-5 w-5 ${s.color}`} /><div><p className="text-lg font-bold text-foreground">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
          </div>
        ))}
      </div>

      <div className="flex gap-1 bg-card rounded-xl border border-border p-1">
        {([
          { key: "screens" as Tab, label: "Screens", icon: Monitor },
          { key: "content" as Tab, label: "Content", icon: Film },
          { key: "playlists" as Tab, label: "Playlists", icon: Play },
        ]).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.key ? "bg-accent-DEFAULT text-white shadow" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* Screens Tab */}
      {tab === "screens" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {screens.map((s) => (
            <div key={s.id} className={`bg-card rounded-2xl border border-border p-5 space-y-3 ${!s.is_active ? "opacity-50" : ""}`}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground">{s.name}</h3>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.is_active ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>{s.is_active ? "Active" : "Inactive"}</span>
              </div>
              {s.location && <p className="text-xs text-muted-foreground">{s.location}</p>}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{s.resolution}</span>
                <span>{s.orientation}</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => copyCode(s.screen_code)} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-muted text-xs font-mono text-foreground hover:bg-muted/80">
                  {s.screen_code.slice(0, 12)}...
                  {copied === s.screen_code ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
                </button>
              </div>
              <div className="flex items-center justify-between pt-1">
                <select
                  value={s.current_playlist_id || 0}
                  onChange={(e) => handleAssignPlaylist(s.id, parseInt(e.target.value))}
                  className="px-2 py-1 rounded-lg bg-muted border border-border text-xs text-foreground"
                >
                  <option value={0}>No playlist</option>
                  {playlists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button onClick={() => handleDeleteScreen(s.id)} className="p-1 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
          {screens.length === 0 && <div className="col-span-full bg-card rounded-2xl border border-border p-10 text-center text-muted-foreground text-sm">No screens configured</div>}
        </div>
      )}

      {/* Content Tab */}
      {tab === "content" && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          {content.length > 0 ? (
            <div className="divide-y divide-border/50">
              {content.map((c) => (
                <div key={c.id} className={`px-6 py-4 flex items-center justify-between hover:bg-muted/20 transition-colors ${!c.is_active ? "opacity-50" : ""}`}>
                  <div className="flex items-center gap-4">
                    <span className="font-medium text-foreground text-sm">{c.title}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CONTENT_TYPE_COLORS[c.content_type] || "bg-muted text-muted-foreground"}`}>
                      {CONTENT_TYPES.find((t) => t.value === c.content_type)?.label || c.content_type}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> {c.duration_seconds}s</span>
                    <button onClick={() => handleDeleteContent(c.id)} className="p-1 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          ) : <div className="p-10 text-center text-muted-foreground text-sm">No content items</div>}
        </div>
      )}

      {/* Playlists Tab */}
      {tab === "playlists" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {playlists.map((p) => (
            <div key={p.id} className={`bg-card rounded-2xl border border-border p-5 space-y-3 ${!p.is_active ? "opacity-50" : ""}`}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground flex items-center gap-2"><Play className="h-4 w-4 text-accent-DEFAULT" /> {p.name}</h3>
                <button onClick={() => handleDeletePlaylist(p.id)} className="p-1 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              <p className="text-xs text-muted-foreground">{p.items_json?.length || 0} content item(s)</p>
            </div>
          ))}
          {playlists.length === 0 && <div className="col-span-full bg-card rounded-2xl border border-border p-10 text-center text-muted-foreground text-sm">No playlists yet</div>}
        </div>
      )}

      {/* Add Screen Modal */}
      {showAddScreen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-bold text-foreground">Add Screen</h2>
            <input type="text" placeholder="Screen name" value={newScreen.name} onChange={(e) => setNewScreen({ ...newScreen, name: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50" />
            <input type="text" placeholder="Location (e.g. Entrance)" value={newScreen.location} onChange={(e) => setNewScreen({ ...newScreen, location: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50" />
            <div className="grid grid-cols-2 gap-3">
              <select value={newScreen.resolution} onChange={(e) => setNewScreen({ ...newScreen, resolution: e.target.value })} className="px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground focus:outline-none">
                <option value="1920x1080">1920x1080</option>
                <option value="3840x2160">3840x2160</option>
                <option value="1080x1920">1080x1920</option>
              </select>
              <select value={newScreen.orientation} onChange={(e) => setNewScreen({ ...newScreen, orientation: e.target.value })} className="px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground focus:outline-none">
                <option value="landscape">Landscape</option>
                <option value="portrait">Portrait</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAddScreen(false)} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground">Cancel</button>
              <button onClick={handleAddScreen} className="px-4 py-2 rounded-xl bg-accent-DEFAULT text-white text-sm font-medium">Add Screen</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Content Modal */}
      {showAddContent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-bold text-foreground">Add Content</h2>
            <input type="text" placeholder="Content title" value={newContent.title} onChange={(e) => setNewContent({ ...newContent, title: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50" />
            <select value={newContent.content_type} onChange={(e) => setNewContent({ ...newContent, content_type: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground focus:outline-none">
              {CONTENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input type="number" placeholder="Duration (seconds)" value={newContent.duration_seconds} onChange={(e) => setNewContent({ ...newContent, duration_seconds: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAddContent(false)} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground">Cancel</button>
              <button onClick={handleAddContent} className="px-4 py-2 rounded-xl bg-accent-DEFAULT text-white text-sm font-medium">Add Content</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Playlist Modal */}
      {showAddPlaylist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-bold text-foreground">New Playlist</h2>
            <input type="text" placeholder="Playlist name" value={newPlaylist.name} onChange={(e) => setNewPlaylist({ ...newPlaylist, name: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAddPlaylist(false)} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground">Cancel</button>
              <button onClick={handleAddPlaylist} className="px-4 py-2 rounded-xl bg-accent-DEFAULT text-white text-sm font-medium">Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
