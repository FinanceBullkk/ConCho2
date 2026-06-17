// Shared date/time formatters for the class-detail tabs.
export const fmtDate = (d) => new Date(d).toLocaleDateString('en', { day: '2-digit', month: 'short', year: 'numeric' });
export const fmtTime = (d) => new Date(d).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false });
