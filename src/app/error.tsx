"use client";

import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/page-header";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl pt-10">
      <EmptyState icon={<AlertCircle />} title="Something went wrong">
        <p>This page hit an unexpected problem.</p>
        <Button className="mt-4" onClick={reset}>
          Try again
        </Button>
      </EmptyState>
    </div>
  );
}
