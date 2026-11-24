import type { ContactInfo, ContactMode, ContactSource, TechSkill, TshirtSize, VolunteerRole } from '../types';

// Formulaire de contact commun : listes, normalisation, validation canadienne et colonnes d'export.
// Fonctions pures, sans React ni base de données.

export const VOLUNTEER_ROLES: Array<{ id: VolunteerRole; label: string }> = [
  { id: 'accueil', label: 'Accueil' },
  { id: 'technique', label: 'Technique' },
  { id: 'animation', label: 'Animation' },
  { id: 'logistique', label: 'Logistique' },
  { id: 'communication', label: 'Communication' }
];

export const TECH_SKILLS: Array<{ id: TechSkill; label: string }> = [
  { id: 'windows', label: 'Windows' },
  { id: 'mac', label: 'Mac' },
  { id: 'linux', label: 'Linux' },
  { id: 'cellulaires', label: 'Cellulaires' },
  { id: 'soudure', label: 'Soudure' },
  { id: 'electronique', label: 'Électronique' },
  { id: 'reseau', label: 'Réseau' },
  { id: 'son_eclairage', label: 'Son et éclairage' }
];

export const TSHIRT_SIZES: TshirtSize[] = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];

export const PRONOUN_OPTIONS: string[] = ['Il / lui', 'Elle / elle', 'Iel / ellui', 'Autre'];

// Indicatifs régionaux du Québec pour auto-complétion rapide en 1 tap
export const QUEBEC_AREA_CODES: string[] = ['514', '438', '263', '450', '579', '418', '581', '819', '873'];

// Domaines de courriel fréquents au Québec / Canada pour auto-complétion rapide
export const EMAIL_DOMAIN_SUGGESTIONS: string[] = [
  '@gmail.com',
  '@hotmail.com',
  '@hotmail.fr',
  '@outlook.com',
  '@yahoo.ca',
  '@icloud.com',
  '@proton.me',
  '@videotron.ca',
  '@bell.net'
];

export const MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
];

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export interface ContactDraft {
  displayName: string;
  firstName: string;
  lastName: string;
  pronouns: string;
  pronounsCustom: string;
  phone: string;
  email: string;
  postalCode: string;
  outsideCanada: boolean;
  wantsToVolunteer: boolean;
  roles: VolunteerRole[];
  techSkills: TechSkill[];
  hasVehicle: boolean;
  tshirtSize: TshirtSize;
  dietaryRestrictions: string;
  birthDay: string;
  birthMonth: string;
  consentActivity: boolean;
  consentVolunteer: boolean;
  consentNewsletter: boolean;
}

export type ContactErrorKey = keyof ContactDraft | 'contact';
export type ContactErrors = Partial<Record<ContactErrorKey, string>>;

// Ordre d'affichage des champs, pour placer le focus sur la première erreur
export const CONTACT_FIELD_ORDER: ContactErrorKey[] = [
  'displayName', 'firstName', 'lastName', 'pronounsCustom', 'phone', 'email', 'contact', 'postalCode', 'roles',
  'dietaryRestrictions', 'birthDay', 'consentActivity', 'consentVolunteer'
];

export const emptyContactDraft = (mode: ContactMode): ContactDraft => ({
  displayName: '',
  firstName: '',
  lastName: '',
  pronouns: '',
  pronounsCustom: '',
  phone: '',
  email: '',
  postalCode: '',
  outsideCanada: false,
  wantsToVolunteer: mode === 'volunteer',
  roles: [],
  techSkills: [],
  hasVehicle: false,
  tshirtSize: '',
  dietaryRestrictions: '',
  birthDay: '',
  birthMonth: '',
  consentActivity: false,
  consentVolunteer: false,
  consentNewsletter: false
});

const cleanName = (value: string) => value.trim().replace(/\s+/g, ' ');

export function splitDisplayName(raw: string): { firstName: string; lastName: string } {
  const cleaned = cleanName(raw);
  if (!cleaned) return { firstName: '', lastName: '' };
  const space = cleaned.indexOf(' ');
  if (space === -1) return { firstName: cleaned, lastName: '' };
  return { firstName: cleaned.slice(0, space), lastName: cleaned.slice(space + 1) };
}

export function resolveDraftDisplayName(draft: Pick<ContactDraft, 'displayName' | 'firstName' | 'lastName'>): string {
  const direct = cleanName(draft.displayName || '');
  if (direct) return direct;
  return cleanName([draft.firstName || '', draft.lastName || ''].filter(Boolean).join(' '));
}

// Garde les chiffres canadiens ; retire l'indicatif 1 d'un numéro nord-américain à 11 chiffres
export const normalizePhone = (value: string, _outsideCanada = false): string => {
  const digits = value.replace(/\D/g, '');
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
};

// Formatage progressif XXX XXX-XXXX pendant la frappe
export const formatPhoneLive = (value: string): string => {
  const normalized = normalizePhone(value).slice(0, 10);
  if (normalized.length <= 3) return normalized;
  if (normalized.length <= 6) return `${normalized.slice(0, 3)} ${normalized.slice(3)}`;
  return `${normalized.slice(0, 3)} ${normalized.slice(3, 6)}-${normalized.slice(6)}`;
};

export const formatPhone = (phone: string): string =>
  /^\d{10}$/.test(phone) ? `${phone.slice(0, 3)} ${phone.slice(3, 6)}-${phone.slice(6)}` : phone;

// Appliquer un indicatif régional QC (514, 438, etc.) tout en préservant les 7 chiffres déjà tapés le cas échéant
export const applyQuebecAreaCode = (currentPhone: string, areaCode: string): string => {
  const digits = normalizePhone(currentPhone);
  const tail = digits.length > 3 ? digits.slice(3, 10) : '';
  return formatPhoneLive(areaCode + tail);
};

export const normalizePostal = (value: string, _outsideCanada = false): string => {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  return compact.length > 3 ? `${compact.slice(0, 3)} ${compact.slice(3)}` : compact;
};

export const normalizeEmail = (value: string): string => value.replace(/\s+/g, '').toLowerCase();

export const applyEmailDomainSuggestion = (currentEmail: string, domain: string): string => {
  const cleaned = normalizeEmail(currentEmail);
  const atIndex = cleaned.indexOf('@');
  const localPart = atIndex === -1 ? cleaned : cleaned.slice(0, atIndex);
  if (!localPart) return cleaned;
  return `${localPart}${domain}`;
};

const PHONE_CA = /^[2-9]\d{2}[2-9]\d{6}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const POSTAL_CA = /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] \d[ABCEGHJ-NPRSTV-Z]\d$/;

// La case de consentement « activité » est requise au concours et dès qu'une coordonnée est saisie
export const needsActivityConsent = (draft: ContactDraft, mode: ContactMode): boolean => {
  if (mode === 'volunteer') return false;
  if (mode === 'contest') return true;
  return draft.phone.trim() !== '' || draft.email.trim() !== '' || draft.postalCode.trim() !== '';
};

export const validateContact = (draft: ContactDraft, mode: ContactMode): ContactErrors => {
  const errors: ContactErrors = {};
  const displayName = resolveDraftDisplayName(draft);
  if (!displayName) {
    errors.displayName = 'Indiquez le nom, prénom ou surnom.';
  } else if (displayName.length > 100) {
    errors.displayName = '100 caractères au maximum.';
  }

  if (draft.pronouns === 'Autre' && draft.pronounsCustom.trim().length > 40) {
    errors.pronounsCustom = '40 caractères au maximum.';
  }

  const phone = normalizePhone(draft.phone, false);
  if (phone && !PHONE_CA.test(phone)) {
    errors.phone = 'Numéro à 10 chiffres attendu, par exemple 514 555-1234.';
  }

  const email = normalizeEmail(draft.email);
  if (email && !EMAIL.test(email)) {
    errors.email = 'Courriel invalide, par exemple nom@exemple.com.';
  }

  // Toujours demander les 2 champs, mais 1 seul des 2 est obligatoire pour pouvoir contacter la personne
  if (!phone && !email) {
    errors.contact = 'Indiquez un téléphone ou un courriel.';
  }

  const postal = normalizePostal(draft.postalCode, false);
  if (postal && !POSTAL_CA.test(postal)) {
    errors.postalCode = 'Code postal canadien attendu, par exemple H2W 1Y4.';
  }

  const volunteering = mode === 'volunteer' || draft.wantsToVolunteer;
  if (volunteering) {
    if (draft.roles.length === 0) errors.roles = 'Choisissez au moins un rôle.';
    if (draft.dietaryRestrictions.trim().length > 200) errors.dietaryRestrictions = '200 caractères au maximum.';
    const day = draft.birthDay ? Number(draft.birthDay) : null;
    const month = draft.birthMonth ? Number(draft.birthMonth) : null;
    if ((day === null) !== (month === null) || (day !== null && month !== null && (month < 1 || month > 12 || day < 1 || day > DAYS_IN_MONTH[month - 1]))) {
      errors.birthDay = "Date d'anniversaire invalide.";
    }
    if (!draft.consentVolunteer) errors.consentVolunteer = 'Ce consentement est requis pour le bénévolat.';
  }

  if (needsActivityConsent(draft, mode) && !draft.consentActivity) {
    errors.consentActivity = 'Cochez ce consentement ou retirez les coordonnées.';
  }
  return errors;
};

export const IDENTITY_ERROR_KEYS = new Set<ContactErrorKey>([
  'displayName', 'firstName', 'lastName', 'pronounsCustom'
]);

export const CONTACT_ONLY_ERROR_KEYS = new Set<ContactErrorKey>([
  'phone', 'email', 'contact', 'postalCode', 'consentActivity'
]);

export const COORDINATE_ERROR_KEYS = new Set<ContactErrorKey>([
  'displayName', 'firstName', 'lastName', 'pronounsCustom', 'phone', 'email', 'contact', 'postalCode', 'consentActivity'
]);

export const VOLUNTEER_ERROR_KEYS = new Set<ContactErrorKey>([
  'roles', 'dietaryRestrictions', 'birthDay', 'consentVolunteer'
]);

export const validateContactStep = (
  draft: ContactDraft,
  mode: ContactMode,
  section: 'identity' | 'contact' | 'coordinates' | 'volunteer'
): ContactErrors => {
  const allErrors = validateContact(draft, mode);
  const allowedKeys =
    section === 'identity'
      ? IDENTITY_ERROR_KEYS
      : section === 'contact'
        ? CONTACT_ONLY_ERROR_KEYS
        : section === 'coordinates'
          ? COORDINATE_ERROR_KEYS
          : VOLUNTEER_ERROR_KEYS;
  const filtered: ContactErrors = {};
  for (const key of CONTACT_FIELD_ORDER) {
    if (allowedKeys.has(key) && allErrors[key]) {
      filtered[key] = allErrors[key];
    }
  }
  return filtered;
};

export const firstContactError = (errors: ContactErrors): ContactErrorKey | undefined =>
  CONTACT_FIELD_ORDER.find((key) => errors[key]);

// Les réponses cachées (bénévolat décoché, Technique décoché) ne sont jamais conservées
export const buildContactInfo = (draft: ContactDraft, mode: ContactMode, source: ContactSource, now: number): ContactInfo => {
  const volunteering = mode === 'volunteer' || draft.wantsToVolunteer;
  const pronouns = draft.pronouns === 'Autre' ? cleanName(draft.pronounsCustom) : draft.pronouns.trim();
  const { firstName, lastName } = splitDisplayName(resolveDraftDisplayName(draft));
  const contact: ContactInfo = {
    firstName,
    lastName,
    pronouns,
    phone: normalizePhone(draft.phone, false),
    email: normalizeEmail(draft.email),
    postalCode: normalizePostal(draft.postalCode, false),
    outsideCanada: false,
    wantsToVolunteer: volunteering,
    consent: {
      activity: mode !== 'volunteer' && draft.consentActivity ? now : null,
      volunteer: volunteering && draft.consentVolunteer ? now : null,
      newsletter: draft.consentNewsletter ? now : null
    },
    source,
    updatedAt: now
  };
  if (volunteering) {
    contact.volunteer = {
      roles: VOLUNTEER_ROLES.map((r) => r.id).filter((id) => draft.roles.includes(id)),
      techSkills: draft.roles.includes('technique') ? TECH_SKILLS.map((s) => s.id).filter((id) => draft.techSkills.includes(id)) : [],
      hasVehicle: draft.hasVehicle,
      tshirtSize: draft.tshirtSize,
      dietaryRestrictions: draft.dietaryRestrictions.trim(),
      birthDay: draft.birthDay ? Number(draft.birthDay) : null,
      birthMonth: draft.birthMonth ? Number(draft.birthMonth) : null
    };
  }
  return contact;
};

export const fullName = (contact: Pick<ContactInfo, 'firstName' | 'lastName'>): string =>
  `${contact.firstName} ${contact.lastName}`.trim();

// Lit la fiche de contact d'un enregistrement ; les anciennes fiches (nom complet seulement) sont converties à la volée
export const readContact = (record: {
  name?: string;
  visitorName?: string;
  email?: string;
  visitorEmail?: string;
  postalCode?: string;
  extraData?: Record<string, any>;
}): ContactInfo => {
  const stored = record.extraData?.contact as ContactInfo | undefined;
  if (stored && typeof stored.firstName === 'string') {
    return {
      ...stored,
      outsideCanada: false,
      pronouns: typeof stored.pronouns === 'string' ? stored.pronouns : ''
    };
  }
  const { firstName, lastName } = splitDisplayName(record.name || record.visitorName || '');
  const consentAt = record.extraData?.consentContact ? record.extraData?.consentAt ?? null : null;
  return {
    firstName,
    lastName,
    pronouns: '',
    phone: '',
    email: (record.email || record.visitorEmail || '').trim().toLowerCase(),
    postalCode: record.postalCode || '',
    outsideCanada: false,
    wantsToVolunteer: false,
    consent: { activity: consentAt, volunteer: null, newsletter: null },
    source: 'activite',
    updatedAt: 0
  };
};

// Bloque l'injection de formules dans Excel
export const protectFormula = (val: any) => {
  if (typeof val === 'string' && ['=', '+', '-', '@'].some((c) => val.startsWith(c))) {
    return "'" + val;
  }
  return val;
};

const yes = (value: boolean) => (value ? 'Oui' : '');
const isoDate = (ms: number | null) => (ms ? new Date(ms).toISOString().slice(0, 10) : '');
const pad2 = (n: number) => String(n).padStart(2, '0');

export const CONTACT_EXPORT_HEADER = [
  'Prénom', 'Nom', 'Pronoms', 'Téléphone', 'Courriel', 'Code postal', 'Hors Canada', 'Bénévole',
  ...VOLUNTEER_ROLES.map((r) => r.label),
  ...TECH_SKILLS.map((s) => s.label),
  'Véhicule', 'Taille t-shirt', 'Restrictions alimentaires', 'Anniversaire',
  'Consentement concours ou activité', 'Consentement bénévolat', 'Consentement infolettre'
];

// Les cases valent « Oui » ou rien, pour que le filtre Excel isole les Oui d'un clic
export const contactExportCells = (contact: ContactInfo): string[] => {
  const v = contact.volunteer;
  return [
    contact.firstName,
    contact.lastName,
    contact.pronouns || '',
    formatPhone(contact.phone),
    contact.email,
    contact.postalCode,
    '',
    yes(contact.wantsToVolunteer),
    ...VOLUNTEER_ROLES.map((r) => yes(!!v?.roles.includes(r.id))),
    ...TECH_SKILLS.map((s) => yes(!!v?.techSkills.includes(s.id))),
    yes(!!v?.hasVehicle),
    v?.tshirtSize || '',
    v?.dietaryRestrictions || '',
    v?.birthDay && v?.birthMonth ? `${pad2(v.birthDay)}/${pad2(v.birthMonth)}` : '',
    isoDate(contact.consent.activity),
    isoDate(contact.consent.volunteer),
    isoDate(contact.consent.newsletter)
  ];
};

// En-têtes d'export ignorés à la réimportation (prénom et nom sont recombinés, courriel et code postal relus)
export const CONTACT_IMPORT_IGNORED = new Set(
  [...CONTACT_EXPORT_HEADER, 'Source', 'Activité', "Date de l'activité", "Date d'inscription"]
    .map((h) => h.toLowerCase())
    .filter((h) => !['prénom', 'nom', 'courriel', 'code postal'].includes(h))
);
