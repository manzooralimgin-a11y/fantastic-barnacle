"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/components/shared/api-error";
import { Crown, Loader2, RotateCcw, Save, Search, Star, Users } from "lucide-react";
import {
  fetchHmsCrmGuests,
  type HotelCrmGuest,
  updateHmsCrmGuest,
} from "@/lib/hms";
import { cn } from "@/lib/utils";

const salutationOptions = ["Mr", "Ms", "Mx", "Family", "Company"];

function getTier(guest: HotelCrmGuest): "Gold" | "Silver" | "Bronze" {
  if (guest.reservation_count >= 10) {
    return "Gold";
  }
  if (guest.reservation_count >= 4) {
    return "Silver";
  }
  return "Bronze";
}

const tierColors: Record<string, string> = {
  Gold: "bg-primary/10 text-primary",
  Silver: "bg-foreground/10 text-foreground-muted",
  Bronze: "bg-orange-500/10 text-orange-600",
};

type GuestFormState = {
  salutation: string;
  birthday: string;
  countryCode: string;
  countryName: string;
  customFieldsText: string;
};

function emptyGuestForm(): GuestFormState {
  return {
    salutation: "",
    birthday: "",
    countryCode: "",
    countryName: "",
    customFieldsText: "{}",
  };
}

function getUpcomingBirthdays(guests: HotelCrmGuest[]) {
  const now = new Date();
  const threshold = new Date(now);
  threshold.setDate(threshold.getDate() + 30);
  return guests.filter((guest) => {
    if (!guest.birthday) {
      return false;
    }
    const birthday = new Date(guest.birthday);
    const upcoming = new Date(now.getFullYear(), birthday.getMonth(), birthday.getDate());
    if (upcoming < now) {
      upcoming.setFullYear(upcoming.getFullYear() + 1);
    }
    return upcoming <= threshold;
  }).length;
}

export default function CRMPage() {
  const [guests, setGuests] = useState<HotelCrmGuest[]>([]);
  const [selectedGuestId, setSelectedGuestId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [guestForm, setGuestForm] = useState<GuestFormState>(emptyGuestForm);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadGuests(search);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [search]);

  async function loadGuests(searchTerm = "") {
    try {
      setLoading(true);
      const nextGuests = await fetchHmsCrmGuests(undefined, searchTerm);
      setGuests(nextGuests);
      setFetchError(null);
      setSelectedGuestId((current) => current ?? nextGuests[0]?.id ?? null);
    } catch (error) {
      console.error("Failed to load hotel CRM guests", error);
      setFetchError("Failed to load hotel CRM guests.");
    } finally {
      setLoading(false);
    }
  }

  const selectedGuest = useMemo(
    () => guests.find((guest) => guest.id === selectedGuestId) ?? null,
    [guests, selectedGuestId],
  );

  useEffect(() => {
    if (!selectedGuest) {
      setGuestForm(emptyGuestForm());
      return;
    }
    setGuestForm({
      salutation: selectedGuest.salutation ?? "",
      birthday: selectedGuest.birthday ?? "",
      countryCode: selectedGuest.country_code ?? "",
      countryName: selectedGuest.country_name ?? "",
      customFieldsText: JSON.stringify(selectedGuest.custom_fields_json ?? {}, null, 2),
    });
  }, [selectedGuest]);

  const stats = [
    { label: "Total Guests", value: guests.length, icon: Users },
    {
      label: "Returning Guests",
      value: guests.filter((guest) => guest.reservation_count > 1).length,
      icon: RotateCcw,
    },
    {
      label: "Known Birthdays",
      value: guests.filter((guest) => Boolean(guest.birthday)).length,
      icon: Crown,
    },
    { label: "Upcoming Birthdays", value: getUpcomingBirthdays(guests), icon: Star },
  ];

  async function handleSave() {
    if (!selectedGuest) {
      return;
    }
    try {
      setSaving(true);
      setSaveError(null);
      const parsedCustomFields = guestForm.customFieldsText.trim()
        ? JSON.parse(guestForm.customFieldsText)
        : {};
      const updatedGuest = await updateHmsCrmGuest(selectedGuest.id, {
        salutation: guestForm.salutation || null,
        birthday: guestForm.birthday || null,
        country_code: guestForm.countryCode || null,
        country_name: guestForm.countryName || null,
        custom_fields_json: parsedCustomFields,
      });
      setGuests((current) =>
        current.map((guest) => (guest.id === updatedGuest.id ? updatedGuest : guest)),
      );
    } catch (error) {
      console.error("Failed to save hotel CRM guest", error);
      setSaveError("Failed to save guest enrichment. Check custom field JSON.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div>
        <h1 className="text-4xl font-editorial font-bold text-foreground tracking-tight">
          Guest CRM
        </h1>
        <p className="text-foreground-muted mt-1">
          Live hotel guest profiles with enrichment fields and stay history.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="bg-card shadow-[var(--shadow-soft)] border-none">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">
                  {label}
                </p>
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                  <Icon className="w-5 h-5" />
                </div>
              </div>
              <h3 className="text-4xl font-editorial font-bold text-foreground">{value}</h3>
            </CardContent>
          </Card>
        ))}
      </div>

      {fetchError && <ApiError message={fetchError} dismissible={false} />}

      <div className="grid grid-cols-1 xl:grid-cols-[1.45fr_1fr] gap-6">
        <Card className="bg-card shadow-[var(--shadow-soft)] border-none overflow-hidden">
          <CardHeader className="border-b border-foreground/10 bg-foreground/[0.02] px-6 py-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <CardTitle className="text-lg font-editorial text-foreground">
                Guest Profiles
              </CardTitle>
              <div className="relative max-w-sm w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search guests..."
                  className="w-full bg-background border border-foreground/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 flex items-center gap-3 text-foreground-muted">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading guest profiles...
              </div>
            ) : guests.length === 0 ? (
              <div className="p-8 text-sm text-foreground-muted">
                No hotel guest profiles found for this property yet.
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="text-[10px] uppercase tracking-widest text-foreground-muted font-bold bg-foreground/[0.01]">
                  <tr>
                    <th className="px-6 py-4">Guest</th>
                    <th className="px-6 py-4">Country</th>
                    <th className="px-6 py-4">Reservations</th>
                    <th className="px-6 py-4">Birthday</th>
                    <th className="px-6 py-4">Tier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-foreground/10">
                  {guests.map((guest) => {
                    const tier = getTier(guest);
                    return (
                      <tr
                        key={guest.id}
                        className={cn(
                          "cursor-pointer transition-colors hover:bg-foreground/[0.01]",
                          selectedGuestId === guest.id && "bg-primary/5",
                        )}
                        onClick={() => setSelectedGuestId(guest.id)}
                      >
                        <td className="px-6 py-4">
                          <div className="font-medium text-foreground">
                            {guest.name || "Unnamed guest"}
                          </div>
                          <div className="text-xs text-foreground-muted">
                            {guest.email || guest.phone || "No contact data"}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-foreground-muted">
                          {guest.country_name || guest.country_code || "Unknown"}
                        </td>
                        <td className="px-6 py-4 font-mono text-foreground">
                          {guest.reservation_count}
                        </td>
                        <td className="px-6 py-4 text-foreground-muted">
                          {guest.birthday
                            ? new Date(guest.birthday).toLocaleDateString("de-DE")
                            : "Not set"}
                        </td>
                        <td className="px-6 py-4">
                          <Badge
                            variant="secondary"
                            className={cn(
                              "text-[10px] font-bold border-transparent rounded-full",
                              tierColors[tier],
                            )}
                          >
                            {tier}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card shadow-[var(--shadow-soft)] border-none">
          <CardHeader className="border-b border-foreground/10 bg-foreground/[0.02] px-6 py-5">
            <CardTitle className="text-lg font-editorial text-foreground">
              CRM Enrichment
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-5">
            {!selectedGuest ? (
              <p className="text-sm text-foreground-muted">
                Select a guest to view and update enriched CRM fields.
              </p>
            ) : (
              <>
                <div className="space-y-1">
                  <h3 className="text-xl font-editorial font-bold text-foreground">
                    {selectedGuest.name || "Unnamed guest"}
                  </h3>
                  <p className="text-sm text-foreground-muted">
                    {selectedGuest.email || "No email"} · {selectedGuest.phone || "No phone"}
                  </p>
                  <p className="text-xs uppercase tracking-widest text-foreground-muted">
                    Last stay:{" "}
                    {selectedGuest.last_stay_date
                      ? new Date(selectedGuest.last_stay_date).toLocaleDateString("de-DE")
                      : "No stay recorded"}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-foreground-muted">
                      Salutation
                    </label>
                    <select
                      value={guestForm.salutation}
                      onChange={(event) =>
                        setGuestForm((current) => ({
                          ...current,
                          salutation: event.target.value,
                        }))
                      }
                      className="w-full bg-background border border-foreground/10 rounded-xl px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <option value="">Select</option>
                      {salutationOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-foreground-muted">
                      Birthday
                    </label>
                    <input
                      type="date"
                      value={guestForm.birthday}
                      onChange={(event) =>
                        setGuestForm((current) => ({
                          ...current,
                          birthday: event.target.value,
                        }))
                      }
                      className="w-full bg-background border border-foreground/10 rounded-xl px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-foreground-muted">
                      Country Code
                    </label>
                    <input
                      value={guestForm.countryCode}
                      onChange={(event) =>
                        setGuestForm((current) => ({
                          ...current,
                          countryCode: event.target.value.toUpperCase(),
                        }))
                      }
                      className="w-full bg-background border border-foreground/10 rounded-xl px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="DE"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-foreground-muted">
                      Country Name
                    </label>
                    <input
                      value={guestForm.countryName}
                      onChange={(event) =>
                        setGuestForm((current) => ({
                          ...current,
                          countryName: event.target.value,
                        }))
                      }
                      className="w-full bg-background border border-foreground/10 rounded-xl px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="Germany"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-foreground-muted">
                    Custom Fields (JSON)
                  </label>
                  <textarea
                    value={guestForm.customFieldsText}
                    onChange={(event) =>
                      setGuestForm((current) => ({
                        ...current,
                        customFieldsText: event.target.value,
                      }))
                    }
                    className="min-h-40 w-full bg-background border border-foreground/10 rounded-xl px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>

                {saveError && <ApiError message={saveError} dismissible={false} />}

                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.01] disabled:opacity-60"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save CRM Fields
                </button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
