import { cn } from "@/lib/utils";

export interface Column<T = any> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
}

interface DataTableProps {
  columns: Column<any>[];
  data: any[];
  loading?: boolean;
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 w-full animate-pulse rounded shimmer" />
        </td>
      ))}
    </tr>
  );
}

export function DataTable({
  columns,
  data,
  loading = false,
}: DataTableProps) {
  if (loading) {
    return (
      <div className="w-full overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] bg-white/[0.03]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-4 py-3 text-left font-medium text-muted-foreground"
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonRow key={i} cols={columns.length} />
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">No data found</p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.06] bg-white/[0.03]">
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-4 py-3 text-left font-medium text-muted-foreground"
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr
              key={row.id || rowIndex}
              className={cn(
                "border-b border-white/[0.04] transition-colors hover:bg-white/[0.04]",
                rowIndex % 2 === 0 ? "bg-transparent" : "bg-white/[0.02]"
              )}
            >
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-3 text-foreground/80">
                  {col.render
                    ? col.render(row)
                    : (row[col.key] as React.ReactNode)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
