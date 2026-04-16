import { useMemo, useState } from "react";
import type { WaiterMenuCategory, WaiterMenuItem } from "../lib/api";

interface Props {
  menu: WaiterMenuCategory[];
  onAdd: (item: WaiterMenuItem) => void;
}

export function MenuBrowser({ menu, onAdd }: Props) {
  const [activeCat, setActiveCat] = useState<string>(() =>
    menu[0]?.id ?? ""
  );

  const activeItems = useMemo<WaiterMenuItem[]>(() => {
    const cat = menu.find((c) => c.id === activeCat) ?? menu[0];
    if (!cat) return [];
    const items: WaiterMenuItem[] = [];
    for (const sub of cat.subcategories) items.push(...sub.items);
    return items;
  }, [menu, activeCat]);

  if (menu.length === 0) {
    return <div className="status muted">Menu is empty.</div>;
  }

  return (
    <>
      <div className="row" style={{ overflowX: "auto" }}>
        {menu.map((cat) => (
          <button
            key={cat.id}
            className={`category-chip ${cat.id === activeCat ? "active" : ""}`}
            onClick={() => setActiveCat(cat.id)}
            type="button"
          >
            <span style={{ marginRight: 6 }}>{cat.emoji}</span>
            {cat.name}
          </button>
        ))}
      </div>

      <div className="menu-grid">
        {activeItems.map((item) => (
          <button
            key={item.id}
            className="menu-item"
            onClick={() => onAdd(item)}
            disabled={!item.is_available}
            type="button"
            title={item.description || item.name}
          >
            <div className="name">
              <span>{item.emoji}</span>
              <span style={{ flex: 1 }}>{item.name}</span>
              {item.is_popular && <span className="pill">popular</span>}
            </div>
            {item.description && <div className="desc">{item.description}</div>}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginTop: 4,
              }}
            >
              <span className="price">
                {item.price.toLocaleString(undefined, {
                  style: "currency",
                  currency: "EUR",
                })}
              </span>
              {!item.is_available && <small className="hint">unavailable</small>}
            </div>
          </button>
        ))}
      </div>
    </>
  );
}
