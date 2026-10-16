export function DemoButton({ className = "btn btn-ghost", label = "Try the live demo →" }: { className?: string; label?: string }) {
  return (
    <form action="/auth/demo" method="post" style={{ display: "contents" }}>
      <button type="submit" className={className}>{label}</button>
    </form>
  );
}
