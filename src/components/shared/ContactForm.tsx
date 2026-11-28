import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, HandHeart, Pencil } from 'lucide-react';
import type { ContactMode, TechSkill, TshirtSize, VolunteerRole } from '../../types';
import TextField, { fieldInputClass, fieldLabelClass } from './TextField';
import {
  ContactDraft,
  ContactErrors,
  EMAIL_DOMAIN_SUGGESTIONS,
  MONTHS,
  PRONOUN_OPTIONS,
  QUEBEC_AREA_CODES,
  TECH_SKILLS,
  TSHIRT_SIZES,
  VOLUNTEER_ROLES,
  applyEmailDomainSuggestion,
  applyQuebecAreaCode,
  firstContactError,
  formatPhoneLive,
  needsActivityConsent,
  normalizePostal,
  resolveDraftDisplayName,
  splitDisplayName,
  validateContactStep
} from '../../utils/contact';

export type ContactFormSection = 'all' | 'coordinates' | 'volunteer';

export type ContactFormMicroStep =
  | 'identity'
  | 'contact'
  | 'loi25'
  | 'vol_roles'
  | 'vol_skills'
  | 'vol_logistics'
  | 'vol_extra'
  | 'vol_consent'
  | 'summary';

export interface ContactSummaryRow {
  label: string;
  value: string;
  onEdit?: () => void;
}

interface ContactFormProps {
  idPrefix: string;
  mode: ContactMode;
  section?: ContactFormSection;
  stepped?: boolean;
  includeSummary?: boolean;
  resetKey?: number;
  value: ContactDraft;
  onChange: (next: ContactDraft) => void;
  errors?: ContactErrors;
  extraSummaryRows?: ContactSummaryRow[];
  renderExtraFinalFields?: () => React.ReactNode;
  onStepBackFromFirst?: () => void;
  firstStepBackLabel?: string;
  renderSubmitActions?: () => React.ReactNode;
}

const errorClass = 'text-xs font-bold text-danger';
const consentRowClass =
  'min-h-12 px-3.5 py-2.5 rounded-xl border border-app-card-border bg-app-input/60 flex items-start gap-2.5 text-xs sm:text-sm text-app-text cursor-pointer hover:border-primary/50 transition-colors';

const STEP_META: Record<ContactFormMicroStep, { title: string; falc: string }> = {
  identity: {
    title: 'Identité & pronoms',
    falc: 'Votre prénom ou un surnom suffit. Les pronoms sont facultatifs.'
  },
  contact: {
    title: 'Comment vous joindre',
    falc: 'Un seul moyen suffit : indiquez un téléphone ou un courriel.'
  },
  loi25: {
    title: 'Code postal & confidentialité',
    falc: 'Vos réponses restent confidentielles et servent uniquement pour cette activité.'
  },
  vol_roles: {
    title: 'Rôles de bénévolat',
    falc: 'Choisissez au moins une façon dont vous aimeriez aider.'
  },
  vol_skills: {
    title: 'Compétences techniques',
    falc: 'Sélectionnez les sujets avec lesquels vous êtes à l’aise (facultatif).'
  },
  vol_logistics: {
    title: 'Véhicule & t-shirt',
    falc: 'Informations pratiques pour l’organisation des activités (facultatif).'
  },
  vol_extra: {
    title: 'Alimentation & anniversaire',
    falc: 'Pour prévoir les collations adaptées et souligner votre fête (facultatif).'
  },
  vol_consent: {
    title: 'Accord de contact bénévole',
    falc: 'Obligatoire pour rejoindre l’équipe des bénévoles Insertech.'
  },
  summary: {
    title: 'Récapitulatif avant validation',
    falc: 'Vérifiez vos informations. Vous pouvez modifier une réponse en un clic.'
  }
};

// Formulaire de contact commun « 1 question à la fois » avec progression claire, FALC et récapitulatif final
export default function ContactForm({
  idPrefix,
  mode,
  section = 'all',
  stepped = true,
  includeSummary = section === 'all',
  resetKey = 0,
  value,
  onChange,
  errors = {},
  extraSummaryRows = [],
  renderExtraFinalFields,
  onStepBackFromFirst,
  firstStepBackLabel = 'Précédent',
  renderSubmitActions
}: ContactFormProps) {
  const volunteering = mode === 'volunteer' || value.wantsToVolunteer;
  const hasTechRole = value.roles.includes('technique');

  const steps = useMemo<ContactFormMicroStep[]>(() => {
    const list: ContactFormMicroStep[] = [];
    if (section !== 'volunteer') {
      list.push('identity', 'contact', 'loi25');
    }
    if (section === 'volunteer' || (section === 'all' && volunteering)) {
      list.push('vol_roles');
      if (hasTechRole) list.push('vol_skills');
      list.push('vol_logistics', 'vol_extra', 'vol_consent');
    }
    if (stepped && includeSummary) {
      list.push('summary');
    }
    return list;
  }, [section, volunteering, hasTechRole, stepped, includeSummary]);

  const [activeStep, setActiveStep] = useState<ContactFormMicroStep>(() => steps[0] || 'identity');
  const [localErrors, setLocalErrors] = useState<ContactErrors>({});

  useEffect(() => {
    setActiveStep(steps[0] || 'identity');
    setLocalErrors({});
  }, [resetKey, section]);

  // Si la liste dynamique d'étapes change et que l'étape active n'existe plus, revenir à une étape valide
  useEffect(() => {
    if (!steps.includes(activeStep)) {
      setActiveStep(steps[0] || 'identity');
    }
  }, [steps, activeStep]);

  const mergedErrors: ContactErrors = { ...localErrors, ...errors };

  // Redirige automatiquement vers la micro-étape fautive après validation parent
  useEffect(() => {
    if (!stepped) return;
    const first = firstContactError(errors);
    if (!first) return;
    if (['displayName', 'firstName', 'lastName', 'pronounsCustom'].includes(first)) {
      setActiveStep('identity');
    } else if (['phone', 'email', 'contact'].includes(first)) {
      setActiveStep('contact');
    } else if (['postalCode', 'consentActivity'].includes(first)) {
      setActiveStep('loi25');
    } else if (first === 'roles') {
      setActiveStep('vol_roles');
    } else if (['dietaryRestrictions', 'birthDay'].includes(first)) {
      setActiveStep('vol_extra');
    } else if (first === 'consentVolunteer') {
      setActiveStep('vol_consent');
    }
  }, [errors, stepped]);

  const set = <K extends keyof ContactDraft>(key: K, v: ContactDraft[K]) => {
    setLocalErrors({});
    onChange({ ...value, [key]: v });
  };

  const toggle = <T extends string>(list: T[], item: T): T[] =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

  const id = (field: string) => `${idPrefix}-${field}`;
  const activityRequired = needsActivityConsent(value, mode);
  const displayNameValue = resolveDraftDisplayName(value);

  const currentIndex = Math.max(0, steps.indexOf(activeStep));
  const isFirstStep = currentIndex === 0;
  const isFinalStep = !stepped || currentIndex === steps.length - 1;

  const isVisible = (stepName: ContactFormMicroStep) =>
    !stepped ? stepName !== 'summary' : activeStep === stepName;

  const errorText = (key: keyof ContactErrors) =>
    mergedErrors[key] ? (
      <p id={id(`${key}-error`)} role="alert" className={errorClass}>
        {mergedErrors[key]}
      </p>
    ) : null;

  const emailTrimmed = value.email.trim();
  const atPos = emailTrimmed.indexOf('@');
  const typedSuffix = atPos !== -1 ? emailTrimmed.slice(atPos).toLowerCase() : '';
  const visibleEmailDomains =
    atPos !== -1
      ? EMAIL_DOMAIN_SUGGESTIONS.filter((d) => d.startsWith(typedSuffix) && d !== typedSuffix)
      : EMAIL_DOMAIN_SUGGESTIONS;

  const validateCurrentMicroStep = (stepName: ContactFormMicroStep): boolean => {
    if (stepName === 'summary') return true;
    const errs = validateContactStep(value, mode, stepName);
    if (Object.keys(errs).length > 0) {
      setLocalErrors(errs);
      const first = firstContactError(errs);
      const targetKey = first === 'contact' ? 'phone' : first;
      if (targetKey) {
        window.setTimeout(() => document.getElementById(id(targetKey))?.focus(), 0);
      }
      return false;
    }
    setLocalErrors({});
    return true;
  };

  const handleNextStep = () => {
    if (!validateCurrentMicroStep(activeStep)) return;
    const nextIdx = currentIndex + 1;
    if (nextIdx < steps.length) {
      setActiveStep(steps[nextIdx]);
    }
  };

  const handlePrevStep = () => {
    setLocalErrors({});
    if (currentIndex > 0) {
      setActiveStep(steps[currentIndex - 1]);
    } else if (onStepBackFromFirst) {
      onStepBackFromFirst();
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (stepped && !isFinalStep && e.key === 'Enter') {
      e.preventDefault();
      handleNextStep();
    }
  };

  const meta = STEP_META[activeStep];
  const pronounsLabel =
    value.pronouns === 'Autre' ? value.pronounsCustom.trim() : value.pronouns.trim();
  const roleLabels = VOLUNTEER_ROLES.filter((r) => value.roles.includes(r.id)).map((r) => r.label);
  const skillLabels = TECH_SKILLS.filter((s) => value.techSkills.includes(s.id)).map((s) => s.label);

  return (
    <div className="space-y-4">
      {/* Indicateur d'étape accessible et annonce pour lecteurs d'écran */}
      {stepped && steps.length > 1 && (
        <div className="space-y-2 pb-2 border-b border-app-card-border">
          <div className="flex items-center justify-between gap-2">
            <span className="text-micro font-bold uppercase tracking-wider text-primary" aria-live="polite">
              Question {currentIndex + 1} sur {steps.length} · {meta.title}
            </span>
            <div className="flex items-center gap-1" aria-hidden="true">
              {steps.map((s, idx) => (
                <span
                  key={s}
                  className={`h-1.5 rounded-full transition-all ${
                    idx === currentIndex
                      ? 'w-5 bg-primary'
                      : idx < currentIndex
                        ? 'w-2.5 bg-primary/60'
                        : 'w-2 bg-app-card-border'
                  }`}
                />
              ))}
            </div>
          </div>
          <p className="text-xs text-app-text-muted font-sans">{meta.falc}</p>
        </div>
      )}

      {/* ÉTAPE : IDENTITÉ + PRONOMS */}
      {section !== 'volunteer' && isVisible('identity') && (
        <div className="space-y-3.5">
          <TextField
            id={id('displayName')}
            label="Nom, prénom ou surnom *"
            autoComplete="name"
            placeholder="Ex. Sophie Côté ou Alex"
            value={displayNameValue}
            onKeyDown={handleInputKeyDown}
            onChange={(e) => {
              const raw = e.target.value;
              const { firstName, lastName } = splitDisplayName(raw);
              setLocalErrors({});
              onChange({
                ...value,
                displayName: raw,
                firstName,
                lastName
              });
            }}
            error={mergedErrors.displayName || mergedErrors.firstName || mergedErrors.lastName}
            maxLength={100}
            inputClassName="min-h-12"
          />

          <fieldset className="space-y-1.5">
            <legend className={fieldLabelClass}>Pronoms (optionnel)</legend>
            <div className="flex flex-wrap gap-1.5">
              {PRONOUN_OPTIONS.map((option) => {
                const selected = value.pronouns === option;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      const nextPronouns = selected ? '' : option;
                      setLocalErrors({});
                      onChange({
                        ...value,
                        pronouns: nextPronouns,
                        pronounsCustom: nextPronouns === 'Autre' ? value.pronounsCustom : ''
                      });
                    }}
                    className={`min-h-9 px-3.5 py-1.5 rounded-full border text-xs font-bold transition-colors cursor-pointer ${
                      selected
                        ? 'bg-primary text-secondary border-primary font-black shadow-xs'
                        : 'bg-app-input/80 border-app-card-border text-app-text-muted hover:text-app-text hover:border-primary/50'
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
            {value.pronouns === 'Autre' && (
              <div className="pt-1.5">
                <TextField
                  id={id('pronounsCustom')}
                  label="Précisez vos pronoms"
                  placeholder="Ex. elle/iel, il/iel"
                  value={value.pronounsCustom}
                  onKeyDown={handleInputKeyDown}
                  onChange={(e) => set('pronounsCustom', e.target.value)}
                  error={mergedErrors.pronounsCustom}
                  maxLength={40}
                  inputClassName="min-h-12"
                />
              </div>
            )}
          </fieldset>
        </div>
      )}

      {/* ÉTAPE : CONTACT (TÉLÉPHONE QC OU COURRIEL @DOMAINES) */}
      {section !== 'volunteer' && isVisible('contact') && (
        <div className="space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <TextField
                id={id('phone')}
                label="Téléphone"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="514 555-1234"
                value={value.phone}
                onKeyDown={handleInputKeyDown}
                onChange={(e) => set('phone', formatPhoneLive(e.target.value))}
                error={mergedErrors.phone}
                inputClassName="min-h-12"
              />
              <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Indicatifs Québec">
                {QUEBEC_AREA_CODES.map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => {
                      set('phone', applyQuebecAreaCode(value.phone, code));
                      document.getElementById(id('phone'))?.focus();
                    }}
                    className="min-h-8 px-2.5 py-0.5 rounded-full bg-app-input border border-app-card-border text-micro font-mono font-bold text-app-text-muted hover:text-primary hover:border-primary/60 transition cursor-pointer"
                  >
                    {code}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <TextField
                id={id('email')}
                label="Courriel"
                type="email"
                autoComplete="email"
                placeholder="nom@gmail.com"
                value={value.email}
                onKeyDown={handleInputKeyDown}
                onChange={(e) => set('email', e.target.value)}
                error={mergedErrors.email}
                inputClassName="min-h-12"
                aria-describedby={
                  [mergedErrors.email && id('email-error'), mergedErrors.contact && id('contact-error')]
                    .filter(Boolean)
                    .join(' ') || undefined
                }
              />
              {visibleEmailDomains.length > 0 && (
                <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Domaines courriel fréquents">
                  {visibleEmailDomains.map((domain) => (
                    <button
                      key={domain}
                      type="button"
                      disabled={!emailTrimmed || emailTrimmed.startsWith('@')}
                      onClick={() => {
                        set('email', applyEmailDomainSuggestion(value.email, domain));
                        document.getElementById(id('email'))?.focus();
                      }}
                      className="min-h-8 px-2.5 py-0.5 rounded-full bg-app-input border border-app-card-border text-micro font-bold text-app-text-muted hover:text-primary hover:border-primary/60 disabled:opacity-40 transition cursor-pointer"
                    >
                      {domain}
                    </button>
                  ))}
                </div>
              )}
              {errorText('contact')}
            </div>
          </div>
        </div>
      )}

      {/* ÉTAPE : CODE POSTAL + LOI 25 + OPTION BÉNÉVOLAT */}
      {section !== 'volunteer' && isVisible('loi25') && (
        <div className="space-y-3.5">
          <TextField
            id={id('postalCode')}
            label="Code postal (Canada)"
            autoComplete="postal-code"
            placeholder="H2W 1Y4"
            value={value.postalCode}
            onKeyDown={handleInputKeyDown}
            onChange={(e) => set('postalCode', normalizePostal(e.target.value))}
            error={mergedErrors.postalCode}
            inputClassName="min-h-12"
          />

          {mode !== 'volunteer' && (
            <div className="space-y-1">
              <label className={consentRowClass}>
                <input
                  id={id('consentActivity')}
                  type="checkbox"
                  checked={value.consentActivity}
                  onChange={(e) => set('consentActivity', e.target.checked)}
                  aria-invalid={mergedErrors.consentActivity ? true : undefined}
                  aria-describedby={mergedErrors.consentActivity ? id('consentActivity-error') : undefined}
                  className="w-4 h-4 mt-0.5 shrink-0 accent-primary"
                />
                <span>
                  {mode === 'contest'
                    ? "J'accepte qu'on utilise mes coordonnées pour me joindre au sujet de ce concours."
                    : "J'accepte qu'on utilise mes coordonnées pour me joindre au sujet de cette activité."}
                  {activityRequired && ' *'}
                </span>
              </label>
              {errorText('consentActivity')}
            </div>
          )}

          <label className={consentRowClass}>
            <input
              id={id('consentNewsletter')}
              type="checkbox"
              checked={value.consentNewsletter}
              onChange={(e) => set('consentNewsletter', e.target.checked)}
              className="w-4 h-4 mt-0.5 shrink-0 accent-primary"
            />
            <span>Je veux recevoir l'infolettre.</span>
          </label>

          {mode !== 'volunteer' && (
            <label
              className={`min-h-12 px-4 py-3 rounded-2xl border-2 flex items-center gap-3 text-xs sm:text-sm font-bold cursor-pointer transition-colors ${
                value.wantsToVolunteer
                  ? 'bg-primary text-secondary border-primary font-black shadow-sm'
                  : 'bg-app-input border-app-card-border text-app-text hover:border-primary/60'
              }`}
            >
              <input
                id={id('wantsToVolunteer')}
                type="checkbox"
                checked={value.wantsToVolunteer}
                onChange={(e) => set('wantsToVolunteer', e.target.checked)}
                className={`w-4 h-4 shrink-0 ${value.wantsToVolunteer ? 'accent-secondary' : 'accent-primary'}`}
              />
              <HandHeart
                size={18}
                className={value.wantsToVolunteer ? 'text-secondary shrink-0' : 'text-primary shrink-0'}
                aria-hidden="true"
              />
              <span>Je souhaite donner des heures de bénévolat</span>
            </label>
          )}
        </div>
      )}

      {/* ÉTAPE BÉNÉVOLAT 1 : RÔLES */}
      {(section === 'volunteer' || (section === 'all' && volunteering)) && isVisible('vol_roles') && (
        <fieldset className="space-y-2.5" aria-describedby={mergedErrors.roles ? id('roles-error') : undefined}>
          <legend className={fieldLabelClass}>Comment aimeriez-vous aider ? *</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {VOLUNTEER_ROLES.map((role) => {
              const checked = value.roles.includes(role.id);
              return (
                <label
                  key={role.id}
                  className={`min-h-12 px-3.5 py-2.5 rounded-xl border-2 flex items-center gap-2.5 text-xs sm:text-sm font-bold cursor-pointer transition-colors ${
                    checked
                      ? 'bg-primary text-secondary border-primary font-black'
                      : 'bg-app-input border-app-card-border text-app-text hover:border-primary/60'
                  }`}
                >
                  <input
                    id={id(`role-${role.id}`)}
                    type="checkbox"
                    checked={checked}
                    onChange={() => set('roles', toggle<VolunteerRole>(value.roles, role.id))}
                    className={`w-4 h-4 shrink-0 ${checked ? 'accent-secondary' : 'accent-primary'}`}
                  />
                  <span>{role.label}</span>
                </label>
              );
            })}
          </div>
          {errorText('roles')}
        </fieldset>
      )}

      {/* ÉTAPE BÉNÉVOLAT 2 : COMPÉTENCES TECHNIQUES */}
      {(section === 'volunteer' || (section === 'all' && volunteering)) && hasTechRole && isVisible('vol_skills') && (
        <fieldset className="space-y-2.5">
          <legend className={fieldLabelClass}>Vos compétences techniques</legend>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {TECH_SKILLS.map((skill) => {
              const checked = value.techSkills.includes(skill.id);
              return (
                <label
                  key={skill.id}
                  className={`min-h-12 px-3 py-2 rounded-xl border-2 flex items-center gap-2 text-xs font-bold cursor-pointer transition-colors ${
                    checked
                      ? 'bg-primary text-secondary border-primary font-black'
                      : 'bg-app-input border-app-card-border text-app-text hover:border-primary/60'
                  }`}
                >
                  <input
                    id={id(`skill-${skill.id}`)}
                    type="checkbox"
                    checked={checked}
                    onChange={() => set('techSkills', toggle<TechSkill>(value.techSkills, skill.id))}
                    className={`w-4 h-4 shrink-0 ${checked ? 'accent-secondary' : 'accent-primary'}`}
                  />
                  <span>{skill.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {/* ÉTAPE BÉNÉVOLAT 3 : VÉHICULE & T-SHIRT */}
      {(section === 'volunteer' || (section === 'all' && volunteering)) && isVisible('vol_logistics') && (
        <div className="space-y-3.5">
          <label
            className={`min-h-12 px-4 py-2.5 rounded-xl border-2 inline-flex items-center gap-2.5 text-xs sm:text-sm font-bold cursor-pointer transition-colors ${
              value.hasVehicle
                ? 'bg-primary text-secondary border-primary font-black'
                : 'bg-app-input border-app-card-border text-app-text hover:border-primary/60'
            }`}
          >
            <input
              id={id('hasVehicle')}
              type="checkbox"
              checked={value.hasVehicle}
              onChange={(e) => set('hasVehicle', e.target.checked)}
              className={`w-4 h-4 shrink-0 ${value.hasVehicle ? 'accent-secondary' : 'accent-primary'}`}
            />
            <span>J'ai un véhicule</span>
          </label>

          <fieldset className="space-y-2">
            <legend className={fieldLabelClass}>Taille de t-shirt</legend>
            <div className="flex flex-wrap gap-2">
              {(['', ...TSHIRT_SIZES] as TshirtSize[]).map((size) => {
                const selected = value.tshirtSize === size;
                return (
                  <button
                    key={size || 'none'}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => set('tshirtSize', size)}
                    className={`min-h-12 px-4 py-2 rounded-xl border-2 font-display font-bold uppercase text-xs transition-colors cursor-pointer ${
                      selected
                        ? 'bg-primary text-secondary border-primary font-black'
                        : 'bg-app-input text-app-text border-app-card-border hover:border-primary/60'
                    }`}
                  >
                    {size || 'Non précisée'}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>
      )}

      {/* ÉTAPE BÉNÉVOLAT 4 : RESTRICTIONS ALIMENTAIRES & ANNIVERSAIRE */}
      {(section === 'volunteer' || (section === 'all' && volunteering)) && isVisible('vol_extra') && (
        <div className="space-y-3.5">
          <TextField
            id={id('dietaryRestrictions')}
            label="Restrictions alimentaires"
            placeholder="Ex. végétarien, allergie aux arachides"
            value={value.dietaryRestrictions}
            onKeyDown={handleInputKeyDown}
            onChange={(e) => set('dietaryRestrictions', e.target.value)}
            error={mergedErrors.dietaryRestrictions}
            maxLength={200}
            inputClassName="min-h-12"
          />

          <fieldset className="space-y-1.5" aria-describedby={mergedErrors.birthDay ? id('birthDay-error') : undefined}>
            <legend className={fieldLabelClass}>Anniversaire (jour et mois)</legend>
            <div className="grid grid-cols-2 gap-3">
              <select
                id={id('birthDay')}
                aria-label="Jour"
                aria-invalid={mergedErrors.birthDay ? true : undefined}
                value={value.birthDay}
                onChange={(e) => set('birthDay', e.target.value)}
                className={`${fieldInputClass} min-h-12`}
              >
                <option value="">Jour</option>
                {Array.from({ length: 31 }, (_, i) => (
                  <option key={i + 1} value={String(i + 1)}>
                    {i + 1}
                  </option>
                ))}
              </select>
              <select
                id={id('birthMonth')}
                aria-label="Mois"
                aria-invalid={mergedErrors.birthDay ? true : undefined}
                value={value.birthMonth}
                onChange={(e) => set('birthMonth', e.target.value)}
                className={`${fieldInputClass} min-h-12`}
              >
                <option value="">Mois</option>
                {MONTHS.map((month, i) => (
                  <option key={month} value={String(i + 1)}>
                    {month}
                  </option>
                ))}
              </select>
            </div>
            {errorText('birthDay')}
          </fieldset>
        </div>
      )}

      {/* ÉTAPE BÉNÉVOLAT 5 : CONSENTEMENT BÉNÉVOLE */}
      {(section === 'volunteer' || (section === 'all' && volunteering)) && isVisible('vol_consent') && (
        <div className="space-y-2">
          <div className="space-y-1">
            <label className={consentRowClass}>
              <input
                id={id('consentVolunteer')}
                type="checkbox"
                checked={value.consentVolunteer}
                onChange={(e) => set('consentVolunteer', e.target.checked)}
                aria-invalid={mergedErrors.consentVolunteer ? true : undefined}
                aria-describedby={mergedErrors.consentVolunteer ? id('consentVolunteer-error') : undefined}
                className="w-4 h-4 mt-0.5 shrink-0 accent-primary"
              />
              <span>
                J'accepte qu'on me contacte pour du bénévolat et qu'on conserve mes réponses jusqu'à ce que je demande
                leur retrait. *
              </span>
            </label>
            {errorText('consentVolunteer')}
          </div>
          <p className="text-micro text-app-text-muted">
            Vos données sont conservées jusqu'à ce que vous demandiez leur retrait à l'équipe.
          </p>
        </div>
      )}

      {/* ÉTAPE FINALE : RÉCAPITULATIF + CHAMPS FINAUX OPTIONNELS */}
      {stepped && isVisible('summary') && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-app-card-border bg-app-input/60 p-3.5 space-y-2.5">
            {extraSummaryRows.map((row) => (
              <div key={row.label} className="flex items-start justify-between gap-2 pb-2 border-b border-app-card-border/70">
                <div className="min-w-0">
                  <span className="text-micro font-bold uppercase text-app-text-muted block">{row.label}</span>
                  <span className="text-xs sm:text-sm font-bold text-app-text break-words">{row.value}</span>
                </div>
                {row.onEdit && (
                  <button
                    type="button"
                    onClick={row.onEdit}
                    className="min-h-8 px-2.5 py-1 rounded-lg bg-app-card border border-app-card-border text-micro font-display font-bold uppercase text-primary hover:border-primary cursor-pointer shrink-0 inline-flex items-center gap-1"
                  >
                    <Pencil size={11} aria-hidden="true" />
                    <span>Modifier</span>
                  </button>
                )}
              </div>
            ))}

            {section !== 'volunteer' && (
              <>
                <div className="flex items-start justify-between gap-2 pb-2 border-b border-app-card-border/70">
                  <div className="min-w-0">
                    <span className="text-micro font-bold uppercase text-app-text-muted block">Identité</span>
                    <span className="text-xs sm:text-sm font-bold text-app-text break-words">
                      {displayNameValue || 'Non renseigné'}
                      {pronounsLabel ? ` (${pronounsLabel})` : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveStep('identity')}
                    className="min-h-8 px-2.5 py-1 rounded-lg bg-app-card border border-app-card-border text-micro font-display font-bold uppercase text-primary hover:border-primary cursor-pointer shrink-0 inline-flex items-center gap-1"
                  >
                    <Pencil size={11} aria-hidden="true" />
                    <span>Modifier</span>
                  </button>
                </div>

                <div className="flex items-start justify-between gap-2 pb-2 border-b border-app-card-border/70">
                  <div className="min-w-0">
                    <span className="text-micro font-bold uppercase text-app-text-muted block">Contact</span>
                    <span className="text-xs sm:text-sm font-bold text-app-text break-words">
                      {[value.phone, value.email, value.postalCode].filter(Boolean).join(' · ') || 'Non renseigné'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveStep('contact')}
                    className="min-h-8 px-2.5 py-1 rounded-lg bg-app-card border border-app-card-border text-micro font-display font-bold uppercase text-primary hover:border-primary cursor-pointer shrink-0 inline-flex items-center gap-1"
                  >
                    <Pencil size={11} aria-hidden="true" />
                    <span>Modifier</span>
                  </button>
                </div>
              </>
            )}

            {(section === 'volunteer' || (section === 'all' && volunteering)) && (
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-micro font-bold uppercase text-app-text-muted block">Bénévolat</span>
                  <span className="text-xs sm:text-sm font-bold text-app-text break-words">
                    {roleLabels.length > 0 ? roleLabels.join(', ') : 'Aucun rôle'}
                    {skillLabels.length > 0 ? ` · Compétences : ${skillLabels.join(', ')}` : ''}
                    {value.hasVehicle ? ' · Véhicule' : ''}
                    {value.tshirtSize ? ` · T-shirt ${value.tshirtSize}` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveStep('vol_roles')}
                  className="min-h-8 px-2.5 py-1 rounded-lg bg-app-card border border-app-card-border text-micro font-display font-bold uppercase text-primary hover:border-primary cursor-pointer shrink-0 inline-flex items-center gap-1"
                >
                  <Pencil size={11} aria-hidden="true" />
                  <span>Modifier</span>
                </button>
              </div>
            )}
          </div>

          {renderExtraFinalFields && renderExtraFinalFields()}
        </div>
      )}

      {/* BARRE DE NAVIGATION ENTRE MICRO-ÉTAPES */}
      {stepped && (
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-app-card-border">
          {!isFirstStep || onStepBackFromFirst ? (
            <button
              type="button"
              onClick={handlePrevStep}
              className="min-h-12 px-4 py-2 rounded-xl bg-app-input border border-app-card-border text-app-text font-display font-bold uppercase text-xs cursor-pointer inline-flex items-center gap-1.5"
            >
              <ArrowLeft size={14} aria-hidden="true" />
              <span>{isFirstStep ? firstStepBackLabel : 'Précédent'}</span>
            </button>
          ) : (
            <div />
          )}

          {!isFinalStep ? (
            <button
              type="button"
              onClick={handleNextStep}
              className="min-h-12 px-6 py-2.5 rounded-xl bg-primary text-secondary font-display font-black uppercase text-xs sm:text-sm cursor-pointer inline-flex items-center gap-1.5 shadow-sm"
            >
              <span>Suivant</span>
              <ArrowRight size={15} aria-hidden="true" />
            </button>
          ) : (
            renderSubmitActions ? <div className="flex-1 flex justify-end gap-2">{renderSubmitActions()}</div> : null
          )}
        </div>
      )}

      {!stepped && renderSubmitActions && (
        <div className="pt-2">{renderSubmitActions()}</div>
      )}
    </div>
  );
}
