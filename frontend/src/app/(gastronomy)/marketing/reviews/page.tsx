"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/shared/data-table";
import { Loading } from "@/components/shared/loading";
import { formatDate } from "@/lib/utils";
import { Star } from "lucide-react";

interface Review {
  id: number;
  author: string;
  platform: string;
  rating: number;
  content: string;
  sentiment: string;
  sentiment_score: number;
  has_response: boolean;
  created_at: string;
}

export default function ReviewsPage() {
  const { data: reviews, isLoading } = useQuery<Review[]>({
    queryKey: ["marketing-reviews"],
    queryFn: async () => {
      const { data } = await api.get("/marketing/reviews");
      return data;
    },
  });

  if (isLoading) return <Loading className="py-20" size="lg" />;

  const columns = [
    { key: "author", header: "Author" },
    {
      key: "platform",
      header: "Platform",
      render: (row: Review) => <Badge variant="outline">{row.platform}</Badge>,
    },
    {
      key: "rating",
      header: "Rating",
      render: (row: Review) => (
        <div className="flex items-center gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={`h-3 w-3 ${
                i < row.rating
                  ? "fill-yellow-400 text-yellow-400"
                  : "text-gray-200"
              }`}
            />
          ))}
        </div>
      ),
    },
    {
      key: "sentiment",
      header: "Sentiment",
      render: (row: Review) => (
        <Badge
          variant={
            row.sentiment === "positive"
              ? "success"
              : row.sentiment === "negative"
              ? "destructive"
              : "secondary"
          }
        >
          {row.sentiment} ({(row.sentiment_score * 100).toFixed(0)}%)
        </Badge>
      ),
    },
    {
      key: "has_response",
      header: "Response",
      render: (row: Review) => (
        <Badge variant={row.has_response ? "success" : "warning"}>
          {row.has_response ? "Replied" : "Pending"}
        </Badge>
      ),
    },
    {
      key: "created_at",
      header: "Date",
      render: (row: Review) => formatDate(row.created_at),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Reviews</h1>
        <p className="text-sm text-muted-foreground">Manage and respond to customer reviews</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Reviews</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={(reviews ?? []) as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
