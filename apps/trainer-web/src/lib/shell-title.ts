type Listener = () => void;

let shellClientTitle: string | null = null;
const listeners = new Set<Listener>();

export function getShellClientTitle(): string | null {
  return shellClientTitle;
}

export function setShellClientTitle(title: string | null): void {
  if (shellClientTitle === title) return;
  shellClientTitle = title;
  for (const listener of listeners) listener();
}

export function subscribeShellClientTitle(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
