import { startTransition } from "react";

// Submits a form to a useActionState action without React's automatic
// post-action form reset (which would wipe what the user just typed or chose).
export function submitWith(action: (fd: FormData) => void) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };
}
