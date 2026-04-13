"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Mail, Plus, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/components/shared/api-error";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createPmsMessageTemplate,
  fetchPmsMessageTemplates,
  fetchPmsMessageThreads,
  updatePmsMessageTemplate,
} from "@/features/hms/pms/api/comms";
import type { PmsMessageTemplate } from "@/features/hms/pms/schemas/comms";
import { formatDateTime } from "@/lib/utils";

type TemplateFormState = {
  code: string;
  name: string;
  category: string;
  subject_template: string;
  body_template: string;
};

const defaultTemplateForm: TemplateFormState = {
  code: "",
  name: "",
  category: "guest_message",
  subject_template: "",
  body_template: "",
};

function latestPreview(body: string | null | undefined) {
  const normalized = (body || "").trim();
  return normalized.length > 140 ? `${normalized.slice(0, 137)}...` : normalized;
}

export default function CommsPage() {
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [templateForm, setTemplateForm] = useState<TemplateFormState>(defaultTemplateForm);

  const templatesQuery = useQuery({
    queryKey: ["pms", "message-templates"],
    queryFn: () => fetchPmsMessageTemplates(),
  });
  const threadsQuery = useQuery({
    queryKey: ["pms", "message-threads"],
    queryFn: () => fetchPmsMessageThreads(),
  });

  const selectedTemplate = useMemo<PmsMessageTemplate | null>(
    () => templatesQuery.data?.find((template) => template.id === selectedTemplateId) || null,
    [selectedTemplateId, templatesQuery.data],
  );

  useEffect(() => {
    if (!selectedTemplate) {
      return;
    }
    setTemplateForm({
      code: selectedTemplate.code,
      name: selectedTemplate.name,
      category: selectedTemplate.category,
      subject_template: selectedTemplate.subject_template || "",
      body_template: selectedTemplate.body_template,
    });
  }, [selectedTemplate]);

  const saveTemplateMutation = useMutation({
    mutationFn: async () => {
      if (selectedTemplate?.property_id) {
        return updatePmsMessageTemplate(selectedTemplate.id, {
          name: templateForm.name,
          category: templateForm.category,
          subject_template: templateForm.subject_template || null,
          body_template: templateForm.body_template,
        });
      }
      return createPmsMessageTemplate({
        code: templateForm.code,
        name: templateForm.name,
        category: templateForm.category,
        subject_template: templateForm.subject_template || null,
        body_template: templateForm.body_template,
        channel: "email",
        is_default: false,
        is_active: true,
      });
    },
    onSuccess: async (template) => {
      await templatesQuery.refetch();
      setSelectedTemplateId(template.id);
      toast.success(selectedTemplate?.property_id ? "Template updated." : "Template created.");
    },
    onError: (error) => {
      console.error("Failed to save message template", error);
      toast.error("Failed to save the template.");
    },
  });

  function resetTemplateForm() {
    setSelectedTemplateId(null);
    setTemplateForm(defaultTemplateForm);
  }

  function submitTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveTemplateMutation.mutate();
  }

  const threads = threadsQuery.data || [];
  const templates = templatesQuery.data || [];
  const sentEvents = threads.reduce((count, thread) => count + thread.events.filter((event) => event.status === "sent").length, 0);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-4xl font-editorial font-bold text-foreground tracking-tight">Communications Hub</h1>
          <p className="mt-1 text-foreground-muted">
            Manage guest message templates and review reservation-linked email history.
          </p>
        </div>
        <a
          href="/hms/email-inbox"
          className="inline-flex items-center gap-2 rounded-xl border border-foreground/10 px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/[0.03]"
        >
          <Sparkles className="h-4 w-4 text-primary" />
          Open AI Inbox
        </a>
      </div>

      {(templatesQuery.error || threadsQuery.error) ? (
        <ApiError
          message="Failed to load the communications hub."
          onRetry={() => {
            void templatesQuery.refetch();
            void threadsQuery.refetch();
          }}
          dismissible={false}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card className="border-none bg-card shadow-[var(--shadow-soft)]">
          <CardContent className="p-6">
            <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">Templates</p>
            <h3 className="mt-3 text-4xl font-editorial font-bold text-foreground">{templates.length}</h3>
          </CardContent>
        </Card>
        <Card className="border-none bg-card shadow-[var(--shadow-soft)]">
          <CardContent className="p-6">
            <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">Threads</p>
            <h3 className="mt-3 text-4xl font-editorial font-bold text-foreground">{threads.length}</h3>
          </CardContent>
        </Card>
        <Card className="border-none bg-card shadow-[var(--shadow-soft)]">
          <CardContent className="p-6">
            <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">Sent Messages</p>
            <div className="mt-3 flex items-center gap-3">
              <h3 className="text-4xl font-editorial font-bold text-foreground">{sentEvents}</h3>
              <Mail className="h-5 w-5 text-primary" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="border-none bg-card shadow-[var(--shadow-soft)]">
          <CardHeader className="border-b border-foreground/10 bg-foreground/[0.02] px-6 py-5">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-lg font-editorial text-foreground">Template Builder</CardTitle>
              <button
                type="button"
                onClick={resetTemplateForm}
                className="inline-flex items-center gap-2 rounded-xl border border-foreground/10 px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/[0.03]"
              >
                <Plus className="h-4 w-4" />
                New
              </button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 p-6">
            <form className="space-y-4" onSubmit={submitTemplate}>
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  required
                  value={templateForm.code}
                  onChange={(event) => setTemplateForm((current) => ({ ...current, code: event.target.value }))}
                  disabled={Boolean(selectedTemplate?.property_id)}
                  placeholder="pre_arrival_note"
                  className="rounded-xl border border-foreground/10 bg-background px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
                />
                <input
                  required
                  value={templateForm.name}
                  onChange={(event) => setTemplateForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Pre-Arrival Note"
                  className="rounded-xl border border-foreground/10 bg-background px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <input
                value={templateForm.category}
                onChange={(event) => setTemplateForm((current) => ({ ...current, category: event.target.value }))}
                placeholder="guest_message"
                className="w-full rounded-xl border border-foreground/10 bg-background px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />
              <input
                value={templateForm.subject_template}
                onChange={(event) => setTemplateForm((current) => ({ ...current, subject_template: event.target.value }))}
                placeholder="Ihre Anreise {{booking_id}}"
                className="w-full rounded-xl border border-foreground/10 bg-background px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />
              <textarea
                required
                value={templateForm.body_template}
                onChange={(event) => setTemplateForm((current) => ({ ...current, body_template: event.target.value }))}
                placeholder="Hallo {{guest_name}}, ..."
                className="min-h-[220px] w-full rounded-2xl border border-foreground/10 bg-background px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-foreground-muted">
                  {selectedTemplate?.property_id === null
                    ? "System templates are read-only. Create a new custom template to adapt them."
                    : "Use placeholders like {{guest_name}}, {{booking_id}}, {{check_in}}, and {{property_name}}."}
                </p>
                <button
                  type="submit"
                  disabled={saveTemplateMutation.isPending || selectedTemplate?.property_id === null}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  {saveTemplateMutation.isPending ? "Saving..." : selectedTemplate?.property_id ? "Update Template" : "Create Template"}
                </button>
              </div>
            </form>

            <div className="space-y-3">
              {templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setSelectedTemplateId(template.id)}
                  className={
                    selectedTemplateId === template.id
                      ? "w-full rounded-2xl border border-primary/40 bg-primary/5 px-4 py-3 text-left"
                      : "w-full rounded-2xl border border-foreground/10 bg-background px-4 py-3 text-left transition-colors hover:bg-foreground/[0.03]"
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{template.name}</p>
                      <p className="mt-1 text-xs text-foreground-muted">{template.code} · {template.category}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {template.property_id === null ? <Badge variant="outline">System</Badge> : null}
                      {!template.is_active ? <Badge variant="secondary">Inactive</Badge> : null}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-none bg-card shadow-[var(--shadow-soft)]">
          <CardHeader className="border-b border-foreground/10 bg-foreground/[0.02] px-6 py-5">
            <CardTitle className="text-lg font-editorial text-foreground">Guest Threads</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-6">
            {!threads.length && !threadsQuery.isLoading ? (
              <p className="text-sm text-foreground-muted">No reservation-linked guest messages have been sent yet.</p>
            ) : null}
            {threads.map((thread) => {
              const latestEvent = thread.events[thread.events.length - 1] || null;
              return (
                <div key={thread.id} className="rounded-2xl border border-foreground/10 bg-background px-4 py-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {thread.subject || thread.guest_name || "Guest Thread"}
                      </p>
                      <p className="mt-1 text-xs text-foreground-muted">
                        {thread.guest_email || "No email"} ·{" "}
                        {thread.last_message_at ? formatDateTime(thread.last_message_at) : "No activity yet"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {thread.reservation_id ? <Badge variant="outline">Reservation #{thread.reservation_id}</Badge> : null}
                      <Badge variant="secondary" className="capitalize border-transparent">{thread.status}</Badge>
                    </div>
                  </div>
                  {latestEvent ? (
                    <div className="mt-4 rounded-2xl border border-foreground/10 bg-foreground/[0.02] px-4 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">
                        Latest Message
                      </p>
                      <p className="mt-2 text-sm text-foreground">{latestPreview(latestEvent.body_text)}</p>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
