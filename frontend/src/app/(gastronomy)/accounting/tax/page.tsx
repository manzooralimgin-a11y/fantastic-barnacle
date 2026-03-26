"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/shared/stat-card";
import { FileText, Calendar, Shield } from "lucide-react";

export default function TaxPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Tax Management</h1>
        <p className="text-sm text-muted-foreground">Tax filing and compliance automation</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard title="Filing Status" value="Up to date" icon={FileText} />
        <StatCard title="Next Filing" value="Q1 2026" icon={Calendar} />
        <StatCard title="Compliance" value="100%" icon={Shield} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tax Filing Automation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-500/10 mb-4">
              <FileText className="h-8 w-8 text-brand-500" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">Coming Soon</h3>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Automated tax filing, sales tax calculations, and compliance reporting will be available here.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
