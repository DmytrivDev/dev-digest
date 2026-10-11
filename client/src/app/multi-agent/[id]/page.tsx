"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { MultiAgentResults } from "./_components/MultiAgentResults";

/* Route: /multi-agent/[id] (SPEC-08 results page). Thin entry — the view reads
   `?trace=` through useSearchParams, hence the Suspense boundary. */
export default function MultiAgentRunPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense fallback={null}>
      <MultiAgentResults id={id} />
    </Suspense>
  );
}
