import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * "Import spending" was folded into the Money meeting statements tab, which reads the
 * same files plus XLS/XLSX, sorts charges by description, queries odd ones and compares
 * against what you already entered. Old links land in the right place.
 */
export const Route = createFileRoute("/_authenticated/import")({
  beforeLoad: () => {
    throw redirect({ to: "/money-meeting", search: { tab: "statements" } });
  },
});
