import React, { useState } from 'react';
import { HandHeart } from 'lucide-react';
import type { EventSettings, GenericAttendee } from '../../types';
import { db } from '../../db';
import { networkManager } from '../../network';
import Button from './Button';
import Modal from './Modal';
import ContactForm from './ContactForm';
import { showToast } from './Toast';
import {
  ContactErrors,
  buildContactInfo,
  emptyContactDraft,
  firstContactError,
  fullName,
  validateContact
} from '../../utils/contact';

// Activité qui reçoit les fiches remplies depuis le menu principal, hors de toute activité
export const VOLUNTEER_REGISTRY_ID = 'registre-benevoles';

async function ensureVolunteerRegistry(): Promise<string> {
  const existing = await db.events.get(VOLUNTEER_REGISTRY_ID);
  if (!existing) {
    const registry: EventSettings = {
      id: VOLUNTEER_REGISTRY_ID,
      name: 'Registre des bénévoles',
      type: 'communaute_pratique',
      date: new Date().toISOString().slice(0, 10),
      location: '',
      extraData: { volunteerRegistry: true },
      createdAt: Date.now()
    };
    await networkManager.writeToDatabase('events', 'put', registry);
  }
  return VOLUNTEER_REGISTRY_ID;
}

interface VolunteerSurveyButtonProps {
  eventId?: string | null; // activité ouverte ; sans activité, la fiche va au registre des bénévoles
  className?: string;
}

// Bouton permanent « Devenir bénévole » : sondage complet à partir de zéro, enchaînable d'une personne à l'autre
export default function VolunteerSurveyButton({ eventId, className = '' }: VolunteerSurveyButtonProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => emptyContactDraft('volunteer'));
  const [errors, setErrors] = useState<ContactErrors>({});
  const [saving, setSaving] = useState(false);

  const close = () => {
    setOpen(false);
    setErrors({});
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const found = validateContact(draft, 'volunteer');
    setErrors(found);
    const firstError = firstContactError(found);
    if (firstError) {
      document.getElementById(`vol-${firstError === 'contact' ? 'email' : firstError}`)?.focus();
      return;
    }
    setSaving(true);
    try {
      const now = Date.now();
      const contact = buildContactInfo(draft, 'volunteer', 'sondage_benevole', now);
      const record: GenericAttendee = {
        id: 'v-' + Math.random().toString(36).substring(2, 11),
        eventId: eventId || (await ensureVolunteerRegistry()),
        name: fullName(contact),
        email: contact.email || undefined,
        presenceConfirmed: false,
        registeredAt: now,
        extraData: { contact, source: 'sondage_benevole' }
      };
      await networkManager.writeToDatabase('attendees', 'put', record);
      showToast('Merci ! Fiche bénévole enregistrée.', 'success');
      setDraft(emptyContactDraft('volunteer'));
      setErrors({});
      document.getElementById('vol-firstName')?.focus();
    } catch (err) {
      console.error('Erreur enregistrement fiche bénévole :', err);
      showToast("Impossible d'enregistrer la fiche bénévole.", 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} aria-label="Devenir bénévole" title="Remplir une fiche bénévole" className={className}>
        <HandHeart size={14} className="text-primary" aria-hidden="true" />
        <span className="hidden md:inline">Devenir bénévole</span>
      </Button>
      <Modal
        isOpen={open}
        onClose={close}
        title="Devenir bénévole"
        icon={HandHeart}
        maxWidth="max-w-2xl"
        id="volunteer-survey-title"
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={close}>Annuler</Button>
            <Button variant="primary" type="submit" form="volunteer-survey-form" disabled={saving}>
              Enregistrer
            </Button>
          </div>
        }
      >
        <form id="volunteer-survey-form" onSubmit={save} noValidate>
          <ContactForm
            idPrefix="vol"
            mode="volunteer"
            value={draft}
            onChange={(next) => {
              setDraft(next);
              setErrors({});
            }}
            errors={errors}
          />
        </form>
      </Modal>
    </>
  );
}
