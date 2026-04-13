"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Save, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/components/shared/api-error";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createPmsRatePlan,
  createPmsRateSeason,
  fetchPmsRateMatrix,
  fetchPmsRatePlans,
  fetchPmsRateSeasons,
  updatePmsRateMatrix,
} from "@/features/hms/pms/api/revenue";
import type { PmsRateMatrixEntry, PmsRatePlan } from "@/features/hms/pms/schemas/revenue";
import {
  defaultHotelPropertyId,
  fetchHotelRoomTypes,
  type HotelRoomTypeOption,
} from "@/lib/hotel-room-types";
import { formatCurrency, formatDate } from "@/lib/utils";

type SeasonFormState = {
  name: string;
  start_date: string;
  end_date: string;
  color_hex: string;
};

type PlanFormState = {
  room_type_id: string;
  code: string;
  name: string;
  base_price: string;
};

const defaultSeasonForm: SeasonFormState = {
  name: "",
  start_date: new Date().toISOString().slice(0, 10),
  end_date: new Date().toISOString().slice(0, 10),
  color_hex: "#F59E0B",
};

const defaultPlanForm: PlanFormState = {
  room_type_id: "",
  code: "",
  name: "",
  base_price: "",
};

function addDays(value: string, days: number) {
  const current = new Date(value);
  current.setDate(current.getDate() + days);
  return current.toISOString().slice(0, 10);
}

export default function RatesPage() {
  const [roomTypes, setRoomTypes] = useState<HotelRoomTypeOption[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [matrixStartDate, setMatrixStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [matrixDays, setMatrixDays] = useState(14);
  const [seasonForm, setSeasonForm] = useState<SeasonFormState>(defaultSeasonForm);
  const [planForm, setPlanForm] = useState<PlanFormState>(defaultPlanForm);
  const [draftMatrix, setDraftMatrix] = useState<PmsRateMatrixEntry[]>([]);

  const roomTypesQuery = useQuery({
    queryKey: ["hotel-room-types", defaultHotelPropertyId],
    queryFn: () => fetchHotelRoomTypes(defaultHotelPropertyId),
  });
  const seasonsQuery = useQuery({
    queryKey: ["pms", "rate-seasons"],
    queryFn: () => fetchPmsRateSeasons(),
  });
  const plansQuery = useQuery({
    queryKey: ["pms", "rate-plans"],
    queryFn: () => fetchPmsRatePlans(),
  });

  useEffect(() => {
    if (roomTypesQuery.data) {
      setRoomTypes(roomTypesQuery.data);
      if (!planForm.room_type_id && roomTypesQuery.data[0]) {
        setPlanForm((current) => ({ ...current, room_type_id: String(roomTypesQuery.data[0].id) }));
      }
    }
  }, [planForm.room_type_id, roomTypesQuery.data]);

  useEffect(() => {
    if (!plansQuery.data?.length) {
      setSelectedPlanId(null);
      return;
    }
    if (!selectedPlanId || !plansQuery.data.some((plan) => plan.id === selectedPlanId)) {
      setSelectedPlanId(plansQuery.data[0].id);
    }
  }, [plansQuery.data, selectedPlanId]);

  const matrixQuery = useQuery({
    queryKey: ["pms", "rate-matrix", selectedPlanId, matrixStartDate, matrixDays],
    queryFn: () => fetchPmsRateMatrix(selectedPlanId as number, { start_date: matrixStartDate, days: matrixDays }),
    enabled: Boolean(selectedPlanId),
  });

  useEffect(() => {
    if (matrixQuery.data?.items) {
      setDraftMatrix(matrixQuery.data.items);
    }
  }, [matrixQuery.data]);

  const createSeasonMutation = useMutation({
    mutationFn: () =>
      createPmsRateSeason({
        ...seasonForm,
        is_active: true,
      }),
    onSuccess: async () => {
      toast.success("Season created.");
      setSeasonForm(defaultSeasonForm);
      await seasonsQuery.refetch();
      await matrixQuery.refetch();
    },
    onError: (error) => {
      console.error("Failed to create season", error);
      toast.error("Failed to create season.");
    },
  });

  const createPlanMutation = useMutation({
    mutationFn: () =>
      createPmsRatePlan({
        room_type_id: Number(planForm.room_type_id),
        code: planForm.code,
        name: planForm.name,
        base_price: planForm.base_price ? Number(planForm.base_price) : null,
        currency: "EUR",
        is_active: true,
      }),
    onSuccess: async (plan) => {
      toast.success("Rate plan created.");
      setPlanForm({
        ...defaultPlanForm,
        room_type_id: planForm.room_type_id,
      });
      await plansQuery.refetch();
      setSelectedPlanId(plan.id);
    },
    onError: (error) => {
      console.error("Failed to create rate plan", error);
      toast.error("Failed to create rate plan.");
    },
  });

  const updateMatrixMutation = useMutation({
    mutationFn: () =>
      updatePmsRateMatrix(
        selectedPlanId as number,
        draftMatrix.map((item) => ({
          rate_date: item.rate_date,
          price: Number(item.price),
          closed: Boolean(item.closed),
          closed_to_arrival: Boolean(item.closed_to_arrival),
          closed_to_departure: Boolean(item.closed_to_departure),
          min_stay: item.min_stay ?? null,
          max_stay: item.max_stay ?? null,
          notes: item.notes || null,
        })),
      ),
    onSuccess: async () => {
      toast.success("Rate matrix saved.");
      await matrixQuery.refetch();
    },
    onError: (error) => {
      console.error("Failed to save rate matrix", error);
      toast.error("Failed to save rate matrix.");
    },
  });

  const selectedPlan = useMemo<PmsRatePlan | null>(
    () => plansQuery.data?.find((plan) => plan.id === selectedPlanId) || null,
    [plansQuery.data, selectedPlanId],
  );

  const activeRestrictions = draftMatrix.filter(
    (item) =>
      item.closed ||
      item.closed_to_arrival ||
      item.closed_to_departure ||
      item.min_stay !== null ||
      item.max_stay !== null,
  ).length;

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-4xl font-editorial font-bold text-foreground tracking-tight">Rate Manager</h1>
          <p className="mt-1 text-foreground-muted">Manage seasons, rate plans, daily pricing, and restriction rules.</p>
        </div>
        <button
          type="button"
          onClick={() => updateMatrixMutation.mutate()}
          disabled={!selectedPlanId || updateMatrixMutation.isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {updateMatrixMutation.isPending ? "Saving..." : "Save Matrix"}
        </button>
      </div>

      {(roomTypesQuery.error || seasonsQuery.error || plansQuery.error) ? (
        <ApiError
          message="Failed to load the revenue manager."
          onRetry={() => {
            void roomTypesQuery.refetch();
            void seasonsQuery.refetch();
            void plansQuery.refetch();
          }}
          dismissible={false}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
        <Card className="bg-card shadow-[var(--shadow-soft)] border-none">
          <CardContent className="p-6">
            <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">Seasons</p>
            <h3 className="mt-3 text-4xl font-editorial font-bold text-foreground">{seasonsQuery.data?.length || 0}</h3>
          </CardContent>
        </Card>
        <Card className="bg-card shadow-[var(--shadow-soft)] border-none">
          <CardContent className="p-6">
            <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">Rate Plans</p>
            <h3 className="mt-3 text-4xl font-editorial font-bold text-foreground">{plansQuery.data?.length || 0}</h3>
          </CardContent>
        </Card>
        <Card className="bg-card shadow-[var(--shadow-soft)] border-none">
          <CardContent className="p-6">
            <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">Matrix Window</p>
            <h3 className="mt-3 text-4xl font-editorial font-bold text-foreground">{matrixDays}</h3>
          </CardContent>
        </Card>
        <Card className="bg-card shadow-[var(--shadow-soft)] border-none">
          <CardContent className="p-6">
            <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">Restriction Days</p>
            <div className="mt-3 flex items-center gap-3">
              <h3 className="text-4xl font-editorial font-bold text-foreground">{activeRestrictions}</h3>
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6">
          <Card className="bg-card shadow-[var(--shadow-soft)] border-none">
            <CardHeader className="border-b border-foreground/10 bg-foreground/[0.02] px-6 py-5">
              <CardTitle className="text-lg font-editorial text-foreground">Season Calendar</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-6">
              <form
                className="grid gap-3 md:grid-cols-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  createSeasonMutation.mutate();
                }}
              >
                <input
                  required
                  value={seasonForm.name}
                  onChange={(event) => setSeasonForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Spring Weekend"
                  className="rounded-xl border border-foreground/10 bg-background px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 md:col-span-2"
                />
                <input
                  required
                  type="date"
                  value={seasonForm.start_date}
                  onChange={(event) => setSeasonForm((current) => ({ ...current, start_date: event.target.value }))}
                  className="rounded-xl border border-foreground/10 bg-background px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                />
                <input
                  required
                  type="date"
                  value={seasonForm.end_date}
                  onChange={(event) => setSeasonForm((current) => ({ ...current, end_date: event.target.value }))}
                  className="rounded-xl border border-foreground/10 bg-background px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                />
                <input
                  type="color"
                  value={seasonForm.color_hex}
                  onChange={(event) => setSeasonForm((current) => ({ ...current, color_hex: event.target.value }))}
                  className="h-12 rounded-xl border border-foreground/10 bg-background px-2 py-2"
                />
                <button
                  type="submit"
                  disabled={createSeasonMutation.isPending}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  <Plus className="h-4 w-4" />
                  Add Season
                </button>
              </form>

              <div className="space-y-3">
                {(seasonsQuery.data || []).map((season) => (
                  <div key={season.id} className="rounded-2xl border border-foreground/10 bg-background px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{season.name}</p>
                        <p className="mt-1 text-xs text-foreground-muted">
                          {formatDate(season.start_date)} - {formatDate(season.end_date)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: season.color_hex || "#F59E0B" }} />
                        <Badge variant="outline">{season.is_active ? "Active" : "Inactive"}</Badge>
                      </div>
                    </div>
                  </div>
                ))}
                {!seasonsQuery.isLoading && !(seasonsQuery.data || []).length ? (
                  <p className="text-sm text-foreground-muted">No seasonal windows configured yet.</p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card shadow-[var(--shadow-soft)] border-none">
            <CardHeader className="border-b border-foreground/10 bg-foreground/[0.02] px-6 py-5">
              <CardTitle className="text-lg font-editorial text-foreground">Rate Plans</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-6">
              <form
                className="grid gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  createPlanMutation.mutate();
                }}
              >
                <select
                  required
                  value={planForm.room_type_id}
                  onChange={(event) => setPlanForm((current) => ({ ...current, room_type_id: event.target.value }))}
                  className="rounded-xl border border-foreground/10 bg-background px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">Select room type</option>
                  {roomTypes.map((roomType) => (
                    <option key={roomType.id} value={roomType.id}>
                      {roomType.name}
                    </option>
                  ))}
                </select>
                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    required
                    value={planForm.code}
                    onChange={(event) => setPlanForm((current) => ({ ...current, code: event.target.value }))}
                    placeholder="BAR_KPLUS"
                    className="rounded-xl border border-foreground/10 bg-background px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <input
                    required
                    value={planForm.name}
                    onChange={(event) => setPlanForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Best Available Rate"
                    className="rounded-xl border border-foreground/10 bg-background px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={planForm.base_price}
                    onChange={(event) => setPlanForm((current) => ({ ...current, base_price: event.target.value }))}
                    placeholder="149.00"
                    className="rounded-xl border border-foreground/10 bg-background px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <button
                    type="submit"
                    disabled={createPlanMutation.isPending}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    <Plus className="h-4 w-4" />
                    Add Plan
                  </button>
                </div>
              </form>

              <div className="space-y-3">
                {(plansQuery.data || []).map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlanId(plan.id)}
                    className={
                      selectedPlanId === plan.id
                        ? "w-full rounded-2xl border border-primary/40 bg-primary/5 px-4 py-3 text-left"
                        : "w-full rounded-2xl border border-foreground/10 bg-background px-4 py-3 text-left transition-colors hover:bg-foreground/[0.03]"
                    }
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{plan.name}</p>
                        <p className="mt-1 text-xs text-foreground-muted">
                          {plan.code} · {plan.room_type_name || "Room type"} · {formatCurrency(plan.base_price)}
                        </p>
                      </div>
                      <Badge variant="outline">{plan.currency}</Badge>
                    </div>
                  </button>
                ))}
                {!plansQuery.isLoading && !(plansQuery.data || []).length ? (
                  <p className="text-sm text-foreground-muted">No rate plans created yet.</p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-card shadow-[var(--shadow-soft)] border-none overflow-hidden">
          <CardHeader className="border-b border-foreground/10 bg-foreground/[0.02] px-6 py-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <CardTitle className="text-lg font-editorial text-foreground">Pricing Matrix</CardTitle>
                <p className="mt-1 text-sm text-foreground-muted">
                  {selectedPlan ? `${selectedPlan.name} · ${selectedPlan.room_type_name}` : "Select a rate plan to manage daily pricing."}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-sm text-foreground-muted">
                  <span className="mr-2">Start</span>
                  <input
                    type="date"
                    value={matrixStartDate}
                    onChange={(event) => setMatrixStartDate(event.target.value)}
                    className="rounded-xl border border-foreground/10 bg-card px-3 py-2 text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </label>
                <label className="text-sm text-foreground-muted">
                  <span className="mr-2">Days</span>
                  <select
                    value={matrixDays}
                    onChange={(event) => setMatrixDays(Number(event.target.value))}
                    className="rounded-xl border border-foreground/10 bg-card px-3 py-2 text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value={7}>7</option>
                    <option value={14}>14</option>
                    <option value={21}>21</option>
                  </select>
                </label>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {matrixQuery.isLoading ? (
              <div className="p-8 text-sm text-foreground-muted">Loading rate matrix...</div>
            ) : matrixQuery.error ? (
              <div className="p-6">
                <ApiError
                  message="Failed to load the rate matrix."
                  onRetry={() => void matrixQuery.refetch()}
                  dismissible={false}
                />
              </div>
            ) : !selectedPlan ? (
              <div className="p-8 text-sm text-foreground-muted">Create or select a rate plan to start pricing dates.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-sm">
                  <thead className="bg-foreground/[0.01] text-[10px] font-bold uppercase tracking-widest text-foreground-muted">
                    <tr>
                      <th className="px-4 py-4 text-left">Date</th>
                      <th className="px-4 py-4 text-left">Season</th>
                      <th className="px-4 py-4 text-left">Price</th>
                      <th className="px-4 py-4 text-center">Closed</th>
                      <th className="px-4 py-4 text-center">CTA</th>
                      <th className="px-4 py-4 text-center">CTD</th>
                      <th className="px-4 py-4 text-left">Min Stay</th>
                      <th className="px-4 py-4 text-left">Max Stay</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-foreground/10">
                    {draftMatrix.map((entry, index) => (
                      <tr key={entry.rate_date} className="hover:bg-foreground/[0.01] transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">{formatDate(entry.rate_date)}</div>
                          <div className="text-xs text-foreground-muted">{entry.rate_date}</div>
                        </td>
                        <td className="px-4 py-3">
                          {entry.season_name ? (
                            <Badge variant="secondary" className="border-transparent bg-primary/10 text-primary">
                              {entry.season_name}
                            </Badge>
                          ) : (
                            <span className="text-xs text-foreground-muted">Base</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={entry.price}
                            onChange={(event) =>
                              setDraftMatrix((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, price: Number(event.target.value || 0) } : item,
                                ),
                              )
                            }
                            className="w-28 rounded-xl border border-foreground/10 bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={entry.closed}
                            onChange={(event) =>
                              setDraftMatrix((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, closed: event.target.checked } : item,
                                ),
                              )
                            }
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={entry.closed_to_arrival}
                            onChange={(event) =>
                              setDraftMatrix((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, closed_to_arrival: event.target.checked } : item,
                                ),
                              )
                            }
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={entry.closed_to_departure}
                            onChange={(event) =>
                              setDraftMatrix((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, closed_to_departure: event.target.checked } : item,
                                ),
                              )
                            }
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="1"
                            value={entry.min_stay ?? ""}
                            onChange={(event) =>
                              setDraftMatrix((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? { ...item, min_stay: event.target.value ? Number(event.target.value) : null }
                                    : item,
                                ),
                              )
                            }
                            className="w-20 rounded-xl border border-foreground/10 bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="1"
                            value={entry.max_stay ?? ""}
                            onChange={(event) =>
                              setDraftMatrix((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? { ...item, max_stay: event.target.value ? Number(event.target.value) : null }
                                    : item,
                                ),
                              )
                            }
                            className="w-20 rounded-xl border border-foreground/10 bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
