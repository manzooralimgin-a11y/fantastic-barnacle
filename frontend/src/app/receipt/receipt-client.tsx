"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

interface ReceiptItem {
    id: number;
    item_name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
}

interface PaymentInfo {
    id: number;
    amount: number;
    method: string;
    tip_amount: number;
    card_last_four: string | null;
    card_brand: string | null;
    wallet_type: string | null;
    paid_at: string | null;
}

interface ReceiptData {
    bill_number: string;
    order_id: number;
    items: ReceiptItem[];
    subtotal: number;
    tax_rate: number;
    tax_amount: number;
    service_charge: number;
    discount_amount: number;
    tip_amount: number;
    total: number;
    payments: PaymentInfo[];
    paid_at: string | null;
    receipt_token: string | null;
}

export function PublicReceiptClient() {
    const searchParams = useSearchParams();
    const token = searchParams.get("token");
    const [receipt, setReceipt] = useState<ReceiptData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!token) return;
        fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/api/billing/receipt/${token}`)
            .then(async (res) => {
                if (!res.ok) throw new Error("Receipt not found");
                return res.json();
            })
            .then((data) => setReceipt(data))
            .catch(() => setError("Receipt not found or invalid link."))
            .finally(() => setLoading(false));
    }, [token]);

    if (loading) {
        return (
            <div className="min-h-screen bg-muted flex items-center justify-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-foreground" />
            </div>
        );
    }

    if (error || !receipt) {
        return (
            <div className="min-h-screen bg-muted flex items-center justify-center p-4">
                <div className="bg-card rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
                    <div className="text-5xl mb-4">🧾</div>
                    <h1 className="text-xl font-bold text-foreground mb-2">Receipt Not Found</h1>
                    <p className="text-muted-foreground text-sm">{error || "This receipt link is invalid or has expired."}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-muted flex items-center justify-center p-4">
            <div className="bg-card rounded-2xl shadow-lg max-w-[480px] w-full overflow-hidden">
                {/* Header with DAS ELB Identity */}
                <div className="bg-foreground text-white p-6 text-center">
                    <div className="flex flex-col items-center mb-1">
                        <img src="/das-elb-logo.png" alt="DAS ELB Logo" className="w-16 h-auto mb-1 grayscale object-contain" />
                    </div>
                    <h1 className="text-2xl font-bold tracking-widest uppercase">DAS ELB</h1>
                    <p className="text-muted-foreground text-xs mt-1">Digitale Rechnung</p>
                </div>

                <div className="p-6 space-y-5">
                    {/* Bill info */}
                    <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Rechn.-Nr. {receipt.bill_number}</span>
                        <span>{receipt.paid_at ? new Date(receipt.paid_at).toLocaleString("de-DE") : "Ausstehend"}</span>
                    </div>

                    {/* Items */}
                    <div className="space-y-2">
                        <div className="flex justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-1 border-b border-border">
                            <span>Bezeichnung</span>
                            <span>Betrag</span>
                        </div>
                        {receipt.items.map((item) => (
                            <div key={item.id} className="flex justify-between py-1.5">
                                <div>
                                    <span className="text-foreground text-sm font-medium">{item.item_name}</span>
                                    {item.quantity > 1 && (
                                        <span className="text-muted-foreground text-xs ml-2">{item.quantity} × €{item.unit_price.toFixed(2)}</span>
                                    )}
                                </div>
                                <span className="text-foreground text-sm font-medium">€{item.total_price.toFixed(2)}</span>
                            </div>
                        ))}
                    </div>

                    {/* Divider */}
                    <div className="border-t border-dashed border-border" />

                    {/* Totals */}
                    <div className="space-y-1.5 text-sm font-mono">
                        <div className="flex justify-between text-muted-foreground">
                            <span>Zwischensumme</span>
                            <span>€{receipt.subtotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-muted-foreground">
                            <span>MwSt. ({(receipt.tax_rate * 100).toFixed(0)}%)</span>
                            <span>€{receipt.tax_amount.toFixed(2)}</span>
                        </div>
                        {receipt.service_charge > 0 && (
                            <div className="flex justify-between text-muted-foreground">
                                <span>Servicegebühr</span>
                                <span>€{receipt.service_charge.toFixed(2)}</span>
                            </div>
                        )}
                        {receipt.discount_amount > 0 && (
                            <div className="flex justify-between text-green-600">
                                <span>Rabatt</span>
                                <span>-€{receipt.discount_amount.toFixed(2)}</span>
                            </div>
                        )}
                        {receipt.tip_amount > 0 && (
                            <div className="flex justify-between text-muted-foreground">
                                <span>Trinkgeld</span>
                                <span>€{receipt.tip_amount.toFixed(2)}</span>
                            </div>
                        )}
                        <div className="flex justify-between font-bold text-xl text-foreground pt-2 border-t border-border">
                            <span>Summe</span>
                            <span>€{receipt.total.toFixed(2)}</span>
                        </div>
                    </div>

                    {/* Payment method */}
                    {receipt.payments.length > 0 && (
                        <div className="bg-muted rounded-xl p-3 space-y-1">
                            {receipt.payments.map((p) => (
                                <div key={p.id} className="flex justify-between text-sm">
                                    <span className="text-muted-foreground uppercase font-semibold">
                                        {p.method === "cash" ? "BAR" : p.method.toUpperCase()}
                                        {p.card_last_four && ` •••• ${p.card_last_four}`}
                                    </span>
                                    <span className="text-foreground font-medium">€{Math.abs(p.amount).toFixed(2)}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Business Details & Footer */}
                    <div className="text-center pt-6 space-y-3 border-t border-border">
                        <div className="text-[10px] text-muted-foreground leading-relaxed uppercase tracking-widest">
                            B. Singh Hotel GmbH & Co. KG<br />
                            Seilerweg 19 · 39114 Magdeburg<br />
                            Deutschland
                        </div>
                        <div className="space-y-1">
                            <p className="text-foreground font-medium">Vielen Dank für Ihren Besuch!</p>
                            <p className="text-muted-foreground text-[10px]">www.Das-ELB.de</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
