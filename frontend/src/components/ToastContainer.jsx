import { useApp } from "../AppContext";

export default function ToastContainer() {
  const { toasts } = useApp();
  return (
    <div id="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}${t.show ? " show" : ""}`}>{t.message}</div>
      ))}
    </div>
  );
}
