"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/shared/data-table";
import { Loading } from "@/components/shared/loading";

interface Employee {
  id: number;
  name: string;
  email: string;
  role: string;
  department: string;
  status: string;
  hire_date: string;
}

const STATUS_VARIANT: Record<string, "success" | "warning" | "secondary" | "destructive"> = {
  active: "success",
  on_leave: "warning",
  inactive: "secondary",
  terminated: "destructive",
};

export default function EmployeesPage() {
  const { data: employees, isLoading } = useQuery<Employee[]>({
    queryKey: ["workforce-employees"],
    queryFn: async () => {
      const { data } = await api.get("/workforce/employees");
      return data;
    },
  });

  if (isLoading) return <Loading className="py-20" size="lg" />;

  const columns = [
    { key: "name", header: "Name" },
    { key: "email", header: "Email" },
    {
      key: "role",
      header: "Role",
      render: (row: Employee) => <Badge variant="outline">{row.role}</Badge>,
    },
    { key: "department", header: "Department" },
    {
      key: "status",
      header: "Status",
      render: (row: Employee) => (
        <Badge variant={STATUS_VARIANT[row.status] ?? "secondary"}>
          {row.status.replace(/_/g, " ")}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Employees</h1>
        <p className="text-sm text-muted-foreground">Employee directory and management</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Employees</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={(employees ?? []) as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
