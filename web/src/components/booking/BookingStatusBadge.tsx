import { STATUS_LABEL, type BookingStatus } from "@/lib/booking-types";

const CLS: Record<BookingStatus, string> = {
  pending: "bg-amber-100 text-amber-800 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300",
  confirmed: "bg-energy-100 text-energy-800 ring-energy-600/20 dark:bg-energy-500/15 dark:text-energy-300",
  checked_in: "bg-sky-100 text-sky-800 ring-sky-600/20 dark:bg-sky-500/15 dark:text-sky-300",
  completed: "bg-zinc-100 text-zinc-700 ring-zinc-500/20 dark:bg-zinc-500/15 dark:text-zinc-300",
  cancelled: "bg-zinc-100 text-zinc-600 ring-zinc-500/20 dark:bg-zinc-500/15 dark:text-zinc-400",
  expired: "bg-zinc-100 text-zinc-600 ring-zinc-500/20 dark:bg-zinc-500/15 dark:text-zinc-400",
  no_show: "bg-rose-100 text-rose-800 ring-rose-600/20 dark:bg-rose-500/15 dark:text-rose-300",
};

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${CLS[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}
