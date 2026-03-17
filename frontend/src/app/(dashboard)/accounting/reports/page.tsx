"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, BarChart3, Wallet, PieChart } from "lucide-react";

const REPORT_TYPES = [
  {
    title: "Profit & Loss",
    description: "Revenue, expenses, and net income over a selected period",
    icon: BarChart3,
  },
  {
    title: "Balance Sheet",
    description: "Assets, liabilities, and equity snapshot",
    icon: Wallet,
  },
  {
    title: "Cash Flow",
    description: "Operating, investing, and financing cash movements",
    icon: FileText,
  },
  {
    title: "Budget vs Actual",
    description: "Compare budgeted amounts against actual performance",
    icon: PieChart,
  },
];

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Financial Reports</h1>
        <p className="text-sm text-muted-foreground">Generate and view financial reports</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {REPORT_TYPES.map((report) => {
          const Icon = report.icon;
          return (
            <Card key={report.title}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/10">
                    <Icon className="h-5 w-5 text-brand-500" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{report.title}</CardTitle>
                    <CardDescription>{report.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Button className="w-full">Generate Report</Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
