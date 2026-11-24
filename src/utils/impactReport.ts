import { db } from '../db';
import type { EventSettings, GenericAttendee, RepairTicket, Technician } from '../types';
import { CONTACT_EXPORT_HEADER, contactExportCells, readContact } from './contact';
import { INSTALL_FEST_EXPORT_HEADER, installFestExportRows } from './installFest';
import { getRaffleDraws } from './raffle';
import { escapeCsvCell, escapeLatex } from './security';
import { formatTime } from '../components/shared/Stopwatch';

const protectFormula = (val: string | number): string | number => {
  if (typeof val === 'string' && /^[=+\-@]/.test(val)) return `'${val}`;
  return val;
};

const triggerBrowserDownload = (fileName: string, blob: Blob) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export type ImpactExportFormat = 'xlsx' | 'md' | 'tex' | 'csv' | 'json';

// Facteurs ACV (kg CO2e évités par appareil sauvé selon la catégorie)
export const CO2E_AVOIDED_FACTORS_KG: Record<string, number> = {
  laptop: 156,
  pc_tour: 296,
  tablette: 87,
  cellulaire: 58,
  autre: 45
};

export interface EventImpactSummary {
  eventId: string;
  eventName: string;
  eventType: string;
  eventDate: string;
  eventLocation: string;
  eventPartner: string;
  // Volet 1 : Impact Écologique
  totalDevices: number;
  savedDevices: number;
  repairedDevices: number;
  semiRepairedDevices: number;
  unreparableDevices: number;
  successRatePct: number;
  weightSavedKg: number;
  co2eAvoidedKg: number;
  linuxMigrationsCount: number;
  // Volet 2 : Impact Opérationnel & Boutique Insertech
  avgWaitMinutes: number;
  avgRepairMinutes: number;
  totalServiceHours: number;
  partsOrientationsCount: number;
  partsBreakdown: Record<string, number>;
  shopOrientationsCount: number;
  recyclingOrientationsCount: number;
  // Volet 3 : Mobilisation & Loi 25
  uniqueParticipants: number;
  newVolunteersCount: number;
  volunteerRolesBreakdown: Record<string, number>;
  newsletterOptInsCount: number;
  // Volet 4 : Impact Pédagogique Formation
  attendeesRegistered: number;
  attendeesPresent: number;
  presenceRatePct: number;
  avgLevelBefore: number | null;
  avgLevelAfter: number | null;
  avgProgressionGain: number | null;
  progressedLearnersPct: number;
  readyForReparothonCount: number;
  avgSatisfaction: number | null;
  feedbackCount: number;
}

const diffMinutes = (start?: number, end?: number): number | null => {
  if (typeof start === 'number' && typeof end === 'number' && end >= start) {
    return Math.round((end - start) / 60000);
  }
  return null;
};

export async function computeEventImpactSummary(event: EventSettings): Promise<EventImpactSummary> {
  const [tickets, participants, attendees] = await Promise.all([
    db.tickets.where('eventId').equals(event.id).toArray(),
    db.participants.where('eventId').equals(event.id).toArray(),
    db.attendees.where('eventId').equals(event.id).toArray()
  ]);

  const savedTickets = tickets.filter((t) => t.status === 'repare' || t.status === 'semi_repare');
  const repairedDevices = tickets.filter((t) => t.status === 'repare').length;
  const semiRepairedDevices = tickets.filter((t) => t.status === 'semi_repare').length;
  const unreparableDevices = tickets.filter((t) => t.status === 'non_reparable').length;
  const totalDevices = tickets.length;
  const savedDevices = savedTickets.length;
  const successRatePct = totalDevices > 0 ? Math.round((savedDevices / totalDevices) * 100) : 0;

  const weightSavedKg = Number(
    savedTickets.reduce((sum, t) => sum + (Number(t.weightKg) || 0), 0).toFixed(1)
  );
  const co2eAvoidedKg = Math.round(
    savedTickets.reduce((sum, t) => sum + (CO2E_AVOIDED_FACTORS_KG[t.objectCategory] ?? 45), 0)
  );

  const linuxMigrationsCount =
    event.type === 'install_fest_linux'
      ? tickets.filter((t) => t.status === 'repare' || t.status === 'semi_repare').length +
        attendees.filter((a) => a.tags?.includes('Réussi')).length
      : tickets.filter(
          (t) =>
            (t.status === 'repare' || t.status === 'semi_repare') &&
            Array.isArray(t.extraData?.actionsPerformed) &&
            t.extraData.actionsPerformed.some((act: string) => act.toLowerCase().includes('linux'))
        ).length;

  const waitTimes: number[] = [];
  const repairTimes: number[] = [];
  let totalServiceMinutes = 0;
  let partsOrientationsCount = 0;
  const partsBreakdown: Record<string, number> = {};
  let shopOrientationsCount = 0;
  let recyclingOrientationsCount = 0;

  tickets.forEach((t) => {
    const w = diffMinutes(t.createdAt, t.extraData?.serviceStartedAt);
    if (w !== null) waitTimes.push(w);
    const r = diffMinutes(t.extraData?.serviceStartedAt, t.extraData?.completedAt);
    if (r !== null) {
      repairTimes.push(r);
      totalServiceMinutes += r;
    }
    const fType = t.extraData?.followUpType;
    if (fType === 'piece_rechange') {
      partsOrientationsCount++;
      const partName = (t.extraData?.followUpPart || 'Pièce non précisée').trim();
      partsBreakdown[partName] = (partsBreakdown[partName] || 0) + 1;
    } else if (fType === 'passage_boutique') {
      shopOrientationsCount++;
    } else if (fType === 'recyclage') {
      recyclingOrientationsCount++;
    }
  });

  const avgWaitMinutes =
    waitTimes.length > 0 ? Math.round(waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length) : 0;
  const avgRepairMinutes =
    repairTimes.length > 0 ? Math.round(repairTimes.reduce((a, b) => a + b, 0) / repairTimes.length) : 0;
  const totalServiceHours = Number((totalServiceMinutes / 60).toFixed(1));

  // Mobilisation & Loi 25 (toutes tables confondues sans doublons évidents)
  const volunteerRolesBreakdown: Record<string, number> = {};
  let newVolunteersCount = 0;
  let newsletterOptInsCount = 0;
  const uniqueNames = new Set<string>();

  const processContactRecord = (rec: RepairTicket | GenericAttendee | { visitorName?: string; name?: string; extraData?: any }) => {
    const contact = readContact(rec as any);
    const displayName = (contact.firstName + ' ' + contact.lastName).trim() || (rec as any).visitorName || (rec as any).name || '';
    if (displayName) uniqueNames.add(displayName.toLowerCase());
    if (contact.wantsToVolunteer) {
      newVolunteersCount++;
      const roles = contact.volunteer?.roles;
      if (Array.isArray(roles)) {
        roles.forEach((role: string) => {
          volunteerRolesBreakdown[role] = (volunteerRolesBreakdown[role] || 0) + 1;
        });
      }
    }
    if (contact.consent?.newsletter) {
      newsletterOptInsCount++;
    }
  };

  tickets.forEach(processContactRecord);
  participants.forEach(processContactRecord);
  attendees.forEach(processContactRecord);

  // Pédagogie Formation
  const regularAttendees = attendees.filter((a) => a.extraData?.source !== 'sondage_benevole');
  const attendeesRegistered = regularAttendees.length;
  const attendeesPresent = regularAttendees.filter((a) => a.presenceConfirmed).length;
  const presenceRatePct = attendeesRegistered > 0 ? Math.round((attendeesPresent / attendeesRegistered) * 100) : 0;

  const beforeLevels: number[] = [];
  const afterLevels: number[] = [];
  let progressedCount = 0;
  let comparableCount = 0;
  let readyForReparothonCount = 0;

  regularAttendees.forEach((a) => {
    const prog = a.extraData?.progression;
    if (typeof prog?.levelBefore === 'number') beforeLevels.push(prog.levelBefore);
    if (typeof prog?.levelAfter === 'number') afterLevels.push(prog.levelAfter);
    if (typeof prog?.levelBefore === 'number' && typeof prog?.levelAfter === 'number') {
      comparableCount++;
      if (prog.levelAfter > prog.levelBefore) progressedCount++;
    }
    if (prog?.readyForReparothon) readyForReparothonCount++;
  });

  const avgLevelBefore =
    beforeLevels.length > 0
      ? Number((beforeLevels.reduce((a, b) => a + b, 0) / beforeLevels.length).toFixed(1))
      : null;
  const avgLevelAfter =
    afterLevels.length > 0
      ? Number((afterLevels.reduce((a, b) => a + b, 0) / afterLevels.length).toFixed(1))
      : null;
  const avgProgressionGain =
    avgLevelBefore !== null && avgLevelAfter !== null
      ? Number((avgLevelAfter - avgLevelBefore).toFixed(1))
      : null;
  const progressedLearnersPct = comparableCount > 0 ? Math.round((progressedCount / comparableCount) * 100) : 0;

  const feedbacks = regularAttendees.filter((a) => typeof a.feedbackScore === 'number');
  const avgSatisfaction =
    feedbacks.length > 0
      ? Number((feedbacks.reduce((sum, a) => sum + (a.feedbackScore || 0), 0) / feedbacks.length).toFixed(1))
      : null;

  return {
    eventId: event.id,
    eventName: event.name,
    eventType: event.type,
    eventDate: event.date,
    eventLocation: event.location,
    eventPartner: event.partner || '',
    totalDevices,
    savedDevices,
    repairedDevices,
    semiRepairedDevices,
    unreparableDevices,
    successRatePct,
    weightSavedKg,
    co2eAvoidedKg,
    linuxMigrationsCount,
    avgWaitMinutes,
    avgRepairMinutes,
    totalServiceHours,
    partsOrientationsCount,
    partsBreakdown,
    shopOrientationsCount,
    recyclingOrientationsCount,
    uniqueParticipants: uniqueNames.size,
    newVolunteersCount,
    volunteerRolesBreakdown,
    newsletterOptInsCount,
    attendeesRegistered,
    attendeesPresent,
    presenceRatePct,
    avgLevelBefore,
    avgLevelAfter,
    avgProgressionGain,
    progressedLearnersPct,
    readyForReparothonCount,
    avgSatisfaction,
    feedbackCount: feedbacks.length
  };
}

export function formatExecutiveSummaryText(s: EventImpactSummary): string {
  const lines: string[] = [
    `BILAN D'IMPACT INSERTECH — ${s.eventName.toUpperCase()}`,
    `Date : ${s.eventDate} | Lieu : ${s.eventLocation}${s.eventPartner ? ` | Partenaire : ${s.eventPartner}` : ''}`,
    ``,
    `1. IMPACT ÉCOLOGIQUE`,
    `- Appareils traités : ${s.totalDevices} (${s.savedDevices} sauvés, taux de réussite : ${s.successRatePct}%)`,
    `- Poids détourné de l'enfouissement : ${s.weightSavedKg} kg`,
    `- Émissions CO2e évitées estimées (ACV) : ${s.co2eAvoidedKg} kg CO2e`,
    ...(s.linuxMigrationsCount > 0 ? [`- Migrations Linux réussies : ${s.linuxMigrationsCount}`] : []),
    ``,
    `2. IMPACT OPÉRATIONNEL & CONTINUITÉ BOUTIQUE`,
    `- Temps d'attente moyen : ${s.avgWaitMinutes} min | Durée moyenne de réparation : ${s.avgRepairMinutes} min`,
    `- Heures de service direct cumulées : ${s.totalServiceHours} h`,
    `- Orientations Pièces de rechange : ${s.partsOrientationsCount}`,
    `- Passages Boutique / Atelier Insertech : ${s.shopOrientationsCount}`,
    `- Recyclage écologique : ${s.recyclingOrientationsCount}`,
    ``,
    `3. MOBILISATION & LOI 25`,
    `- Participants uniques : ${s.uniqueParticipants}`,
    `- Nouveaux bénévoles recrutés : ${s.newVolunteersCount}`,
    `- Inscriptions infolettre (Loi 25) : ${s.newsletterOptInsCount}`
  ];

  if (s.attendeesRegistered > 0) {
    lines.push(
      ``,
      `4. IMPACT PÉDAGOGIQUE FORMATION`,
      `- Présence : ${s.attendeesPresent}/${s.attendeesRegistered} (${s.presenceRatePct}%)`,
      `- Niveau moyen Avant : ${s.avgLevelBefore ?? 'N/A'} / 4 → Après : ${s.avgLevelAfter ?? 'N/A'} / 4 (Gain : ${s.avgProgressionGain !== null ? `${s.avgProgressionGain >= 0 ? '+' : ''}${s.avgProgressionGain}` : 'N/A'})`,
      `- Formés ayant progressé : ${s.progressedLearnersPct}% | Prêts Réparothon : ${s.readyForReparothonCount}`,
      `- Satisfaction moyenne : ${s.avgSatisfaction !== null ? `${s.avgSatisfaction}/5 (${s.feedbackCount} avis)` : 'N/A'}`
    );
  }

  return lines.join('\n');
}

function computeColWidths(rows: Array<Array<string | number>>): Array<{ wch: number }> {
  if (rows.length === 0) return [];
  const colCount = Math.max(...rows.map((r) => r.length));
  const widths: Array<{ wch: number }> = [];
  for (let c = 0; c < colCount; c++) {
    let maxLen = 10;
    for (let r = 0; r < rows.length; r++) {
      const val = rows[r]?.[c];
      const len = val !== undefined && val !== null ? String(val).length : 0;
      if (len > maxLen) maxLen = len;
    }
    widths.push({ wch: Math.min(maxLen + 3, 45) });
  }
  return widths;
}

export async function exportEventImpactFile(event: EventSettings, format: ImpactExportFormat): Promise<string> {
  const eventId = event.id;
  const [tickets, technicians, participants, attendees] = await Promise.all([
    db.tickets.where('eventId').equals(eventId).toArray(),
    db.technicians.where('eventId').equals(eventId).toArray(),
    db.participants.where('eventId').equals(eventId).toArray(),
    db.attendees.where('eventId').equals(eventId).toArray()
  ]);

  const summary = await computeEventImpactSummary(event);
  const techTableMap = new Map(technicians.map((t) => [t.id, t.tableNumber ?? '']));

  const contestHeader = ['Rang', ...CONTACT_EXPORT_HEADER, 'Meilleur chrono', 'Temps (ms)', 'Tirage au sort'];
  const raffleDraws = getRaffleDraws((await db.events.get(eventId)) || event);
  const contestRows: Array<Array<string | number>> = [...participants]
    .sort((a, b) => {
      const aTime = a.timeMs && a.timeMs > 0 ? a.timeMs : Infinity;
      const bTime = b.timeMs && b.timeMs > 0 ? b.timeMs : Infinity;
      return aTime !== bTime ? aTime - bTime : a.registeredAt - b.registeredAt;
    })
    .map((p, idx) => {
      const hasTime = typeof p.timeMs === 'number' && p.timeMs > 0;
      const draw = [...raffleDraws].reverse().find((d) => d.participantId === p.id);
      return [
        hasTime ? idx + 1 : '',
        ...contactExportCells(readContact(p)),
        hasTime ? formatTime(p.timeMs!) : '',
        hasTime ? p.timeMs! : '',
        draw ? (draw.status === 'gagnant' ? 'Gagnant' : 'Absent') : ''
      ];
    });

  const volunteerSurveys = attendees.filter((a) => a.extraData?.source === 'sondage_benevole');
  const surveyRows = (header: string[], contactStart: number) =>
    volunteerSurveys.map((a) => {
      const row: Array<string | number> = new Array(header.length).fill('');
      row.splice(contactStart, CONTACT_EXPORT_HEADER.length, ...contactExportCells(readContact(a)));
      return row;
    });
  contestRows.push(...surveyRows(contestHeader, 1));

  const installHeader = INSTALL_FEST_EXPORT_HEADER;
  const installRows: Array<Array<string | number>> = [
    ...installFestExportRows(tickets),
    ...surveyRows(INSTALL_FEST_EXPORT_HEADER, 0)
  ];

  const repairHeader = [
    ...CONTACT_EXPORT_HEADER,
    "Nom de l'appareil",
    'Catégorie',
    "Système d'exploitation",
    'Diagnostic',
    'Technicien',
    'Table Technicien',
    "Temps d'attente (min)",
    'Durée de réparation (min)',
    'Actions réalisées',
    'Suite proposée',
    'Pièce / Détail boutique',
    'Statut',
    'Remarques de résolution',
    'Poids (kg)'
  ];
  const repairRows: Array<Array<string | number>> = tickets.map((t) => [
    ...contactExportCells(readContact(t)),
    t.objectName,
    t.objectCategory,
    t.operatingSystem,
    t.initialDiagnosis || '',
    t.assignedTechName || '',
    t.extraData?.tableNumber ?? (t.assignedTechId ? techTableMap.get(t.assignedTechId) ?? '' : ''),
    diffMinutes(t.createdAt, t.extraData?.serviceStartedAt) ?? '',
    diffMinutes(t.extraData?.serviceStartedAt, t.extraData?.completedAt) ?? '',
    Array.isArray(t.extraData?.actionsPerformed) ? t.extraData.actionsPerformed.join(', ') : '',
    t.extraData?.followUpType || '',
    t.extraData?.followUpPart || t.extraData?.followUpDetail || '',
    t.status,
    t.resultRemarks || '',
    t.weightKg || ''
  ]);
  repairRows.push(...surveyRows(repairHeader, 0));

  const attendeeHeader = [
    ...CONTACT_EXPORT_HEADER,
    'Présent',
    'Niveau Avant (1-4)',
    'Jalons Pendant',
    'Statut Formateur',
    'Niveau Après (1-4)',
    'Progression (+)',
    'Prêt Réparothon',
    'Notes',
    'Note de satisfaction',
    'Commentaire'
  ];
  const attendeeRows: Array<Array<string | number>> = attendees.map((a) => {
    const prog = a.extraData?.progression;
    const gain =
      typeof prog?.levelBefore === 'number' && typeof prog?.levelAfter === 'number'
        ? prog.levelAfter - prog.levelBefore
        : '';
    return [
      ...contactExportCells(readContact(a)),
      a.presenceConfirmed ? 'Oui' : 'Non',
      prog?.levelBefore ?? '',
      Array.isArray(prog?.milestonesDuring) ? prog.milestonesDuring.join(', ') : '',
      prog?.coachStatus || '',
      prog?.levelAfter ?? '',
      gain,
      prog?.readyForReparothon ? 'Oui' : '',
      a.notes || '',
      a.feedbackScore || '',
      a.feedbackText || ''
    ];
  });

  const activeHeader =
    event.type === 'reparothon'
      ? repairHeader
      : event.type === 'install_fest_linux'
        ? installHeader
        : event.type === 'kiosque_concours'
          ? contestHeader
          : attendeeHeader;
  const activeRows =
    event.type === 'reparothon'
      ? repairRows
      : event.type === 'install_fest_linux'
        ? installRows
        : event.type === 'kiosque_concours'
          ? contestRows
          : attendeeRows;

  const fileName = `insertech_impact_${event.type}_${event.date}.${format}`;

  if (format === 'json') {
    const content = JSON.stringify({ event, tickets, technicians, participants, attendees }, null, 2);
    triggerBrowserDownload(fileName, new Blob([content], { type: 'application/json' }));
    return fileName;
  }

  if (format === 'csv') {
    const content =
      activeHeader.join(';') +
      '\n' +
      activeRows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(';')).join('\n');
    triggerBrowserDownload(fileName, new Blob([content], { type: 'text/csv;charset=utf-8;' }));
    return fileName;
  }

  if (format === 'md') {
    let md = `# Rapport d'Impact Insertech : ${event.name}\n\n`;
    md += `- **Date :** ${event.date}\n- **Lieu :** ${event.location}\n`;
    if (event.partner) md += `- **Partenaire :** ${event.partner}\n`;
    md += `\n## Sommaire d'Impact\n\n`;
    md += `| Indicateur | Valeur |\n| :--- | :--- |\n`;
    md += `| Appareils traités / sauvés | ${summary.totalDevices} / ${summary.savedDevices} (${summary.successRatePct}%) |\n`;
    md += `| Poids détourné (kg) | ${summary.weightSavedKg} kg |\n`;
    md += `| CO2e évité estimé (ACV) | ${summary.co2eAvoidedKg} kg CO2e |\n`;
    md += `| Temps d'attente / réparation moyen | ${summary.avgWaitMinutes} min / ${summary.avgRepairMinutes} min |\n`;
    md += `| Orientations Pièces / Boutique / Recyclage | ${summary.partsOrientationsCount} / ${summary.shopOrientationsCount} / ${summary.recyclingOrientationsCount} |\n`;
    md += `| Nouveaux bénévoles recrutés | ${summary.newVolunteersCount} |\n`;
    md += `| Inscriptions infolettre Loi 25 | ${summary.newsletterOptInsCount} |\n`;
    if (summary.attendeesRegistered > 0) {
      md += `| Présence Formation | ${summary.attendeesPresent}/${summary.attendeesRegistered} (${summary.presenceRatePct}%) |\n`;
      md += `| Progression Avant → Après | ${summary.avgLevelBefore ?? 'N/A'} → ${summary.avgLevelAfter ?? 'N/A'} |\n`;
    }
    md += `\n## Données Détaillées\n\n`;
    md += `| ${activeHeader.join(' | ')} |\n`;
    md += `|${activeHeader.map(() => ' :--- ').join('|')}|\n`;
    md += activeRows.map((row) => `| ${row.map((c) => String(c).replace(/\|/g, '\\|')).join(' | ')} |`).join('\n');
    triggerBrowserDownload(fileName, new Blob([md], { type: 'text/markdown' }));
    return fileName;
  }

  if (format === 'tex') {
    let tex = `\\documentclass{article}\n\\usepackage[utf8]{inputenc}\n\\begin{document}\n`;
    tex += `\\title{Rapport d'Impact Insertech : ${escapeLatex(event.name)}}\n\\date{${escapeLatex(event.date)}}\n\\maketitle\n`;
    tex += `\\section*{Sommaire d'Impact}\n\\begin{itemize}\n`;
    tex += `\\item Appareils sauvés : ${summary.savedDevices} / ${summary.totalDevices} (${summary.successRatePct}\\%)\n`;
    tex += `\\item Poids détourné : ${summary.weightSavedKg} kg (${summary.co2eAvoidedKg} kg CO2e évités)\n`;
    tex += `\\item Nouveaux bénévoles : ${summary.newVolunteersCount} | Infolettre : ${summary.newsletterOptInsCount}\n`;
    tex += `\\end{itemize}\n\n\\section*{Données Détaillées}\n`;
    tex += `\\begin{tabular}{${activeHeader.map(() => 'l').join(' ')}}\n`;
    tex += activeRows
      .map((row) => row.map((cell) => escapeLatex(cell)).join(' & ') + ' \\\\')
      .join('\n');
    tex += `\n\\end{tabular}\n\\end{document}\n`;
    triggerBrowserDownload(fileName, new Blob([tex], { type: 'application/x-tex' }));
    return fileName;
  }

  // Excel (.xlsx) multi-onglets professionnel
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  // Onglet 1 : Sommaire d'Impact
  const summaryRows: Array<Array<string | number>> = [
    ["RAPPORT D'IMPACT INSERTECH", event.name],
    ['Date', event.date],
    ['Lieu', event.location],
    ['Partenaire', event.partner || 'N/A'],
    ['', ''],
    ['VOLET 1 — IMPACT ÉCOLOGIQUE', 'VALEUR'],
    ['Appareils traités', summary.totalDevices],
    ['Appareils sauvés (Réparés + Partiels)', summary.savedDevices],
    ['Taux de réussite (%)', `${summary.successRatePct}%`],
    ['Poids détourné (kg)', summary.weightSavedKg],
    ['Émissions CO2e évitées estimées (kg CO2e)', summary.co2eAvoidedKg],
    ['Migrations Linux réussies', summary.linuxMigrationsCount],
    ['', ''],
    ['VOLET 2 — OPÉRATIONS & CONTINUITÉ BOUTIQUE', 'VALEUR'],
    ["Temps d'attente moyen (min)", summary.avgWaitMinutes],
    ['Durée moyenne de réparation (min)', summary.avgRepairMinutes],
    ['Heures de service direct cumulées (h)', summary.totalServiceHours],
    ['Orientations Pièces de rechange', summary.partsOrientationsCount],
    ['Passages Boutique / Atelier Insertech', summary.shopOrientationsCount],
    ['Orientations Recyclage écologique', summary.recyclingOrientationsCount],
    ['', ''],
    ['VOLET 3 — MOBILISATION & LOI 25', 'VALEUR'],
    ['Participants uniques', summary.uniqueParticipants],
    ['Nouveaux bénévoles recrutés', summary.newVolunteersCount],
    ['Inscriptions infolettre (Loi 25)', summary.newsletterOptInsCount]
  ];

  if (summary.attendeesRegistered > 0) {
    summaryRows.push(
      ['', ''],
      ['VOLET 4 — IMPACT PÉDAGOGIQUE FORMATION', 'VALEUR'],
      ['Inscrits / Présents', `${summary.attendeesPresent} / ${summary.attendeesRegistered} (${summary.presenceRatePct}%)`],
      ['Niveau moyen Avant (1-4)', summary.avgLevelBefore ?? 'N/A'],
      ['Niveau moyen Après (1-4)', summary.avgLevelAfter ?? 'N/A'],
      ['Gain moyen (+niveaux)', summary.avgProgressionGain ?? 'N/A'],
      ['Formés ayant progressé (%)', `${summary.progressedLearnersPct}%`],
      ['Formés prêts pour un Réparothon', summary.readyForReparothonCount],
      ['Satisfaction moyenne (/5)', summary.avgSatisfaction ?? 'N/A']
    );
  }

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows.map((r) => r.map((c) => protectFormula(c))));
  wsSummary['!cols'] = computeColWidths(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, "Sommaire d'Impact");

  // Onglet 2 : Données Détaillées
  const detailSheetData = [activeHeader, ...activeRows.map((row) => row.map((cell) => protectFormula(cell)))];
  const wsDetails = XLSX.utils.aoa_to_sheet(detailSheetData);
  wsDetails['!cols'] = computeColWidths(detailSheetData);
  if (wsDetails['!ref']) wsDetails['!autofilter'] = { ref: wsDetails['!ref'] };
  XLSX.utils.book_append_sheet(wb, wsDetails, 'Données Détaillées');

  // Onglet 3 : Équipe & Tables
  const teamHeader = ['Technicien / Animateur', 'Table', 'Spécialités', 'Appareils pris en charge', 'Appareils sauvés', 'Heures de service'];
  const teamRows: Array<Array<string | number>> = technicians.map((tech: Technician) => {
    const techTickets = tickets.filter((t) => t.assignedTechId === tech.id || t.assignedTechName === tech.name);
    const techSaved = techTickets.filter((t) => t.status === 'repare' || t.status === 'semi_repare').length;
    const techMinutes = techTickets.reduce(
      (sum, t) => sum + (diffMinutes(t.extraData?.serviceStartedAt, t.extraData?.completedAt) || 0),
      0
    );
    return [
      tech.name,
      tech.tableNumber ?? 'Mobile',
      [...tech.specialties, ...(tech.softwareSpecialties || [])].join(', '),
      techTickets.length,
      techSaved,
      Number((techMinutes / 60).toFixed(1))
    ];
  });
  const teamSheetData = [teamHeader, ...teamRows.map((r) => r.map((c) => protectFormula(c)))];
  const wsTeam = XLSX.utils.aoa_to_sheet(teamSheetData);
  wsTeam['!cols'] = computeColWidths(teamSheetData);
  if (wsTeam['!ref']) wsTeam['!autofilter'] = { ref: wsTeam['!ref'] };
  XLSX.utils.book_append_sheet(wb, wsTeam, 'Équipe & Tables');

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'binary' });
  const buf = new ArrayBuffer(wbout.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < wbout.length; i++) view[i] = wbout.charCodeAt(i) & 0xff;
  triggerBrowserDownload(fileName, new Blob([buf], { type: 'application/octet-stream' }));
  return fileName;
}

export async function exportConsolidatedMultiEventXlsx(eventIds?: string[]): Promise<string> {
  const allEvents = await db.events.toArray();
  const targetEvents =
    eventIds && eventIds.length > 0 ? allEvents.filter((e) => eventIds.includes(e.id)) : allEvents;

  const summaries = await Promise.all(targetEvents.map((e) => computeEventImpactSummary(e)));

  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  const totalDevices = summaries.reduce((s, e) => s + e.totalDevices, 0);
  const savedDevices = summaries.reduce((s, e) => s + e.savedDevices, 0);
  const totalWeight = Number(summaries.reduce((s, e) => s + e.weightSavedKg, 0).toFixed(1));
  const totalCo2 = summaries.reduce((s, e) => s + e.co2eAvoidedKg, 0);
  const totalVolunteers = summaries.reduce((s, e) => s + e.newVolunteersCount, 0);
  const totalNewsletter = summaries.reduce((s, e) => s + e.newsletterOptInsCount, 0);

  const consolidatedRows: Array<Array<string | number>> = [
    ['BILAN CONSOLIDÉ MULTI-ÉVÉNEMENTS INSERTECH', `${summaries.length} activité(s)`],
    ['Appareils traités', totalDevices],
    ['Appareils sauvés', savedDevices],
    ['Poids détourné total (kg)', totalWeight],
    ['CO2e évité total estimé (kg CO2e)', totalCo2],
    ['Nouveaux bénévoles recrutés', totalVolunteers],
    ['Inscriptions infolettre (Loi 25)', totalNewsletter]
  ];
  const wsConsolidated = XLSX.utils.aoa_to_sheet(consolidatedRows);
  wsConsolidated['!cols'] = computeColWidths(consolidatedRows);
  XLSX.utils.book_append_sheet(wb, wsConsolidated, 'Bilan Consolidé');

  const compHeader = [
    'Activité',
    'Type',
    'Date',
    'Lieu',
    'Appareils sauvés',
    'Poids (kg)',
    'CO2e évité (kg)',
    'Nouveaux bénévoles',
    'Présents Formation'
  ];
  const compRows = summaries.map((s) => [
    s.eventName,
    s.eventType,
    s.eventDate,
    s.eventLocation,
    s.savedDevices,
    s.weightSavedKg,
    s.co2eAvoidedKg,
    s.newVolunteersCount,
    s.attendeesPresent
  ]);
  const compSheet = [compHeader, ...compRows.map((r) => r.map((c) => protectFormula(c)))];
  const wsComp = XLSX.utils.aoa_to_sheet(compSheet);
  wsComp['!cols'] = computeColWidths(compSheet);
  if (wsComp['!ref']) wsComp['!autofilter'] = { ref: wsComp['!ref'] };
  XLSX.utils.book_append_sheet(wb, wsComp, 'Comparatif Activités');

  const fileName = `insertech_bilan_consolide_${new Date().toISOString().slice(0, 10)}.xlsx`;
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'binary' });
  const buf = new ArrayBuffer(wbout.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < wbout.length; i++) view[i] = wbout.charCodeAt(i) & 0xff;
  triggerBrowserDownload(fileName, new Blob([buf], { type: 'application/octet-stream' }));
  return fileName;
}
