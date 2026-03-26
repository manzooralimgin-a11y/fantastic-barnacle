"use client";

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import {
  Palette,
  Plus,
  Trash2,
  FileText,
  Layout,
  Globe,
  Check,
  Rocket,
  Eye,
  Edit2,
  Copy,
} from "lucide-react";

interface MenuTemplate {
  id: number;
  name: string;
  description: string | null;
  layout_type: string;
  template_config_json: Record<string, unknown> | null;
  is_system: boolean;
  created_at: string;
}

interface MenuDesign {
  id: number;
  name: string;
  template_id: number | null;
  design_data_json: Record<string, unknown> | null;
  translations_json: Record<string, unknown> | null;
  status: string;
  language: string;
  created_at: string;
  updated_at: string | null;
}

const LAYOUT_TYPES = [
  { value: "single_page", label: "Single Page", icon: "\u{1F4C4}" },
  { value: "bifold", label: "Bifold", icon: "\u{1F4D6}" },
  { value: "trifold", label: "Trifold", icon: "\u{1F4D1}" },
  { value: "digital", label: "Digital Screen", icon: "\u{1F4FA}" },
];

const LANGUAGES = [
  { value: "de", label: "Deutsch" },
  { value: "en", label: "English" },
  { value: "fr", label: "Fran\u00E7ais" },
  { value: "it", label: "Italiano" },
];

export default function MenuDesignerPage() {
  const [templates, setTemplates] = useState<MenuTemplate[]>([]);
  const [designs, setDesigns] = useState<MenuDesign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [showAddDesign, setShowAddDesign] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ name: "", description: "", layout_type: "single_page" });
  const [newDesign, setNewDesign] = useState({ name: "", template_id: 0, language: "de" });

  const fetchData = useCallback(async () => {
    try {
      const [tRes, dRes] = await Promise.all([
        api.get("/menu-designer/templates"),
        api.get("/menu-designer/designs"),
      ]);
      setTemplates(tRes.data);
      setDesigns(dRes.data);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAddTemplate = async () => {
    if (!newTemplate.name) return;
    try {
      await api.post("/menu-designer/templates", newTemplate);
      setNewTemplate({ name: "", description: "", layout_type: "single_page" });
      setShowAddTemplate(false);
      fetchData();
    } catch {}
  };

  const handleAddDesign = async () => {
    if (!newDesign.name) return;
    try {
      await api.post("/menu-designer/designs", {
        name: newDesign.name,
        template_id: newDesign.template_id || null,
        language: newDesign.language,
      });
      setNewDesign({ name: "", template_id: 0, language: "de" });
      setShowAddDesign(false);
      fetchData();
    } catch {}
  };

  const handlePublish = async (id: number) => {
    try { await api.post(`/menu-designer/designs/${id}/publish`); fetchData(); } catch {}
  };

  const handleDeleteDesign = async (id: number) => {
    try { await api.delete(`/menu-designer/designs/${id}`); fetchData(); } catch {}
  };

  const handleDeleteTemplate = async (id: number) => {
    try { await api.delete(`/menu-designer/templates/${id}`); fetchData(); } catch {}
  };

  if (loading) {
    return <div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-DEFAULT" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Palette className="h-7 w-7 text-accent-DEFAULT" />
            Menu Designer
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Create and manage printable and digital menus</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAddTemplate(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted text-foreground hover:bg-muted/80 text-sm font-medium">
            <Layout className="h-4 w-4" /> New Template
          </button>
          <button onClick={() => setShowAddDesign(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-DEFAULT text-white hover:bg-accent-dark text-sm font-medium">
            <Plus className="h-4 w-4" /> New Design
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Templates", value: templates.length, icon: Layout, color: "text-blue-400" },
          { label: "Designs", value: designs.length, icon: FileText, color: "text-purple-400" },
          { label: "Published", value: designs.filter((d) => d.status === "published").length, icon: Rocket, color: "text-emerald-400" },
          { label: "Languages", value: [...new Set(designs.map((d) => d.language))].length, icon: Globe, color: "text-amber-400" },
        ].map((s) => (
          <div key={s.label} className="bg-card rounded-xl border border-border p-3 flex items-center gap-3">
            <s.icon className={`h-5 w-5 ${s.color}`} /><div><p className="text-lg font-bold text-foreground">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
          </div>
        ))}
      </div>

      {/* Templates */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3">Templates</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {templates.map((t) => (
            <div key={t.id} className="bg-card rounded-2xl border border-border p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-2xl">{LAYOUT_TYPES.find((lt) => lt.value === t.layout_type)?.icon || "\u{1F4C4}"}</span>
                {t.is_system ? <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-xs">System</span> :
                  <button onClick={() => handleDeleteTemplate(t.id)} className="p-1 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
              <h3 className="font-medium text-foreground text-sm">{t.name}</h3>
              {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
              <span className="inline-block px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs">
                {LAYOUT_TYPES.find((lt) => lt.value === t.layout_type)?.label || t.layout_type}
              </span>
            </div>
          ))}
          {templates.length === 0 && <div className="col-span-full bg-card rounded-2xl border border-border p-10 text-center text-muted-foreground text-sm">No templates yet</div>}
        </div>
      </div>

      {/* Designs */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3">Designs</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {designs.map((d) => (
            <div key={d.id} className={`bg-card rounded-2xl border ${d.status === "published" ? "border-emerald-500/30" : "border-border"} p-5 space-y-3`}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground">{d.name}</h3>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${d.status === "published" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>{d.status}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Globe className="h-3 w-3" />{LANGUAGES.find((l) => l.value === d.language)?.label || d.language}</span>
                {d.template_id && <span>Template #{d.template_id}</span>}
                <span>{new Date(d.created_at).toLocaleDateString()}</span>
              </div>
              <div className="flex gap-2 pt-1">
                {d.status !== "published" && (
                  <button onClick={() => handlePublish(d.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs font-medium">
                    <Rocket className="h-3 w-3" /> Publish
                  </button>
                )}
                <button onClick={() => handleDeleteDesign(d.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-medium">
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              </div>
            </div>
          ))}
          {designs.length === 0 && <div className="col-span-full bg-card rounded-2xl border border-border p-10 text-center text-muted-foreground text-sm">No designs yet. Create one to start designing your menu.</div>}
        </div>
      </div>

      {/* Add Template Modal */}
      {showAddTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-bold text-foreground">New Template</h2>
            <input type="text" placeholder="Template name" value={newTemplate.name} onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50" />
            <input type="text" placeholder="Description" value={newTemplate.description} onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50" />
            <select value={newTemplate.layout_type} onChange={(e) => setNewTemplate({ ...newTemplate, layout_type: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50">
              {LAYOUT_TYPES.map((lt) => <option key={lt.value} value={lt.value}>{lt.icon} {lt.label}</option>)}
            </select>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAddTemplate(false)} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground">Cancel</button>
              <button onClick={handleAddTemplate} className="px-4 py-2 rounded-xl bg-accent-DEFAULT text-white text-sm font-medium">Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Design Modal */}
      {showAddDesign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-bold text-foreground">New Design</h2>
            <input type="text" placeholder="Design name" value={newDesign.name} onChange={(e) => setNewDesign({ ...newDesign, name: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50" />
            <select value={newDesign.template_id} onChange={(e) => setNewDesign({ ...newDesign, template_id: parseInt(e.target.value) })} className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50">
              <option value={0}>No template (blank)</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select value={newDesign.language} onChange={(e) => setNewDesign({ ...newDesign, language: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50">
              {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAddDesign(false)} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground">Cancel</button>
              <button onClick={handleAddDesign} className="px-4 py-2 rounded-xl bg-accent-DEFAULT text-white text-sm font-medium">Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
