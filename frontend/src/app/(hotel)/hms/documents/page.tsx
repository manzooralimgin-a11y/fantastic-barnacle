"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/components/shared/api-error";
import api from "@/lib/api";
import {
  defaultHotelPropertyId,
} from "@/lib/hotel-room-types";
import {
  fetchHmsDocuments,
  fetchHmsDocumentTemplates,
  generateHmsDocument,
  type HotelDocument,
  type HotelDocumentTemplate,
} from "@/lib/hms";

type ReservationOption = {
  id: string;
  guest_name: string;
  check_in: string;
  check_out: string;
  room_type: string;
  status: string;
};

const documentKinds = [
  { value: "confirmation", label: "Confirmation" },
  { value: "registration", label: "Registration Form" },
  { value: "offer", label: "Offer" },
  { value: "invoice", label: "Invoice" },
];

export default function DocumentsPage() {
  const searchParams = useSearchParams();
  const [documents, setDocuments] = useState<HotelDocument[]>([]);
  const [templates, setTemplates] = useState<HotelDocumentTemplate[]>([]);
  const [reservations, setReservations] = useState<ReservationOption[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<HotelDocument | null>(null);
  const [reservationId, setReservationId] = useState("");
  const [documentKind, setDocumentKind] = useState("confirmation");
  const [templateCode, setTemplateCode] = useState("");
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    try {
      const [documentPayload, templatePayload, reservationPayload] = await Promise.all([
        fetchHmsDocuments(defaultHotelPropertyId),
        fetchHmsDocumentTemplates(defaultHotelPropertyId),
        api.get<{ items?: ReservationOption[] } | ReservationOption[]>("/hms/reservations", {
          params: { property_id: defaultHotelPropertyId },
        }),
      ]);
      const reservationItems = Array.isArray(reservationPayload.data)
        ? reservationPayload.data
        : reservationPayload.data.items || [];
      setDocuments(documentPayload);
      setTemplates(templatePayload);
      setReservations(reservationItems);
      setSelectedDocument((current) => current || documentPayload[0] || null);
      setFetchError(null);
    } catch (error) {
      console.error("Failed to load hotel documents", error);
      setFetchError("Failed to load hotel documents.");
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const reservationFromUrl = searchParams.get("reservationId");
    if (reservationFromUrl) {
      setReservationId(reservationFromUrl);
    }
  }, [searchParams]);

  const filteredTemplates = templates.filter((template) => {
    const matchedKind = documentKinds.find((item) => item.value === documentKind);
    if (!matchedKind) return true;
    return template.code.includes(documentKind);
  });

  const handleGenerate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      const generated = await generateHmsDocument(
        {
          reservation_id: Number(reservationId),
          document_kind: documentKind,
          template_code: templateCode || undefined,
        },
        defaultHotelPropertyId,
      );
      setDocuments((current) => [generated, ...current]);
      setSelectedDocument(generated);
      setFetchError(null);
    } catch (error) {
      console.error("Failed to generate hotel document", error);
      setFetchError("Failed to generate the selected document.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div>
        <h1 className="text-4xl font-editorial font-bold text-foreground tracking-tight">Documents & Templates</h1>
        <p className="text-foreground-muted mt-1">Generate confirmations, registration forms, offers, and invoices from live hotel data</p>
      </div>

      {fetchError && <ApiError message={fetchError} onRetry={loadData} dismissible={false} />}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_1.4fr]">
        <Card className="bg-card shadow-[var(--shadow-soft)] border-none">
          <CardHeader className="border-b border-foreground/10 bg-foreground/[0.02] px-6 py-5">
            <CardTitle className="text-lg font-editorial text-foreground">Generate Document</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <form className="space-y-4" onSubmit={handleGenerate}>
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-foreground-muted">Reservation</label>
                <select
                  required
                  value={reservationId}
                  onChange={(event) => setReservationId(event.target.value)}
                  className="w-full rounded-xl border border-foreground/10 bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">Choose reservation</option>
                  {reservations.map((reservation) => (
                    <option key={reservation.id} value={reservation.id.replace("R-", "")}>
                      {reservation.id} • {reservation.guest_name} • {reservation.check_in}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-foreground-muted">Document type</label>
                <select
                  value={documentKind}
                  onChange={(event) => {
                    setDocumentKind(event.target.value);
                    setTemplateCode("");
                  }}
                  className="w-full rounded-xl border border-foreground/10 bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {documentKinds.map((kind) => (
                    <option key={kind.value} value={kind.value}>{kind.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-foreground-muted">Template override</label>
                <select
                  value={templateCode}
                  onChange={(event) => setTemplateCode(event.target.value)}
                  className="w-full rounded-xl border border-foreground/10 bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">Use default template</option>
                  {filteredTemplates.map((template) => (
                    <option key={template.id} value={template.code}>
                      {template.name} ({template.code})
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={saving || !reservationId}
                className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Generating…" : "Generate document"}
              </button>
            </form>
          </CardContent>
        </Card>

        <Card className="bg-card shadow-[var(--shadow-soft)] border-none overflow-hidden">
          <CardHeader className="border-b border-foreground/10 bg-foreground/[0.02] px-6 py-5">
            <CardTitle className="text-lg font-editorial text-foreground">Generated Documents</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.1fr]">
              <div className="border-r border-foreground/10">
                <table className="w-full text-left text-sm">
                  <thead className="bg-foreground/[0.01] text-[10px] font-bold uppercase tracking-widest text-foreground-muted">
                    <tr>
                      <th className="px-6 py-4">Document</th>
                      <th className="px-6 py-4">Type</th>
                      <th className="px-6 py-4">Reservation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-foreground/10">
                    {documents.map((document) => (
                      <tr
                        key={document.id}
                        className="cursor-pointer transition-colors hover:bg-foreground/[0.01]"
                        onClick={() => setSelectedDocument(document)}
                      >
                        <td className="px-6 py-4">
                          <p className="font-medium text-foreground">{document.document_number}</p>
                          <p className="text-xs text-foreground-muted">{document.title}</p>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant="secondary" className="capitalize border-transparent">{document.document_kind}</Badge>
                        </td>
                        <td className="px-6 py-4 text-foreground-muted">
                          {document.reservation_id ? `#${document.reservation_id}` : "—"}
                        </td>
                      </tr>
                    ))}
                    {!documents.length && (
                      <tr>
                        <td className="px-6 py-6 text-sm text-foreground-muted" colSpan={3}>
                          No generated hotel documents yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="p-6">
                {selectedDocument ? (
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-foreground-muted">{selectedDocument.document_number}</p>
                        <h2 className="mt-2 text-2xl font-editorial font-bold text-foreground">{selectedDocument.title}</h2>
                        <p className="mt-2 text-sm text-foreground-muted">{selectedDocument.subject || "No subject"}</p>
                      </div>
                      <Badge variant="outline" className="capitalize">{selectedDocument.status}</Badge>
                    </div>
                    <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-4">
                      <pre className="whitespace-pre-wrap text-sm leading-6 text-foreground">{selectedDocument.body_text}</pre>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-foreground-muted">Select a document to preview its generated content.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
