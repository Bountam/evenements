import React from 'react';
import { HandHeart } from 'lucide-react';
import type { ContactMode, TechSkill, TshirtSize, VolunteerRole } from '../../types';
import TextField, { fieldInputClass, fieldLabelClass } from './TextField';
import {
  ContactDraft,
  ContactErrors,
  MONTHS,
  PRONOUN_OPTIONS,
  TECH_SKILLS,
  TSHIRT_SIZES,
  VOLUNTEER_ROLES,
  needsActivityConsent
} from '../../utils/contact';

export type ContactFormSection = 'all' | 'coordinates' | 'volunteer';

interface ContactFormProps {
  idPrefix: string;
  mode: ContactMode;
  section?: ContactFormSection;
  value: ContactDraft;
  onChange: (next: ContactDraft) => void;
  errors?: ContactErrors;
}

const errorClass = 'text-xs font-bold text-danger';
const consentRowClass =
  'min-h-11 px-3.5 py-2.5 rounded-xl border border-app-card-border bg-app-input/60 flex items-start gap-2.5 text-xs text-app-text cursor-pointer hover:border-primary/50 transition-colors';

// Formulaire de contact commun à toutes les activités : coordonnées, bénévolat et consentements (Loi 25).
// Composant contrôlé : le parent garde le brouillon, valide et enregistre.
export default function ContactForm({
  idPrefix,
  mode,
  section = 'all',
  value,
  onChange,
  errors = {}
}: ContactFormProps) {
  const set = <K extends keyof ContactDraft>(key: K, v: ContactDraft[K]) => onChange({ ...value, [key]: v });
  const toggle = <T extends string>(list: T[], item: T): T[] =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
  const id = (field: string) => `${idPrefix}-${field}`;
  const volunteering = mode === 'volunteer' || value.wantsToVolunteer;
  const activityRequired = needsActivityConsent(value, mode);
  const showCoordinates = section !== 'volunteer';
  const showVolunteerSection = section === 'volunteer' || (section === 'all' && volunteering);

  const errorText = (key: keyof ContactErrors) =>
    errors[key] ? (
      <p id={id(`${key}-error`)} role="alert" className={errorClass}>
        {errors[key]}
      </p>
    ) : null;

  return (
    <div className="space-y-3.5">
      {showCoordinates && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TextField
              id={id('firstName')}
              label="Prénom *"
              autoComplete="given-name"
              value={value.firstName}
              onChange={(e) => set('firstName', e.target.value)}
              error={errors.firstName}
              maxLength={60}
              inputClassName="min-h-11"
            />
            <TextField
              id={id('lastName')}
              label="Nom *"
              autoComplete="family-name"
              value={value.lastName}
              onChange={(e) => set('lastName', e.target.value)}
              error={errors.lastName}
              maxLength={60}
              inputClassName="min-h-11"
            />
          </div>

          <fieldset className="space-y-1.5">
            <legend className={fieldLabelClass}>Pronoms (optionnel)</legend>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PRONOUN_OPTIONS.map((option) => {
                const selected = value.pronouns === option;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      const nextPronouns = selected ? '' : option;
                      onChange({
                        ...value,
                        pronouns: nextPronouns,
                        pronounsCustom: nextPronouns === 'Autre' ? value.pronounsCustom : ''
                      });
                    }}
                    className={`min-h-11 px-3 py-2 rounded-xl border-2 text-xs font-bold transition-colors cursor-pointer ${
                      selected
                        ? 'bg-primary text-secondary border-primary font-black'
                        : 'bg-app-input border-app-card-border text-app-text hover:border-primary/60'
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
                  error={errors.pronounsCustom}
                  maxLength={40}
                  inputClassName="min-h-11"
                />
              </div>
            )}
          </fieldset>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TextField
              id={id('phone')}
              label="Téléphone"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="514 555-1234"
              value={value.phone}
              onChange={(e) => set('phone', e.target.value)}
              error={errors.phone}
              inputClassName="min-h-11"
            />
            <div className="space-y-0.5">
              <TextField
                id={id('email')}
                label="Courriel"
                type="email"
                autoComplete="email"
                placeholder="nom@exemple.com"
                value={value.email}
                onChange={(e) => set('email', e.target.value)}
                error={errors.email}
                inputClassName="min-h-11"
                aria-describedby={
                  [errors.email && id('email-error'), errors.contact && id('contact-error')]
                    .filter(Boolean)
                    .join(' ') || undefined
                }
              />
              {errorText('contact')}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <TextField
              id={id('postalCode')}
              label="Code postal"
              autoComplete="postal-code"
              placeholder="H2W 1Y4"
              value={value.postalCode}
              onChange={(e) => set('postalCode', e.target.value)}
              error={errors.postalCode}
              inputClassName="min-h-11"
            />
            <label
              className={`min-h-11 px-3.5 py-2 rounded-xl border-2 flex items-center gap-2.5 text-xs font-bold cursor-pointer transition-colors ${
                value.outsideCanada
                  ? 'bg-primary text-secondary border-primary font-black'
                  : 'bg-app-input border-app-card-border text-app-text hover:border-primary/60'
              }`}
            >
              <input
                id={id('outsideCanada')}
                type="checkbox"
                checked={value.outsideCanada}
                onChange={(e) => set('outsideCanada', e.target.checked)}
                className={`w-4 h-4 shrink-0 ${value.outsideCanada ? 'accent-secondary' : 'accent-primary'}`}
              />
              <span>Hors Canada</span>
            </label>
          </div>

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
        </>
      )}

      {showVolunteerSection && (
        <div
          className={
            section === 'all'
              ? 'space-y-3.5 rounded-2xl border border-app-card-border bg-app-input/40 p-3.5'
              : 'space-y-4'
          }
        >
          <fieldset className="space-y-2" aria-describedby={errors.roles ? id('roles-error') : undefined}>
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
            error={errors.dietaryRestrictions}
            maxLength={200}
            inputClassName="min-h-11"
          />

          <fieldset className="space-y-1" aria-describedby={errors.birthDay ? id('birthDay-error') : undefined}>
            <legend className={fieldLabelClass}>Anniversaire (jour et mois)</legend>
            <div className="grid grid-cols-2 gap-3">
              <select
                id={id('birthDay')}
                aria-label="Jour"
                aria-invalid={errors.birthDay ? true : undefined}
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
                aria-invalid={errors.birthDay ? true : undefined}
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

      <div className="space-y-2">
        {showCoordinates && mode !== 'volunteer' && (
          <div className="space-y-1">
            <label className={consentRowClass}>
              <input
                id={id('consentActivity')}
                type="checkbox"
                checked={value.consentActivity}
                onChange={(e) => set('consentActivity', e.target.checked)}
                aria-invalid={errors.consentActivity ? true : undefined}
                aria-describedby={errors.consentActivity ? id('consentActivity-error') : undefined}
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
        {showVolunteerSection && volunteering && (
          <div className="space-y-1">
            <label className={consentRowClass}>
              <input
                id={id('consentVolunteer')}
                type="checkbox"
                checked={value.consentVolunteer}
                onChange={(e) => set('consentVolunteer', e.target.checked)}
                aria-invalid={errors.consentVolunteer ? true : undefined}
                aria-describedby={errors.consentVolunteer ? id('consentVolunteer-error') : undefined}
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
        {showCoordinates && (
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
    </div>
  );
}
