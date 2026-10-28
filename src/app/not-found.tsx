import Link from "next/link";
import { Compass } from "lucide-react";
import { EmptyState } from "@/components/page-header";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl pt-10">
      <EmptyState icon={<Compass />} title="Page not found">
        That page doesn’t exist.{" "}
        <Link href="/" className="font-medium text-foreground underline underline-offset-4">
          Go back to Ask
        </Link>
        .
      </EmptyState>
    </div>
  );
}
