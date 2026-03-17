const getApiBaseUrl = () => {
    if (typeof window !== "undefined") {
        if (window.location.hostname === "localhost") return "http://localhost:8002";
        if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
        return "https://gestronomy-api.onrender.com";
    }
    return process.env.NEXT_PUBLIC_API_URL || "https://gestronomy-api.onrender.com";
};

const API_BASE = getApiBaseUrl();

export async function fetchMenu() {
    try {
        const res = await fetch(`${API_BASE}/api/public/restaurant/menu`);
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
        const response = await fetch(`${API_BASE}/api/public/restaurant/order`, {
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
        const response = await fetch(`${API_BASE}/api/public/restaurant/table/${code}`);
        if (!response.ok) throw new Error("Failed to fetch table info");
        return await response.json();
    } catch (error) {
        console.error("Error fetching table info:", error);
        return null;
    }
}
