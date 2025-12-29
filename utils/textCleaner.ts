export function cleanTicketText(title: string, description?: string) {
  return `${title} ${description || ""}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}
