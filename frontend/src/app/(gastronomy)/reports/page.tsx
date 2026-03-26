"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download, BarChart3, PieChart } from "lucide-react";

const REPORT_TYPES = [
  { name: "Daily P&L", description: "Profit and loss statement for the day", icon: BarChart3 },
  { name: "Weekly Summary", description: "Weekly operations overview", icon: PieChart },
  { name: "Inventory Valuation", description: "Current stock value report", icon: FileText },
  { name: "Labor Cost Analysis", description: "Workforce cost breakdown", icon: BarChart3 },
  { name: "Guest Analytics", description: "Customer behavior report", icon: PieChart },
  { name: "Food Cost Report", description: "COGS and margin analysis", icon: FileText },
];

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Reports</h1>
        <p className="text-sm text-muted-foreground">Generate and download operational reports</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORT_TYPES.map((report) => {
          const Icon = report.icon;
          return (
            <Card key={report.name} className="transition-shadow hover:shadow-md">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className="h-5 w-5 text-brand-500" />
                  {report.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-4 text-sm text-muted-foreground">{report.description}</p>
                <Button variant="outline" size="sm" className="w-full">
                  <Download className="mr-2 h-4 w-4" />
                  Generate Report
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
