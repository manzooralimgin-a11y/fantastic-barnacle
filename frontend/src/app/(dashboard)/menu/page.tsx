"use client";

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { Loading } from "@/components/shared/loading";
import { ApiError } from "@/components/shared/api-error";
import {
  UtensilsCrossed,
  Plus,
  Search,
  Star,
  Trash2,
  ChefHat,
  Clock,
  DollarSign,
  Tag,
  LayoutGrid,
  List,
  Eye,
  EyeOff,
  Sparkles,
  TrendingUp,
  Package,
  Zap,
  ArrowRight,
  BarChart3,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

/* ── types ── */
interface MenuCategory {
  id: number;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  sort_order: number;
  is_active: boolean;
}

interface MenuItem {
  id: number;
  category_id: number;
  name: string;
  description: string | null;
  price: number;
  cost: number;
  image_url: string | null;
  is_available: boolean;
  is_featured: boolean;
  prep_time_min: number;
  allergens_json: { tags?: string[] } | null;
  dietary_tags_json: { tags?: string[] } | null;
  nutrition_json: Record<string, number> | null;
  sort_order: number;
}

interface MenuAnalytics {
  total_items: number;
  active_items: number;
  categories_count: number;
  avg_food_cost_pct: number;
  featured_count: number;
  combos_count: number;
}

interface UpsellRule {
  id: number;
  trigger_item_id: number;
  suggested_item_id: number;
  rule_type: string;
  message: string | null;
  priority: number;
  is_active: boolean;
  times_shown: number;
  times_accepted: number;
}

/* ── category colours ── */
const CATEGORY_COLORS = [
  "from-emerald-500/20 to-red-500/10 border-emerald-500/30",
  "from-blue-500/20 to-indigo-500/10 border-blue-500/30",
  "from-emerald-500/20 to-teal-500/10 border-emerald-500/30",
  "from-purple-500/20 to-pink-500/10 border-purple-500/30",
  "from-amber-500/20 to-yellow-500/10 border-amber-500/30",
  "from-cyan-500/20 to-sky-500/10 border-cyan-500/30",
];

const CATEGORY_ICONS: Record<string, string> = {
  Appetizers: "\u{1F957}",
  Mains: "\u{1F35D}",
  "Main Course": "\u{1F37D}\uFE0F",
  Desserts: "\u{1F370}",
  Beverages: "\u{1F964}",
  Drinks: "\u{1F377}",
  Pizza: "\u{1F355}",
  Pasta: "\u{1F35D}",
  Seafood: "\u{1F990}",
  Salads: "\u{1F957}",
  Sides: "\u{1F35F}",
  Soups: "\u{1F35C}",
};

const RULE_TYPES = [
  { value: "frequently_bought_together", label: "Frequently Bought Together" },
  { value: "upgrade", label: "Upgrade" },
  { value: "addon", label: "Add-on" },
  { value: "combo_suggestion", label: "Combo Suggestion" },
];

const RULE_TYPE_COLORS: Record<string, string> = {
  frequently_bought_together: "bg-blue-500/10 text-blue-400",
  upgrade: "bg-purple-500/10 text-purple-400",
  addon: "bg-emerald-500/10 text-emerald-400",
  combo_suggestion: "bg-amber-500/10 text-amber-400",
};

export default function MenuPage() {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [analytics, setAnalytics] = useState<MenuAnalytics | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showAddItem, setShowAddItem] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  /* ── upsell rules state ── */
  const [upsellRules, setUpsellRules] = useState<UpsellRule[]>([]);
  const [showAddRule, setShowAddRule] = useState(false);
  const [upsellExpanded, setUpsellExpanded] = useState(true);
  const [newRule, setNewRule] = useState({
    trigger_item_id: 0,
    suggested_item_id: 0,
    rule_type: "addon",
    message: "",
    priority: 0,
    is_active: true,
  });

  /* ── form state ── */
  const [newItem, setNewItem] = useState({
    category_id: 0,
    name: "",
    description: "",
    price: "",
    cost: "",
    prep_time_min: "15",
    is_available: true,
    is_featured: false,
  });
  const [newCategory, setNewCategory] = useState({ name: "", description: "" });

  const fetchData = useCallback(async () => {
    setFetchError(null);
    try {
      const [catRes, itemRes, analyticsRes, rulesRes] = await Promise.all([
        api.get("/menu/categories"),
        api.get("/menu/items"),
        api.get("/menu/analytics"),
        api.get("/menu/upsell-rules"),
      ]);
      setCategories(catRes.data);
      setItems(itemRes.data);
      setAnalytics(analyticsRes.data);
      setUpsellRules(rulesRes.data);
    } catch {
      setFetchError("Failed to load menu data. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ── derived data ── */
  const filtered = items.filter((i) => {
    if (selectedCategory && i.category_id !== selectedCategory) return false;
    if (searchQuery && !i.name.toLowerCase().includes(searchQuery.toLowerCase()))
      return false;
    return true;
  });

  const getItemName = (id: number) =>
    items.find((i) => i.id === id)?.name ?? `Item #${id}`;

  const getCategoryName = (id: number) =>
    categories.find((c) => c.id === id)?.name ?? "\u2014";

  const profitMargin = (item: MenuItem) =>
    item.price > 0 ? ((item.price - item.cost) / item.price) * 100 : 0;

  const acceptanceRate = (rule: UpsellRule) =>
    rule.times_shown > 0
      ? ((rule.times_accepted / rule.times_shown) * 100).toFixed(1)
      : "0.0";

  /* ── CRUD ── */
  const handleAddCategory = async () => {
    if (!newCategory.name) return;
    try {
      await api.post("/menu/categories", newCategory);
      setNewCategory({ name: "", description: "" });
      setShowAddCategory(false);
      fetchData();
    } catch {}
  };

  const handleAddItem = async () => {
    if (!newItem.name || !newItem.price || !newItem.category_id) return;
    try {
      const payload = {
        ...newItem,
        price: parseFloat(newItem.price),
        cost: parseFloat(newItem.cost || "0"),
        prep_time_min: parseInt(newItem.prep_time_min),
      };
      await api.post("/menu/items", payload);
      setNewItem({
        category_id: 0,
        name: "",
        description: "",
        price: "",
        cost: "",
        prep_time_min: "15",
        is_available: true,
        is_featured: false,
      });
      setShowAddItem(false);
      fetchData();
    } catch {}
  };

  const handleToggleAvailability = async (item: MenuItem) => {
    try {
      await api.put(`/menu/items/${item.id}`, {
        is_available: !item.is_available,
      });
      fetchData();
    } catch {}
  };

  const handleToggleFeatured = async (item: MenuItem) => {
    try {
      await api.put(`/menu/items/${item.id}`, {
        is_featured: !item.is_featured,
      });
      fetchData();
    } catch {}
  };

  const handleDeleteItem = async (itemId: number) => {
    try {
      await api.delete(`/menu/items/${itemId}`);
      fetchData();
    } catch {}
  };

  /* ── upsell rule CRUD ── */
  const handleAddRule = async () => {
    if (!newRule.trigger_item_id || !newRule.suggested_item_id) return;
    try {
      await api.post("/menu/upsell-rules", newRule);
      setNewRule({
        trigger_item_id: 0,
        suggested_item_id: 0,
        rule_type: "addon",
        message: "",
        priority: 0,
        is_active: true,
      });
      setShowAddRule(false);
      fetchData();
    } catch {}
  };

  const handleToggleRule = async (rule: UpsellRule) => {
    try {
      await api.put(`/menu/upsell-rules/${rule.id}`, {
        is_active: !rule.is_active,
      });
      fetchData();
    } catch {}
  };

  const handleDeleteRule = async (ruleId: number) => {
    try {
      await api.delete(`/menu/upsell-rules/${ruleId}`);
      fetchData();
    } catch {}
  };

  if (loading) {
    return <Loading size="lg" className="min-h-[60vh]" />;
  }

  return (
    <div className="space-y-6">
      {fetchError && <ApiError message={fetchError} onRetry={fetchData} />}
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ChefHat className="h-7 w-7 text-accent-DEFAULT" />
            Menu Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your restaurant menu, categories, and pricing
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddCategory(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted text-foreground hover:bg-muted/80 transition-colors text-sm font-medium"
          >
            <Tag className="h-4 w-4" />
            Add Category
          </button>
          <button
            onClick={() => setShowAddItem(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-DEFAULT text-white hover:bg-accent-dark transition-colors text-sm font-medium"
          >
            <Plus className="h-4 w-4" />
            Add Item
          </button>
        </div>
      </div>

      {/* ── Analytics Bar ── */}
      {analytics && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Total Items", value: analytics.total_items, icon: UtensilsCrossed, color: "text-blue-400" },
            { label: "Active", value: analytics.active_items, icon: Eye, color: "text-emerald-400" },
            { label: "Categories", value: analytics.categories_count, icon: LayoutGrid, color: "text-purple-400" },
            { label: "Avg Food Cost", value: `${analytics.avg_food_cost_pct}%`, icon: TrendingUp, color: analytics.avg_food_cost_pct > 35 ? "text-red-400" : "text-emerald-400" },
            { label: "Featured", value: analytics.featured_count, icon: Star, color: "text-amber-400" },
            { label: "Upsell Rules", value: upsellRules.length, icon: Zap, color: "text-cyan-400" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-card rounded-xl border border-border p-3 flex items-center gap-3"
            >
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
              <div>
                <p className="text-lg font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Categories Row ── */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            selectedCategory === null
              ? "bg-accent-DEFAULT text-white shadow-lg shadow-accent-DEFAULT/25"
              : "bg-card text-muted-foreground hover:text-foreground border border-border"
          }`}
        >
          All Items
        </button>
        {categories.map((cat, i) => (
          <button
            key={cat.id}
            onClick={() =>
              setSelectedCategory(selectedCategory === cat.id ? null : cat.id)
            }
            className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
              selectedCategory === cat.id
                ? "bg-accent-DEFAULT text-white shadow-lg shadow-accent-DEFAULT/25"
                : "bg-card text-muted-foreground hover:text-foreground border border-border"
            }`}
          >
            <span>{CATEGORY_ICONS[cat.name] || "\u{1F37D}\uFE0F"}</span>
            {cat.name}
            <span className="text-xs opacity-70">
              ({items.filter((it) => it.category_id === cat.id).length})
            </span>
          </button>
        ))}
      </div>

      {/* ── Search & View Toggle ── */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search menu items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-card border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50"
          />
        </div>
        <div className="flex bg-card border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => setViewMode("grid")}
            className={`p-2.5 ${viewMode === "grid" ? "bg-accent-DEFAULT text-white" : "text-muted-foreground hover:text-foreground"}`}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-2.5 ${viewMode === "list" ? "bg-accent-DEFAULT text-white" : "text-muted-foreground hover:text-foreground"}`}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Items Grid / List ── */}
      {filtered.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-12 text-center">
          <UtensilsCrossed className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No menu items found</p>
          <button
            onClick={() => setShowAddItem(true)}
            className="mt-4 px-4 py-2 rounded-xl bg-accent-DEFAULT text-white text-sm"
          >
            Add Your First Item
          </button>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((item) => (
            <div
              key={item.id}
              className={`group bg-card rounded-2xl border border-border overflow-hidden hover:shadow-lg hover:shadow-accent-DEFAULT/5 transition-all duration-300 ${
                !item.is_available ? "opacity-60" : ""
              }`}
            >
              {/* image / placeholder */}
              <div className="relative h-40 bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
                <span className="text-5xl">
                  {CATEGORY_ICONS[getCategoryName(item.category_id)] || "\u{1F37D}\uFE0F"}
                </span>
                {item.is_featured && (
                  <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/90 text-white text-xs font-medium">
                    <Star className="h-3 w-3" fill="currentColor" />
                    Featured
                  </div>
                )}
                {!item.is_available && (
                  <div className="absolute top-2 right-2 px-2 py-1 rounded-full bg-red-500/90 text-white text-xs font-medium">
                    Unavailable
                  </div>
                )}
                {/* hover actions */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button
                    onClick={() => handleToggleAvailability(item)}
                    className="p-2 rounded-xl bg-white/20 backdrop-blur text-white hover:bg-white/30"
                    title={item.is_available ? "Mark unavailable" : "Mark available"}
                  >
                    {item.is_available ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => handleToggleFeatured(item)}
                    className="p-2 rounded-xl bg-white/20 backdrop-blur text-white hover:bg-white/30"
                    title={item.is_featured ? "Remove featured" : "Mark featured"}
                  >
                    <Star className={`h-4 w-4 ${item.is_featured ? "fill-amber-400 text-amber-400" : ""}`} />
                  </button>
                  <button
                    onClick={() => handleDeleteItem(item.id)}
                    className="p-2 rounded-xl bg-red-500/50 backdrop-blur text-white hover:bg-red-500/70"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-foreground">{item.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {getCategoryName(item.category_id)}
                    </p>
                  </div>
                  <span className="text-lg font-bold text-accent-DEFAULT">
                    &euro;{item.price.toFixed(2)}
                  </span>
                </div>
                {item.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {item.description}
                  </p>
                )}
                <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {item.prep_time_min}m
                  </span>
                  <span className="flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    {profitMargin(item).toFixed(0)}% margin
                  </span>
                </div>
                {/* dietary tags */}
                {item.dietary_tags_json?.tags && item.dietary_tags_json.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {item.dietary_tags_json.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ── List View ── */
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3 text-right">Cost</th>
                <th className="px-4 py-3 text-right">Margin</th>
                <th className="px-4 py-3">Prep</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">
                        {CATEGORY_ICONS[getCategoryName(item.category_id)] || "\u{1F37D}\uFE0F"}
                      </span>
                      <div>
                        <p className="font-medium text-foreground text-sm flex items-center gap-1">
                          {item.name}
                          {item.is_featured && (
                            <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                          )}
                        </p>
                        {item.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1 max-w-xs">
                            {item.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {getCategoryName(item.category_id)}
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground text-right font-semibold">
                    &euro;{item.price.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground text-right">
                    &euro;{item.cost.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`text-sm font-medium ${
                        profitMargin(item) >= 65
                          ? "text-emerald-400"
                          : profitMargin(item) >= 50
                          ? "text-amber-400"
                          : "text-red-400"
                      }`}
                    >
                      {profitMargin(item).toFixed(0)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {item.prep_time_min}m
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        item.is_available
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-red-500/10 text-red-400"
                      }`}
                    >
                      {item.is_available ? "Available" : "Unavailable"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleToggleAvailability(item)}
                        className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {item.is_available ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Upsell Rules Section ── */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <button
          onClick={() => setUpsellExpanded(!upsellExpanded)}
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Zap className="h-5 w-5 text-amber-400" />
            <div className="text-left">
              <h2 className="text-base font-semibold text-foreground">
                Upsell Rules
              </h2>
              <p className="text-xs text-muted-foreground">
                Guided suggestions to increase average order value
              </p>
            </div>
            <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-xs font-medium">
              {upsellRules.length} rules
            </span>
          </div>
          {upsellExpanded ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </button>

        {upsellExpanded && (
          <div className="border-t border-border">
            {/* upsell header */}
            <div className="px-6 py-3 flex items-center justify-between bg-muted/20">
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <BarChart3 className="h-3.5 w-3.5" />
                  Total Shown: {upsellRules.reduce((s, r) => s + r.times_shown, 0)}
                </span>
                <span className="flex items-center gap-1">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Total Accepted: {upsellRules.reduce((s, r) => s + r.times_accepted, 0)}
                </span>
                {upsellRules.reduce((s, r) => s + r.times_shown, 0) > 0 && (
                  <span className="flex items-center gap-1 text-emerald-400">
                    Avg Rate:{" "}
                    {(
                      (upsellRules.reduce((s, r) => s + r.times_accepted, 0) /
                        upsellRules.reduce((s, r) => s + r.times_shown, 0)) *
                      100
                    ).toFixed(1)}
                    %
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowAddRule(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors text-xs font-medium"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Rule
              </button>
            </div>

            {upsellRules.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <Sparkles className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No upsell rules yet. Create rules to suggest add-ons, upgrades, and combos.
                </p>
                <button
                  onClick={() => setShowAddRule(true)}
                  className="mt-3 px-4 py-2 rounded-xl bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 text-sm font-medium transition-colors"
                >
                  Create First Rule
                </button>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {upsellRules.map((rule) => (
                  <div
                    key={rule.id}
                    className={`px-6 py-3 flex items-center justify-between hover:bg-muted/20 transition-colors ${
                      !rule.is_active ? "opacity-50" : ""
                    }`}
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      {/* trigger → suggested */}
                      <div className="flex items-center gap-2 text-sm min-w-0">
                        <span className="font-medium text-foreground truncate max-w-[150px]">
                          {getItemName(rule.trigger_item_id)}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="font-medium text-accent-DEFAULT truncate max-w-[150px]">
                          {getItemName(rule.suggested_item_id)}
                        </span>
                      </div>

                      {/* rule type badge */}
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                          RULE_TYPE_COLORS[rule.rule_type] || "bg-muted text-muted-foreground"
                        }`}
                      >
                        {RULE_TYPES.find((t) => t.value === rule.rule_type)?.label || rule.rule_type}
                      </span>

                      {/* message */}
                      {rule.message && (
                        <span className="text-xs text-muted-foreground italic truncate max-w-[200px] hidden lg:inline">
                          &ldquo;{rule.message}&rdquo;
                        </span>
                      )}
                    </div>

                    {/* stats + actions */}
                    <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                      <div className="text-xs text-muted-foreground text-right hidden sm:block">
                        <span>{rule.times_shown} shown</span>
                        <span className="mx-1">/</span>
                        <span className="text-emerald-400">{rule.times_accepted} accepted</span>
                        <span className="ml-1 text-foreground font-medium">
                          ({acceptanceRate(rule)}%)
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        P{rule.priority}
                      </span>
                      <button
                        onClick={() => handleToggleRule(rule)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        title={rule.is_active ? "Disable" : "Enable"}
                      >
                        {rule.is_active ? (
                          <ToggleRight className="h-5 w-5 text-emerald-400" />
                        ) : (
                          <ToggleLeft className="h-5 w-5" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDeleteRule(rule.id)}
                        className="p-1 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Add Category Modal ── */}
      {showAddCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-bold text-foreground">New Category</h2>
            <input
              type="text"
              placeholder="Category name"
              value={newCategory.name}
              onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50"
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={newCategory.description}
              onChange={(e) => setNewCategory({ ...newCategory, description: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowAddCategory(false)}
                className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCategory}
                className="px-4 py-2 rounded-xl bg-accent-DEFAULT text-white text-sm font-medium"
              >
                Create Category
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Item Modal ── */}
      {showAddItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-lg space-y-4 max-h-[85vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-foreground">New Menu Item</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground mb-1 block">Name</label>
                <input
                  type="text"
                  placeholder="Item name"
                  value={newItem.name}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground mb-1 block">Description</label>
                <textarea
                  placeholder="Description"
                  value={newItem.description}
                  onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50 h-20 resize-none"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Category</label>
                <select
                  value={newItem.category_id}
                  onChange={(e) => setNewItem({ ...newItem, category_id: parseInt(e.target.value) })}
                  className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50"
                >
                  <option value={0}>Select category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Prep Time (min)</label>
                <input
                  type="number"
                  value={newItem.prep_time_min}
                  onChange={(e) => setNewItem({ ...newItem, prep_time_min: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Price (&euro;)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={newItem.price}
                  onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Cost (&euro;)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={newItem.cost}
                  onChange={(e) => setNewItem({ ...newItem, cost: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50"
                />
              </div>
              <div className="col-span-2 flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newItem.is_available}
                    onChange={(e) => setNewItem({ ...newItem, is_available: e.target.checked })}
                    className="rounded border-border"
                  />
                  Available
                </label>
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newItem.is_featured}
                    onChange={(e) => setNewItem({ ...newItem, is_featured: e.target.checked })}
                    className="rounded border-border"
                  />
                  Featured
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddItem(false)}
                className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleAddItem}
                className="px-4 py-2 rounded-xl bg-accent-DEFAULT text-white text-sm font-medium"
              >
                Add Item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Upsell Rule Modal ── */}
      {showAddRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-lg space-y-4">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-400" />
              <h2 className="text-lg font-bold text-foreground">New Upsell Rule</h2>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  When ordering (trigger)
                </label>
                <select
                  value={newRule.trigger_item_id}
                  onChange={(e) =>
                    setNewRule({ ...newRule, trigger_item_id: parseInt(e.target.value) })
                  }
                  className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50"
                >
                  <option value={0}>Select trigger item</option>
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Suggest this item
                </label>
                <select
                  value={newRule.suggested_item_id}
                  onChange={(e) =>
                    setNewRule({ ...newRule, suggested_item_id: parseInt(e.target.value) })
                  }
                  className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50"
                >
                  <option value={0}>Select suggested item</option>
                  {items
                    .filter((it) => it.id !== newRule.trigger_item_id)
                    .map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.name} (&euro;{it.price.toFixed(2)})
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Rule Type</label>
                <select
                  value={newRule.rule_type}
                  onChange={(e) => setNewRule({ ...newRule, rule_type: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50"
                >
                  {RULE_TYPES.map((rt) => (
                    <option key={rt.value} value={rt.value}>
                      {rt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Priority</label>
                <input
                  type="number"
                  value={newRule.priority}
                  onChange={(e) =>
                    setNewRule({ ...newRule, priority: parseInt(e.target.value) || 0 })
                  }
                  className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground mb-1 block">
                  Suggestion Message (shown to staff/guest)
                </label>
                <input
                  type="text"
                  placeholder='e.g. "Would you like fries with that?"'
                  value={newRule.message}
                  onChange={(e) => setNewRule({ ...newRule, message: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50"
                />
              </div>
              <div className="col-span-2">
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newRule.is_active}
                    onChange={(e) => setNewRule({ ...newRule, is_active: e.target.checked })}
                    className="rounded border-border"
                  />
                  Active
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddRule(false)}
                className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleAddRule}
                className="px-4 py-2 rounded-xl bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors"
              >
                Create Rule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
