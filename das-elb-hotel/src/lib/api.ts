import { Room } from "@/types";
import { rooms as localRooms } from "@/lib/rooms-data";

/* ── Live API Base ──────────────────────────────────────────── */
const getApiBaseUrl = () => {
    if (typeof window !== "undefined") {
        if (window.location.hostname === "localhost") return "http://localhost:8002";
        if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
        return "https://gestronomy-api.onrender.com";
    }
    return process.env.NEXT_PUBLIC_API_URL || "https://gestronomy-api.onrender.com";
};

const API_BASE = getApiBaseUrl();

/* ── Timeout helper ─────────────────────────────────────────── */
const TIMEOUT_MS = 5000; // 5 seconds max per request

function fetchWithTimeout(
    url: string,
    options?: RequestInit,
    timeoutMs = TIMEOUT_MS
): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal }).finally(() =>
        clearTimeout(timer)
    );
}

/* ── Types ───────────────────────────────────────────────────── */
export interface BookingRequest {
    roomType: string;
    checkIn: string;
    checkOut: string;
    adults: number;
    children: number;
    name: string;
    email: string;
    phone: string;
    specialRequests?: string;
}

export interface BookingResponse {
    success: boolean;
    reference?: string;
    confirmation_code?: string;
    guest_name?: string;
    room_type?: string;
    total_price?: number;
    message?: string;
}

export interface AvailabilityResult {
    available: boolean;
    price: number;
    total_price?: number;
    message?: string;
}

/* ── Fetch available room types and their live prices ─────── */
export async function fetchRooms(): Promise<Room[]> {
    try {
        const res = await fetchWithTimeout(`${API_BASE}/api/public/hotel/rooms`);
        if (!res.ok) throw new Error("Failed to fetch rooms");
        const data = await res.json();

        // Map API response to local Room type
        if (Array.isArray(data) && data.length > 0) {
            // Explicit mapping: API room_type → local room name
            const apiNameMap: Record<string, string> = {
                "standard double": "Komfort Apartment",
                "deluxe river view": "Komfort Plus Apartment",
                "the elb suite": "Suite Deluxe",
                "standard single": "Standard Single",
            };

            // Build a price lookup from API data
            const priceByLocalName: Record<string, number> = {};
            for (const r of data) {
                const apiKey = (
                    (r.room_type as string) ||
                    (r.name as string) ||
                    ""
                ).toLowerCase().trim();
                const localName = apiNameMap[apiKey];
                const price =
                    (r.base_price as number) ||
                    (r.price as number) ||
                    (r.priceFrom as number) ||
                    0;
                if (localName && price > 0) {
                    priceByLocalName[localName] = price;
                }
            }

            // Merge API prices into local room data
            return localRooms.map((local) => ({
                ...local,
                priceFrom: priceByLocalName[local.name] || local.priceFrom,
            }));
        }

        return localRooms;
    } catch (err) {
        console.warn("Live API unavailable, using local rooms:", err);
        return localRooms;
    }
}

/** Alias for backward compatibility */
export const fetchPublicRooms = fetchRooms;

/* ── Check availability for a specific date range and room ── */
export async function checkAvailability(
    roomType: string,
    checkIn: string,
    checkOut: string
): Promise<AvailabilityResult> {
    // Always compute local price as baseline
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    const room = localRooms.find((r) => r.name === roomType);
    const nights =
        start < end
            ? Math.ceil(
                (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
            )
            : 0;
    const localPrice = room ? nights * room.priceFrom : 0;

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
        return { available: false, price: 0 };
    }

    try {
        const url = new URL(`${API_BASE}/api/public/hotel/availability`);
        url.searchParams.append("check_in", checkIn);
        url.searchParams.append("check_out", checkOut);
        url.searchParams.append("room_type", roomType);

        const res = await fetchWithTimeout(url.toString());
        const data = await res.json();

        return {
            available: data.available ?? true,
            price: data.total_price ?? data.price ?? localPrice,
            total_price: data.total_price,
            message: data.message,
        };
    } catch (err) {
        console.warn("Availability check timed out, using local:", err);
        return { available: true, price: localPrice };
    }
}

/* ── Create a guest booking ──────────────────────────────────── */
export async function createBooking(
    data: BookingRequest
): Promise<BookingResponse> {
    try {
        // Map room names to IDs (based on backend seed or common mapping)
        const roomTypeIds: Record<string, number> = {
            "Komfort Apartment": 2, // Standard Double
            "Komfort Plus Apartment": 3, // Deluxe River View
            "Suite Deluxe": 4, // The Elb Suite
        };

        const payload = {
            property_id: 1, // Default for Das Elb Hotel
            room_type_id: roomTypeIds[data.roomType] || 1,
            guest_name: data.name,
            guest_email: data.email,
            guest_phone: data.phone,
            check_in: data.checkIn,
            check_out: data.checkOut,
            adults: data.adults,
            children: data.children,
            notes: data.specialRequests || "",
        };

        const res = await fetchWithTimeout(
            `${API_BASE}/api/public/hotel/book`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            },
            10000 // 10s for bookings (more important)
        );

        const result = await res.json();

        return {
            success: result.success ?? false,
            reference:
                result.confirmation_code ||
                result.reference ||
                `ELB-${Math.floor(Math.random() * 10000)
                    .toString()
                    .padStart(4, "0")}`,
            confirmation_code: result.confirmation_code,
            guest_name: result.guest_name || data.name,
            room_type: result.room_type || data.roomType,
            total_price: result.total_price,
            message: result.message,
        };
    } catch (err) {
        console.error("Booking failed:", err);
        return {
            success: false,
            message:
                "Buchung fehlgeschlagen. Bitte kontaktieren Sie uns direkt unter rezeption@das-elb.de.",
        };
    }
}
