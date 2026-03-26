"use client";

import { Card, CardContent } from "@/components/ui/card";
import { FlaskConical } from "lucide-react";

export default function SimulationResultsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Simulation Results</h1>
        <p className="text-sm text-muted-foreground">View and compare scenario outcomes</p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-20 text-center">
          <FlaskConical className="h-16 w-16 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold text-foreground">Select a Scenario</h3>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Choose a scenario from the simulation page to view its results and analysis here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
