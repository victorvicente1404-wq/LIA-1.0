// Client-safe: catálogo dos serviços que a Lia pode conectar por usuário.
export type ConnectorId =
  | "google_calendar"
  | "google_mail"
  | "google_docs"
  | "google_drive"
  | "google_slides";

export interface ConnectorDef {
  id: ConnectorId;
  label: string;
  description: string;
}

export const CONNECTORS: ConnectorDef[] = [
  {
    id: "google_calendar",
    label: "Google Agenda",
    description: "Ver seus próximos compromissos e horários livres.",
  },
  {
    id: "google_mail",
    label: "Gmail",
    description: "Ler os e-mails recentes e enviar mensagens por você.",
  },
  {
    id: "google_drive",
    label: "Google Drive",
    description: "Buscar e listar seus arquivos.",
  },
  {
    id: "google_docs",
    label: "Google Docs",
    description: "Ler e escrever em documentos seus.",
  },
  {
    id: "google_slides",
    label: "Google Slides",
    description: "Ler suas apresentações.",
  },
];

export function connectorLabel(id: string): string {
  return CONNECTORS.find((c) => c.id === id)?.label ?? id;
}
