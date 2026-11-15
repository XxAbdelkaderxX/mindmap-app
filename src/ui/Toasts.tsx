import { dismissToast, useToasts } from './toast';

export function Toasts() {
  const items = useToasts((s) => s.items);
  return (
    <div className="toasts" data-ui role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="toast">
          <span>{t.text}</span>
          {t.action && (
            <button
              type="button"
              onClick={() => {
                t.action!.run();
                dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
