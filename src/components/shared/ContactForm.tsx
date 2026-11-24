import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, HandHeart } from 'lucide-react';
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

interface ContactFormProps {
  idPrefix: string;
  mode: ContactMode;
  section?: ContactFormSection;
  stepped?: boolean;
  resetKey?: number;
  value: ContactDraft;
  onChange: (next: ContactDraft) => void;
  errors?: ContactErrors;
  renderSubmitActions?: () => React.ReactNode;
}

const errorClass = 'text-xs font-bold text-danger';
const consentRowClass =
  'min-h-11 px-3.5 py-2.5 rounded-xl border border-app-card-border bg-app-input/60 flex items-start gap-2.5 text-xs text-app-text cursor-pointer hover:border-primary/50 transition-colors';

// Formulaire de contact commun et uniformisé en étapes 1-2-(3) :
// - Étape 1 : Nom, prénom ou surnom + petites bulles de pronoms neutres sans icône
// - Étape 2 : Téléphone (puces Québec) + Courriel (puces @domaines) (1 seul requis) + Code postal CA + Loi 25
// - Étape 3 : Bénévolat (affichée uniquement si mode === 'volunteer' ou wantsToVolunteer coché)
export default function ContactForm({
  idPrefix,
  mode,
  section = 'all',
  stepped = section === 'all',
  resetKey = 0,
  value,
  onChange,
  errors = {},
  renderSubmitActions
}: ContactFormProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [localErrors, setLocalErrors] = useState<ContactErrors>({});

  useEffect(() => {
    setStep(1);
    setLocalErrors({});
  }, [resetKey]);

  const mergedErrors: ContactErrors = { ...localErrors, ...errors };

  // Si le parent détecte une erreur sur une étape précédente après un submit direct, y revenir automatiquement
  useEffect(() => {
    if (!stepped) return;
    const first = firstContactError(errors);
    if (!first) return;
    if (['displayName', 'firstName', 'lastName', 'pronounsCustom'].includes(first)) {
      setStep(1);
    } else if (['phone', 'email', 'contact', 'postalCode', 'consentActivity'].includes(first)) {
      setStep(2);
    } else {
      setStep(3);
    }
  }, [errors, stepped]);

  const set = <K extends keyof ContactDraft>(key: K, v: ContactDraft[K]) => {
    setLocalErrors({});
    onChange({ ...value, [key]: v });
  };

  const toggle = <T extends string>(list: T[], item: T): T[] =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

  const id = (field: string) => `${idPrefix}-${field}`;
  const volunteering = mode === 'volunteer' || value.wantsToVolunteer;
  const activityRequired = needsActivityConsent(value, mode);
  const displayNameValue = resolveDraftDisplayName(value);

  const showCoordinates = section !== 'volunteer';
  const showIdentityBlock = showCoordinates && (!stepped || step === 1);
  const showContactBlock = showCoordinates && (!stepped || step === 2);
  const showVolunteerBlock =
    section === 'volunteer' ||
    (section === 'all' && volunteering && (!stepped || step === 3));

  const showConsentBlock =
    (!stepped && (showCoordinates || showVolunteerBlock)) ||
    (stepped && ((step === 2 && showContactBlock) || (step === 3 && showVolunteerBlock)));

  const errorText = (key: keyof ContactErrors) =>
    mergedErrors[key] ? (
      <p id={id(`${key}-error`)} role="alert" className={errorClass}>
        {mergedErrors[key]}
      </p>
    ) : null;

  // Filtrer les suggestions de domaines courriel en temps réel selon ce qui est tapé après '@'
  const emailTrimmed = value.email.trim();
  const atPos = emailTrimmed.indexOf('@');
  const typedSuffix = atPos !== -1 ? emailTrimmed.slice(atPos).toLowerCase() : '';
  const visibleEmailDomains =
    atPos !== -1
      ? EMAIL_DOMAIN_SUGGESTIONS.filter((d) => d.startsWith(typedSuffix) && d !== typedSuffix)
      : EMAIL_DOMAIN_SUGGESTIONS;

  const handleNextStep = () => {
    if (step === 1) {
      const errs = validateContactStep(value, mode, 'identity');
      if (Object.keys(errs).length > 0) {
        setLocalErrors(errs);
        document.getElementById(id('displayName'))?.focus();
        return;
      }
      setLocalErrors({});
      setStep(2);
    } else if (step === 2 && volunteering) {
      const errs = validateContactStep(value, mode, 'contact');
      if (Object.keys(errs).length > 0) {
        setLocalErrors(errs);
        const first = firstContactError(errs);
        document.getElementById(id(first === 'contact' ? 'phone' : first || 'phone'))?.focus();
        return;
      }
      setLocalErrors({});
      setStep(3);
    }
  };

  const totalSteps = volunteering ? 3 : 2;
  const isFinalStep = !stepped || step === totalSteps;

  return (
    <div className="space-y-3.5">
      {/* Barre de progression 1 - 2 - (3) pour les formulaires en mode stepped */}
      {stepped && section === 'all' && (
        <div className="flex items-center gap-1.5 pb-1" role="navigation" aria-label="Étapes du formulaire">
          {[
            { num: 1 as const, label: '1. Identité' },
            { num: 2 as const, label: '2. Contact' },
            ...(volunteering ? [{ num: 3 as const, label: '3. Bénévolat' }] : [])
          ].map((s) => {
            const active = step === s.num;
            const done = step > s.num;
            return (
              <button
                key={s.num}
                type="button"
                onClick={() => {
                  if (s.num <= step) setStep(s.num);
                  else handleNextStep();
                }}
                aria-current={active ? 'step' : undefined}
                className={`flex-1 min-h-9 px-2.5 py-1.5 rounded-xl border text-xs font-display font-bold uppercase tracking-wide transition cursor-pointer flex items-center justify-center gap-1 ${
                  active
                    ? 'bg-primary text-secondary border-primary font-black'
                    : done
                      ? 'bg-primary/15 text-primary border-primary/40'
                      : 'bg-app-input text-app-text-muted border-app-card-border'
                }`}
              >
                {done && <Check size={12} aria-hidden="true" />}
                <span>{s.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* BLOC 1 : IDENTITÉ UNIQUE + PETITES BULLES DE PRONOMS NEUTRES (SANS ICÔNE) */}
      {showIdentityBlock && (
        <div className="space-y-3">
          <TextField
            id={id('displayName')}
            label="Nom, prénom ou surnom *"
            autoComplete="name"
            placeholder="Ex. Sophie Côté ou Alex"
            value={displayNameValue}
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
            inputClassName="min-h-11"
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
                    className={`min-h-8 px-3 py-1 rounded-full border text-xs font-bold transition-colors cursor-pointer ${
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
                  onChange={(e) => set('pronounsCustom', e.target.value)}
                  error={mergedErrors.pronounsCustom}
                  maxLength={40}
                  inputClassName="min-h-11"
                />
              </div>
            )}
          </fieldset>
        </div>
      )}

      {/* BLOC 2 : CONTACT (TÉLÉPHONE QC + COURRIEL @DOMAINES, 1 SEUL REQUIS) + CODE POSTAL CA */}
      {showContactBlock && (
        <div className="space-y-3">
          <p className="text-micro font-bold uppercase tracking-wider text-primary">
            Téléphone ou courriel (un seul moyen requis pour vous joindre)
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Téléphone avec formatage live et indicatifs Québec en 1 tap */}
            <div className="space-y-1.5">
              <TextField
                id={id('phone')}
                label="Téléphone"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="514 555-1234"
                value={value.phone}
                onChange={(e) => set('phone', formatPhoneLive(e.target.value))}
                error={mergedErrors.phone}
                inputClassName="min-h-11"
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
                    className="min-h-7 px-2 py-0.5 rounded-full bg-app-input border border-app-card-border text-micro font-mono font-bold text-app-text-muted hover:text-primary hover:border-primary/60 transition cursor-pointer"
                  >
                    {code}
                  </button>
                ))}
              </div>
            </div>

            {/* Courriel avec puces d'auto-complétion @domaines */}
            <div className="space-y-1.5">
              <TextField
                id={id('email')}
                label="Courriel"
                type="email"
                autoComplete="email"
                placeholder="nom@gmail.com"
                value={value.email}
                onChange={(e) => set('email', e.target.value)}
                error={mergedErrors.email}
                inputClassName="min-h-11"
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
                      className="min-h-7 px-2 py-0.5 rounded-full bg-app-input border border-app-card-border text-micro font-bold text-app-text-muted hover:text-primary hover:border-primary/60 disabled:opacity-40 transition cursor-pointer"
                    >
                      {domain}
                    </button>
                  ))}
                </div>
              )}
              {errorText('contact')}
            </div>
          </div>

          <TextField
            id={id('postalCode')}
            label="Code postal (Canada)"
            autoComplete="postal-code"
            placeholder="H2W 1Y4"
            value={value.postalCode}
            onChange={(e) => set('postalCode', normalizePostal(e.target.value))}
            error={mergedErrors.postalCode}
            inputClassName="min-h-11"
          />

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

      {/* BLOC 3 : QUESTIONS DE BÉNÉVOLAT (CONDITIONNEL) */}
      {showVolunteerBlock && (
        <div
          className={
            section === 'all' && !stepped
              ? 'space-y-3.5 rounded-2xl border border-app-card-border bg-app-input/40 p-3.5'
              : 'space-y-4'
          }
        >
          <fieldset className="space-y-2" aria-describedby={mergedErrors.roles ? id('roles-error') : undefined}>
            <legend className={fieldLabelClass}>Comment aimeriez-vous aider ? *</legend>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {VOLUNTEER_ROLES.map((role) => {
                const checked = value.roles.includes(role.id);
                return (
                  <label
                    key={role.id}
                    className={`min-h-11 px-3 py-2 rounded-xl border-2 flex items-center gap-2 text-xs font-bold cursor-pointer transition-colors ${
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

          {value.roles.includes('technique') && (
            <fieldset className="space-y-2">
              <legend className={fieldLabelClass}>Vos compétences techniques</legend>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {TECH_SKILLS.map((skill) => {
                  const checked = value.techSkills.includes(skill.id);
                  return (
                    <label
                      key={skill.id}
                      className={`min-h-11 px-3 py-2 rounded-xl border-2 flex items-center gap-2 text-xs font-bold cursor-pointer transition-colors ${
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

          <div className="space-y-3">
            <label
              className={`min-h-11 px-3.5 py-2 rounded-xl border-2 inline-flex items-center gap-2.5 text-xs font-bold cursor-pointer transition-colors ${
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

            <fieldset className="space-y-1.5">
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
                      className={`min-h-11 px-3.5 py-2 rounded-xl border-2 font-display font-bold uppercase text-xs transition-colors cursor-pointer ${
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

          <TextField
            id={id('dietaryRestrictions')}
            label="Restrictions alimentaires"
            placeholder="Ex. végétarien, allergie aux arachides"
            value={value.dietaryRestrictions}
            onChange={(e) => set('dietaryRestrictions', e.target.value)}
            error={mergedErrors.dietaryRestrictions}
            maxLength={200}
            inputClassName="min-h-11"
          />

          <fieldset className="space-y-1" aria-describedby={mergedErrors.birthDay ? id('birthDay-error') : undefined}>
            <legend className={fieldLabelClass}>Anniversaire (jour et mois)</legend>
            <div className="grid grid-cols-2 gap-3">
              <select
                id={id('birthDay')}
                aria-label="Jour"
                aria-invalid={mergedErrors.birthDay ? true : undefined}
                value={value.birthDay}
                onChange={(e) => set('birthDay', e.target.value)}
                className={`${fieldInputClass} min-h-11`}
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
                className={`${fieldInputClass} min-h-11`}
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

      {/* CONSENTEMENTS LOI 25 */}
      {showConsentBlock && (
        <div className="space-y-2">
          {showContactBlock && mode !== 'volunteer' && (
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
          {showVolunteerBlock && volunteering && (
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
          )}
          {showContactBlock && (
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
          )}
          <p className="text-micro text-app-text-muted">
            Vos données sont conservées jusqu'à ce que vous demandiez leur retrait à l'équipe.
          </p>
        </div>
      )}

      {/* BARRE DE NAVIGATION ENTRE ÉTAPES EN MODE STEPPED */}
      {stepped && section === 'all' && (
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-app-card-border">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => {
                setLocalErrors({});
                setStep((prev) => (prev === 3 ? 2 : 1));
              }}
              className="min-h-11 px-4 py-2 rounded-xl bg-app-input border border-app-card-border text-app-text font-display font-bold uppercase text-xs cursor-pointer inline-flex items-center gap-1.5"
            >
              <ArrowLeft size={14} aria-hidden="true" />
              <span>Précédent</span>
            </button>
          ) : (
            <div />
          )}

          {!isFinalStep ? (
            <button
              type="button"
              onClick={handleNextStep}
              className="min-h-11 px-5 py-2 rounded-xl bg-primary text-secondary font-display font-black uppercase text-xs cursor-pointer inline-flex items-center gap-1.5 shadow-sm"
            >
              <span>Suivant</span>
              <ArrowRight size={14} aria-hidden="true" />
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
