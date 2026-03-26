const DEFAULT_API_BASE_URL = "http://localhost:8000/api";

function normalizeApiBaseUrl(value) {
    const raw = String(value || "").trim();
    const base = raw || DEFAULT_API_BASE_URL;
    const withoutTrailing = base.replace(/\/+$/, "");
    if (withoutTrailing.endsWith("/api")) {
        return withoutTrailing;
    }
    return `${withoutTrailing}/api`;
}

const getApiBaseUrl = () => {
    if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search || "");
        return normalizeApiBaseUrl(
            window.API_BASE_URL ||
            window.DAS_ELB_REST_CONFIG?.apiBaseUrl ||
            params.get("api_base")
        );
    }
    return normalizeApiBaseUrl(process.env.PUBLIC_API_BASE_URL || process.env.VITE_API_URL);
};

const API_BASE = getApiBaseUrl();

export async function fetchMenu() {
    try {
        const res = await fetch(`${API_BASE}/public/restaurant/menu`);
        if (!res.ok) throw new Error("Failed to fetch menu");
        const data = await res.json();
        return data.categories || [];
    } catch (error) {
        console.error("Error fetching menu:", error);
        return null;
    }
}

export async function submitOrder(orderData) {
    try {
        const response = await fetch(`${API_BASE}/public/restaurant/order`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(orderData),
        });
        if (!response.ok) throw new Error("Failed to submit order");
        return await response.json();
    } catch (error) {
        console.error("Error submitting order:", error);
        return null;
    }
}

export async function getTableInfo(code) {
    try {
        const response = await fetch(`${API_BASE}/public/restaurant/table/${code}`);
        if (!response.ok) throw new Error("Failed to fetch table info");
        return await response.json();
    } catch (error) {
        console.error("Error fetching table info:", error);
        return null;
    }
}
