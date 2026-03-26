import { Suspense } from "react";
import { LocationDetailClient } from "./location-client";

export default function LocationDetailPage() {
    return (
        <Suspense fallback={<div>Loading location details...</div>}>
            <LocationDetailClient />
        </Suspense>
    );
}
