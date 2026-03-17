"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/shared/stat-card";
import { Loading } from "@/components/shared/loading";
import { formatRelativeTime } from "@/lib/utils";
import { Star, MessageSquare, TrendingUp } from "lucide-react";

interface ReputationData {
  reputation_score: number;
  avg_rating: number;
  total_reviews: number;
  sentiment_positive: number;
  sentiment_neutral: number;
  sentiment_negative: number;
}

interface Review {
  id: number;
  author: string;
  platform: string;
  rating: number;
  content: string;
  sentiment: string;
  has_response: boolean;
  created_at: string;
}

export default function MarketingPage() {
  const { data: reputation, isLoading: repLoading } = useQuery<ReputationData>({
    queryKey: ["marketing-reputation"],
    queryFn: async () => {
      const { data } = await api.get("/marketing/reputation");
      return data;
    },
  });

  const { data: reviews, isLoading: reviewsLoading } = useQuery<Review[]>({
    queryKey: ["marketing-reviews"],
    queryFn: async () => {
      const { data } = await api.get("/marketing/reviews");
      return data;
    },
  });

  if (repLoading && reviewsLoading) return <Loading className="py-20" size="lg" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Marketing & Reputation</h1>
        <p className="text-sm text-muted-foreground">Online reputation and review management</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          title="Reputation Score"
          value={reputation?.reputation_score ?? 0}
          icon={TrendingUp}
        />
        <StatCard
          title="Average Rating"
          value={`${reputation?.avg_rating?.toFixed(1) ?? "0.0"} / 5.0`}
          icon={Star}
        />
        <StatCard
          title="Total Reviews"
          value={reputation?.total_reviews ?? 0}
          icon={MessageSquare}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Reviews</CardTitle>
        </CardHeader>
        <CardContent>
          {reviewsLoading ? (
            <Loading className="py-8" />
          ) : (reviews ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No reviews yet</p>
          ) : (
            <div className="space-y-4">
              {(reviews ?? []).slice(0, 8).map((review) => (
                <div
                  key={review.id}
                  className="rounded-lg border border-border p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {review.author}
                      </span>
                      <Badge variant="outline">{review.platform}</Badge>
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={`h-3 w-3 ${
                              i < review.rating
                                ? "fill-yellow-400 text-yellow-400"
                                : "text-gray-200"
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          review.sentiment === "positive"
                            ? "success"
                            : review.sentiment === "negative"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {review.sentiment}
                      </Badge>
                      {review.has_response && (
                        <Badge variant="default">Replied</Badge>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{review.content}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {formatRelativeTime(review.created_at)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
