import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="mt-2 text-sm text-zinc-500">That station doesn’t exist or was removed.</p>
      <Link href="/" className="mt-4 inline-block text-sm font-medium text-emerald-700 hover:underline">Back to stations</Link>
    </div>
  );
}
