export default function Toast({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="fixed bottom-4 right-4 z-50 rounded-lg bg-ink-800 px-4 py-2 text-sm text-white shadow-lg"
    >
      {message}
    </div>
  );
}
