import React from 'react';
import type { ContactMode, TechSkill, TshirtSize, VolunteerRole } from '../../types';
import TextField, { fieldInputClass, fieldLabelClass } from './TextField';
import {
  ContactDraft,
  ContactErrors,
  MONTHS,
  TECH_SKILLS,
  TSHIRT_SIZES,
  VOLUNTEER_ROLES,
  needsActivityConsent
} from '../../utils/contact';

interface ContactFormProps {
  idPrefix: string;
  mode: ContactMode;
  value: ContactDraft;
  onChange: (next: ContactDraft) => void;
  errors?: ContactErrors;
}

const checkboxRowClass = 'flex items-start gap-2 text-xs text-app-text cursor-pointer';
const errorClass = 'text-xs font-bold text-danger';

// Formulaire de contact commun à toutes les activités : coordonnées, bénévolat et consentements (Loi 25).
// Composant contrôlé : le parent garde le brouillon, valide et enregistre.
export default function ContactForm({ idPrefix, mode, value, onChange, errors = {} }: ContactFormProps) {
  const set = <K extends keyof ContactDraft>(key: K, v: ContactDraft[K]) => onChange({ ...value, [key]: v });
  const toggle = <T extends string>(list: T[], item: T): T[] => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  const id = (field: string) => `${idPrefix}-${field}`;
  const volunteering = mode === 'volunteer' || value.wantsToVolunteer;
  const activityRequired = needsActivityConsent(value, mode);

  const errorText = (key: keyof ContactErrors) =>
    errors[key] ? (
      <p id={id(`${key}-error`)} role="alert" className={errorClass}>
        {errors[key]}
      </p>
    ) : null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <TextField
          id={id('firstName')}
          label="Prénom *"
          autoComplete="given-name"
          value={value.firstName}
          onChange={(e) => set('firstName', e.target.value)}
          error={errors.firstName}
          maxLength={60}
        />
        <TextField
          id={id('lastName')}
          label="Nom *"
          autoComplete="family-name"
          value={value.lastName}
          onChange={(e) => set('lastName', e.target.value)}
          error={errors.lastName}
          maxLength={60}
        />
      </div>

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
            aria-describedby={[errors.email && id('email-error'), errors.contact && id('contact-error')].filter(Boolean).join(' ') || undefined}
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
        />
        <label className={`${checkboxRowClass} min-h-9 items-center`}>
          <input
            id={id('outsideCanada')}
            type="checkbox"
            checked={value.outsideCanada}
            onChange={(e) => set('outsideCanada', e.target.checked)}
            className="accent-primary"
          />
          <span>Hors Canada</span>
        </label>
      </div>

      {mode !== 'volunteer' && (
        <label className={`${checkboxRowClass} font-bold`}>
          <input
            id={id('wantsToVolunteer')}
            type="checkbox"
            checked={value.wantsToVolunteer}
            onChange={(e) => set('wantsToVolunteer', e.target.checked)}
            className="mt-0.5 accent-primary"
          />
          <span>Je souhaite donner des heures de bénévolat</span>
        </label>
      )}

      {volunteering && (
        <div className="space-y-3 rounded-xl border border-app-card-border p-3">
          <fieldset className="space-y-1" aria-describedby={errors.roles ? id('roles-error') : undefined}>
            <legend className={fieldLabelClass}>Comment aimeriez-vous aider ? *</legend>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1">
              {VOLUNTEER_ROLES.map((role) => (
                <label key={role.id} className={checkboxRowClass}>
                  <input
                    id={id(`role-${role.id}`)}
                    type="checkbox"
                    checked={value.roles.includes(role.id)}
                    onChange={() => set('roles', toggle<VolunteerRole>(value.roles, role.id))}
                    className="mt-0.5 accent-primary"
                  />
                  <span>{role.label}</span>
                </label>
              ))}
            </div>
            {errorText('roles')}
          </fieldset>

          {value.roles.includes('technique') && (
            <fieldset className="space-y-1">
              <legend className={fieldLabelClass}>Vos compétences techniques</legend>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1">
                {TECH_SKILLS.map((skill) => (
                  <label key={skill.id} className={checkboxRowClass}>
                    <input
                      id={id(`skill-${skill.id}`)}
                      type="checkbox"
                      checked={value.techSkills.includes(skill.id)}
                      onChange={() => set('techSkills', toggle<TechSkill>(value.techSkills, skill.id))}
                      className="mt-0.5 accent-primary"
                    />
                    <span>{skill.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <label className={`${checkboxRowClass} min-h-9 items-center`}>
              <input
                id={id('hasVehicle')}
                type="checkbox"
                checked={value.hasVehicle}
                onChange={(e) => set('hasVehicle', e.target.checked)}
                className="accent-primary"
              />
              <span>J'ai un véhicule</span>
            </label>
            <div className="space-y-0.5">
              <label htmlFor={id('tshirtSize')} className={fieldLabelClass}>Taille de t-shirt</label>
              <select
                id={id('tshirtSize')}
                value={value.tshirtSize}
                onChange={(e) => set('tshirtSize', e.target.value as TshirtSize)}
                className={`${fieldInputClass} min-h-9`}
              >
                <option value="">Non précisée</option>
                {TSHIRT_SIZES.map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </div>
          </div>

          <TextField
            id={id('dietaryRestrictions')}
            label="Restrictions alimentaires"
            placeholder="Ex. végétarien, allergie aux arachides"
            value={value.dietaryRestrictions}
            onChange={(e) => set('dietaryRestrictions', e.target.value)}
            error={errors.dietaryRestrictions}
            maxLength={200}
          />

          <fieldset className="space-y-0.5" aria-describedby={errors.birthDay ? id('birthDay-error') : undefined}>
            <legend className={fieldLabelClass}>Anniversaire (jour et mois)</legend>
            <div className="grid grid-cols-2 gap-3">
              <select
                id={id('birthDay')}
                aria-label="Jour"
                aria-invalid={errors.birthDay ? true : undefined}
                value={value.birthDay}
                onChange={(e) => set('birthDay', e.target.value)}
                className={`${fieldInputClass} min-h-9`}
              >
                <option value="">Jour</option>
                {Array.from({ length: 31 }, (_, i) => (
                  <option key={i + 1} value={String(i + 1)}>{i + 1}</option>
                ))}
              </select>
              <select
                id={id('birthMonth')}
                aria-label="Mois"
                aria-invalid={errors.birthDay ? true : undefined}
                value={value.birthMonth}
                onChange={(e) => set('birthMonth', e.target.value)}
                className={`${fieldInputClass} min-h-9`}
              >
                <option value="">Mois</option>
                {MONTHS.map((month, i) => (
                  <option key={month} value={String(i + 1)}>{month}</option>
                ))}
              </select>
            </div>
            {errorText('birthDay')}
          </fieldset>
        </div>
      )}

      <div className="space-y-1.5">
        {mode !== 'volunteer' && (
          <div>
            <label className={checkboxRowClass}>
              <input
                id={id('consentActivity')}
                type="checkbox"
                checked={value.consentActivity}
                onChange={(e) => set('consentActivity', e.target.checked)}
                aria-invalid={errors.consentActivity ? true : undefined}
                aria-describedby={errors.consentActivity ? id('consentActivity-error') : undefined}
                className="mt-0.5 accent-primary"
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
        {volunteering && (
          <div>
            <label className={checkboxRowClass}>
              <input
                id={id('consentVolunteer')}
                type="checkbox"
                checked={value.consentVolunteer}
                onChange={(e) => set('consentVolunteer', e.target.checked)}
                aria-invalid={errors.consentVolunteer ? true : undefined}
                aria-describedby={errors.consentVolunteer ? id('consentVolunteer-error') : undefined}
                className="mt-0.5 accent-primary"
              />
              <span>J'accepte qu'on me contacte pour du bénévolat et qu'on conserve mes réponses jusqu'à ce que je demande leur retrait. *</span>
            </label>
            {errorText('consentVolunteer')}
          </div>
        )}
        <label className={checkboxRowClass}>
          <input
            id={id('consentNewsletter')}
            type="checkbox"
            checked={value.consentNewsletter}
            onChange={(e) => set('consentNewsletter', e.target.checked)}
            className="mt-0.5 accent-primary"
          />
          <span>Je veux recevoir l'infolettre.</span>
        </label>
        <p className="text-micro text-app-text-muted">
          Vos données sont conservées jusqu'à ce que vous demandiez leur retrait à l'équipe.
        </p>
      </div>
    </div>
  );
}
