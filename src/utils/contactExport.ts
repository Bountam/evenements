import { db } from '../db';
import type { ContactSource, EventSettings } from '../types';
import { CONTACT_EXPORT_HEADER, contactExportCells, protectFormula, readContact } from './contact';

const SOURCE_LABELS: Record<ContactSource, string> = {
  kiosque_concours: 'Concours',
  reparothon: 'Réparothon',
  install_fest_linux: 'Install Fest',
  activite: 'Activité',
  sondage_benevole: 'Sondage bénévole'
};

const isoDate = (ms: number) => (ms ? new Date(ms).toISOString().slice(0, 10) : '');

// Source d'une fiche : celle du formulaire commun, sinon déduite de l'activité (anciennes fiches)
const sourceOf = (record: { extraData?: Record<string, any> }, event: EventSettings): string => {
  const stored = record.extraData?.contact?.source || record.extraData?.source;
  if (stored && stored in SOURCE_LABELS) return SOURCE_LABELS[stored as ContactSource];
  if (event.type === 'kiosque_concours') return SOURCE_LABELS.kiosque_concours;
  if (event.type === 'reparothon') return SOURCE_LABELS.reparothon;
  if (event.type === 'install_fest_linux') return SOURCE_LABELS.install_fest_linux;
  return SOURCE_LABELS.activite;
};

export const ALL_CONTACTS_HEADER = ['Activité', "Date de l'activité", 'Source', ...CONTACT_EXPORT_HEADER, "Date d'inscription"];

// Toutes les personnes de toutes les activités, une ligne par fiche, pour filtrer les bénévoles dans Excel
export async function buildAllContactsRows(): Promise<string[][]> {
  const [events, participants, tickets, attendees] = await Promise.all([
    db.events.toArray(),
    db.participants.toArray(),
    db.tickets.toArray(),
    db.attendees.toArray()
  ]);
  const eventsById = new Map(events.map((e) => [e.id, e]));
  const rows: Array<{ at: number; cells: string[] }> = [];
  const add = (record: any, at: number) => {
    const event = eventsById.get(record.eventId);
    if (!event) return;
    rows.push({ at, cells: [event.name, event.date, sourceOf(record, event), ...contactExportCells(readContact(record)), isoDate(at)] });
  };
  participants.forEach((p) => add(p, p.registeredAt));
  tickets.forEach((t) => add(t, t.createdAt));
  attendees.forEach((a) => add(a, a.registeredAt));
  return rows.sort((a, b) => b.at - a.at).map((r) => r.cells.map((c) => protectFormula(c)));
}

// Onglet unique « Contacts », avec filtre automatique sur toutes les colonnes
export async function downloadAllContactsXlsx(): Promise<number> {
  const rows = await buildAllContactsRows();
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet([ALL_CONTACTS_HEADER, ...rows]);
  if (ws['!ref']) ws['!autofilter'] = { ref: ws['!ref'] };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Contacts');
  // Même téléchargement que les exports par activité (lien et Blob), compatible avec l'exe et l'APK
  const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const url = URL.createObjectURL(new Blob([data], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `contacts_insertech_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return rows.length;
}
