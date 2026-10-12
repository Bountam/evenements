import React, { useState } from 'react';
import { EventType, EventSettings, PartnerLogo } from '../types';
import { 
  Wrench, GraduationCap, Users, Heart, Timer, 
  Terminal, Presentation, MessageSquare, Calendar, MapPin, Building, Plus, ArrowRight, Upload, Trash2
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface MatrixSelectorProps {
  onCreateEvent: (settings: Omit<EventSettings, 'id' | 'createdAt'>) => void;
  onImportEvent: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export interface MatrixDetails {
  type: EventType;
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  badgeColor: string;
}

export const MATRICES_LIST: MatrixDetails[] = [
  {
    type: 'reparothon',
    title: 'Réparothon',
    description: 'Événement communautaire de diagnostic et réparation d\'appareils pour prolonger leur durée de vie.',
    icon: Wrench,
    badgeColor: 'bg-primary/20 text-primary border border-primary/30'
  },
  {
    type: 'formation_reparothon',
    title: 'Formation Réparothon',
    description: 'Apprendre tous les aspects logistiques, promotionnels et techniques pour organiser vos propres Réparothons.',
    icon: GraduationCap,
    badgeColor: 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
  },
  {
    type: 'fresque_numerique',
    title: 'Fresque du Numérique',
    description: 'Activité collaborative et créative pour sensibiliser et former aux impacts environnementaux du numérique.',
    icon: Users,
    badgeColor: 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
  },
  {
    type: 'prolonger_vie_ordi',
    title: 'Prolonger la vie d\'un ordinateur',
    description: 'Atelier de conseils pratiques d\'entretien matériel/logiciel pour éviter de changer d\'ordinateur trop tôt.',
    icon: Heart,
    badgeColor: 'bg-red-500/20 text-red-400 border border-red-500/30'
  },
  {
    type: 'kiosque_concours',
    title: 'Kiosque-concours : Assemblage',
    description: 'Défi chronométré de démontage et remontage de PC portable, suivi d\'un tirage au sort (Raffle).',
    icon: Timer,
    badgeColor: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
  },
  {
    type: 'install_fest_linux',
    title: 'Install Fest : Linux',
    description: 'Aide à l\'installation et à la configuration du système d\'exploitation libre Linux sur les ordinateurs des visiteurs.',
    icon: Terminal,
    badgeColor: 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
  },
  {
    type: 'conference_pollution',
    title: 'Conférence : Pollution Numérique',
    description: 'Conférence instructive et débats sur la sobriété numérique et la réalité écologique de nos outils.',
    icon: Presentation,
    badgeColor: 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
  },
  {
    type: 'communaute_pratique',
    title: 'Communauté de pratique',
    description: 'Échanges et partage d\'expertise entre passionnés et acteurs de la réparation et du réemploi informatique.',
    icon: MessageSquare,
    badgeColor: 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
  }
];

export default function MatrixSelector({ onCreateEvent, onImportEvent }: MatrixSelectorProps) {
  const [selectedType, setSelectedType] = useState<EventType | null>(null);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [partner, setPartner] = useState('');
  const [place, setPlace] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [partnerLogos, setPartnerLogos] = useState<PartnerLogo[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const compressImage = (file: File, maxWidth: number, maxHeight: number, quality: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error("Impossible d'obtenir le contexte Canvas 2D"));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(dataUrl);
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  const handleAddLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newLogos: PartnerLogo[] = [...partnerLogos];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      let base64Data = '';

      if (file.size > 800 * 1024) {
        const confirmResize = confirm(
          `L'image "${file.name}" est trop volumineuse (${(file.size / 1024).toFixed(0)} Ko, max 800 Ko).\n\nVoulez-vous la redimensionner et la compresser automatiquement aux dimensions recommandées ?`
        );
        if (!confirmResize) continue;

        try {
          base64Data = await compressImage(file, 400, 200, 0.75);
        } catch (err) {
          console.error(err);
          alert(`Erreur lors de la compression de l'image "${file.name}".`);
          continue;
        }
      } else {
        try {
          base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (evt) => resolve(evt.target?.result as string);
            reader.onerror = (err) => reject(err);
            reader.readAsDataURL(file);
          });
        } catch (err) {
          console.error(err);
          alert(`Erreur lors de la lecture du fichier "${file.name}".`);
          continue;
        }
      }

      if (base64Data) {
        newLogos.push({
          id: 'logo-' + Math.random().toString(36).substring(2, 11),
          name: file.name.split('.')[0] || 'Partenaire',
          type: file.size > 800 * 1024 ? 'image/jpeg' : file.type,
          data: base64Data
        });
      }
    }

    setPartnerLogos(newLogos);
    e.target.value = '';
  };

  const handleRemoveLogo = (id: string) => {
    setPartnerLogos(prev => prev.filter(l => l.id !== id));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!selectedType) newErrors.type = 'Veuillez sélectionner un type d\'activité.';
    if (!name.trim()) newErrors.name = 'Le nom de l\'événement est requis.';
    if (!location.trim()) newErrors.location = 'La ville/emplacement est requise.';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onCreateEvent({
      name: name.trim(),
      type: selectedType!,
      date,
      location: location.trim(),
      partner: partner.trim() || undefined,
      place: place.trim() || undefined,
      extraData: {
        partnerLogos
      }
    });
  };

  const downloadImportExample = (format: 'json' | 'csv' | 'md' | 'tex' | 'xlsx') => {
    let content = '';
    let fileName = '';
    let mimeType = 'text/plain';

    if (format === 'json') {
      fileName = 'exemple_import_evenement.json';
      mimeType = 'application/json';
      content = JSON.stringify({
        event: {
          id: "evt-exemple-json",
          name: "Réparothon Démo JSON",
          type: "reparothon",
          date: "2026-07-15",
          location: "Montréal, QC",
          partner: "Insertech",
          place: "Bibliothèque Centrale",
          extraData: {
            partnerLogos: []
          }
        },
        tickets: [
          {
            id: "tkt-1",
            eventId: "evt-exemple-json",
            visitorName: "Luka Leduc",
            visitorEmail: "luka@exemple.com",
            objectName: "Dell Latitude 5490",
            objectCategory: "laptop",
            operatingSystem: "windows",
            initialDiagnosis: "Le clavier ne fonctionne pas",
            status: "repare",
            assignedTechId: "tech-1",
            assignedTechName: "Gabriel Roy",
            resultRemarks: "Clavier remplacé avec succès",
            weightKg: 1.6,
            createdAt: Date.now(),
            updatedAt: Date.now()
          }
        ],
        technicians: [
          {
            id: "tech-1",
            eventId: "evt-exemple-json",
            name: "Gabriel Roy",
            specialties: ["laptop"],
            softwareSpecialties: ["windows"],
            status: "libre",
            currentTicketId: null,
            tableNumber: "Table 3",
            createdAt: Date.now()
          }
        ]
      }, null, 2);
    } else if (format === 'csv') {
      fileName = 'exemple_import_evenement.csv';
      mimeType = 'text/csv';
      content = "Nom visiteur;Courriel visiteur;Nom de l'appareil;Catégorie;Système d'exploitation;Diagnostic;Technicien;Table Technicien;Statut;Remarques de résolution;Poids (kg)\nLuka Leduc;luka@exemple.com;Dell Latitude 5490;laptop;windows;Le clavier ne fonctionne pas;Gabriel Roy;Table 3;repare;Clavier remplacé avec succès;1.6\nSophie Côté;;Samsung S20;cellulaire;aucun;Écran fissuré;;;en_attente;;0.2";
    } else if (format === 'md') {
      fileName = 'exemple_import_evenement.md';
      mimeType = 'text/markdown';
      content = `# Réparothon Démo Markdown\n**Date :** 2026-07-15\n**Lieu :** Montréal, QC\n**Type :** reparothon\n**Partenaire :** Insertech\n**Lieu spécifique :** Bibliothèque Centrale\n\n| Nom visiteur | Courriel visiteur | Nom de l'appareil | Catégorie | Système d'exploitation | Diagnostic | Technicien | Table Technicien | Statut | Remarques de résolution | Poids (kg) |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n| Luka Leduc | luka@exemple.com | Dell Latitude 5490 | laptop | windows | Le clavier ne fonctionne pas | Gabriel Roy | Table 3 | repare | Clavier remplacé avec succès | 1.6 |\n| Sophie Côté | | Samsung S20 | cellulaire | aucun | Écran fissuré | | | en_attente | | 0.2 |\n`;
    } else if (format === 'tex') {
      fileName = 'exemple_import_evenement.tex';
      mimeType = 'application/x-tex';
      content = `\\documentclass{article}\n\\begin{document}\n\\title{Réparothon Démo LaTeX}\n\\date{2026-07-15}\n\\section{Lieu : Montréal, QC, Lieu spécifique : Bibliothèque Centrale, Partenaire : Insertech}\n\n\\subsection{Liste des diagnostics}\n\\begin{tabular}{l l l l l l l l l l l}\nLuka Leduc & luka@exemple.com & Dell Latitude 5490 & laptop & windows & Le clavier ne fonctionne pas & Gabriel Roy & Table 3 & repare & Clavier remplacé avec succès & 1.6 \\\\\nSophie Côté & & Samsung S20 & cellulaire & aucun & Écran fissuré & & & en_attente & & 0.2 \\\\\n\\end{tabular}\n\\end{document}\n`;
    } else if (format === 'xlsx') {
      try {
        const ws_data = [
          ["Nom visiteur", "Courriel visiteur", "Nom de l'appareil", "Catégorie", "Système d'exploitation", "Diagnostic", "Technicien", "Table Technicien", "Statut", "Remarques de résolution", "Poids (kg)"],
          ["Luka Leduc", "luka@exemple.com", "Dell Latitude 5490", "laptop", "windows", "Le clavier ne fonctionne pas", "Gabriel Roy", "Table 3", "repare", "Clavier remplacé avec succès", 1.6],
          ["Sophie Côté", "", "Samsung S20", "cellulaire", "aucun", "Écran fissuré", "", "", "en_attente", "", 0.2]
        ];
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(ws_data);
        XLSX.utils.book_append_sheet(wb, ws, "Diagnostics");
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'binary' });
        
        const s2ab = (s: string) => {
          const buf = new ArrayBuffer(s.length);
          const view = new Uint8Array(buf);
          for (let i = 0; i < s.length; i++) view[i] = s.charCodeAt(i) & 0xFF;
          return buf;
        };

        const blob = new Blob([s2ab(wbout)], { type: "application/octet-stream" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'exemple_import_evenement.xlsx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
      } catch (err) {
        console.error(err);
        alert("Erreur lors de la génération de l'exemple Excel.");
        return;
      }
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const activeMatrix = MATRICES_LIST.find(m => m.type === selectedType);

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="text-center mb-10 space-y-4">
        <div className="w-16 h-16 bg-[#9ecd33] rounded-2xl flex items-center justify-center rotate-6 shadow-lg shrink-0 mx-auto mb-2">
          <span className="text-[#480A94] font-black text-3xl font-display">I</span>
        </div>
        <h1 className="text-4xl font-display font-bold text-white uppercase tracking-wider">
          Nouvel Événement Insertech
        </h1>
        <p className="text-slate-400 mt-2 font-sans max-w-xl mx-auto">
          Initialisez une nouvelle activité hors-ligne. Sélectionnez la matrice correspondante pour adapter les formulaires et les statistiques.
        </p>
      </div>


      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Choix de la matrice */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-display text-white uppercase tracking-wide flex items-center gap-2">
              <span>1. Choisir le type de matrice d'activité</span>
              {selectedType && (
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase ${activeMatrix?.badgeColor}`}>
                  {activeMatrix?.title}
                </span>
              )}
            </h2>
            {errors.type && <span className="text-red-400 text-xs font-semibold">{errors.type}</span>}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {MATRICES_LIST.map((matrix) => {
              const Icon = matrix.icon;
              const isSelected = selectedType === matrix.type;
              return (
                <button
                  key={matrix.type}
                  type="button"
                  onClick={() => {
                    setSelectedType(matrix.type);
                    setErrors(prev => ({ ...prev, type: '' }));
                    if (!name) {
                      setName(`${matrix.title} - ${new Date().toLocaleDateString('fr-CA', { month: 'short', year: 'numeric' })}`);
                    }
                  }}
                  className={`flex items-start gap-4 p-5 rounded-2xl text-left transition-all duration-300 ${
                    isSelected 
                      ? 'bg-secondary/40 border-2 border-primary shadow-lg shadow-primary/10' 
                      : 'bg-[#24123d]/60 border border-purple-900/40 hover:border-purple-600/40 hover:bg-[#2c174a]/60'
                  }`}
                >
                  <div className={`p-3 rounded-xl shrink-0 ${isSelected ? 'bg-primary text-secondary' : 'bg-purple-950 text-primary'}`}>
                    <Icon size={22} />
                  </div>
                  <div>
                    <h3 className="font-bold text-white font-display text-base leading-tight mb-1">{matrix.title}</h3>
                    <p className="text-xs text-slate-400 leading-normal line-clamp-2 font-sans">{matrix.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Détails logistiques / Importation */}
        <div className="bg-[#24123d]/40 border border-purple-950 p-6 rounded-2xl space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-purple-950/60 pb-4">
            <h2 className="text-xl font-display text-white uppercase tracking-wide">
              2. Importer ou créer un nouvel événement
            </h2>

            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <div className="flex gap-2">
                <label 
                  htmlFor="eventImportSelector"
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#180A2b]/60 border border-purple-900/60 text-slate-300 hover:text-white hover:bg-purple-950/30 text-xs font-bold cursor-pointer transition shrink-0"
                >
                  <Upload size={14} className="text-primary" />
                  <span>Importer un événement</span>
                </label>
                <input
                  id="eventImportSelector"
                  type="file"
                  accept=".json,.csv,.md,.tex,.latex,.xlsx,.xls"
                  onChange={onImportEvent}
                  className="hidden"
                />
              </div>
              <div className="flex flex-wrap gap-1.5 justify-end">
                <span className="text-[9px] text-slate-500 self-center mr-1">Gabarits :</span>
                {(['json', 'csv', 'md', 'tex', 'xlsx'] as const).map(fmt => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => downloadImportExample(fmt)}
                    className="px-2 py-0.5 rounded bg-[#180A2b]/60 border border-purple-950 text-[9px] text-slate-400 hover:text-primary transition uppercase font-mono font-bold cursor-pointer"
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label htmlFor="eventName" className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                Nom de l'événement <span className="text-primary">*</span>
              </label>
              <input
                id="eventName"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setErrors(prev => ({ ...prev, name: '' }));
                }}
                placeholder="Ex. Réparothon UQAM Printemps"
                className="w-full bg-[#180A2b]/80 border border-purple-900/60 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-primary transition"
              />
              {errors.name && <span className="text-red-400 text-xs font-semibold block">{errors.name}</span>}
            </div>

            <div className="space-y-2">
              <label htmlFor="eventDate" className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                Date de l'activité <span className="text-primary">*</span>
              </label>
              <div className="relative">
                <input
                  id="eventDate"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-[#180A2b]/80 border border-purple-900/60 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-primary transition"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="eventLocation" className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                Ville / Municipalité <span className="text-primary">*</span>
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3.5 text-slate-500" size={16} />
                <input
                  id="eventLocation"
                  type="text"
                  value={location}
                  onChange={(e) => {
                    setLocation(e.target.value);
                    setErrors(prev => ({ ...prev, location: '' }));
                  }}
                  placeholder="Ex. Montréal, QC"
                  className="w-full bg-[#180A2b]/80 border border-purple-900/60 rounded-xl pl-10 pr-4 py-3 text-white text-sm focus:outline-none focus:border-primary transition"
                />
              </div>
              {errors.location && <span className="text-red-400 text-xs font-semibold block">{errors.location}</span>}
            </div>

            <div className="space-y-2">
              <label htmlFor="eventPlace" className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                Lieu spécifique
              </label>
              <div className="relative">
                <Building className="absolute left-3 top-3.5 text-slate-500" size={16} />
                <input
                  id="eventPlace"
                  type="text"
                  value={place}
                  onChange={(e) => setPlace(e.target.value)}
                  placeholder="Ex. Bibliothèque centrale, local A-100"
                  className="w-full bg-[#180A2b]/80 border border-purple-900/60 rounded-xl pl-10 pr-4 py-3 text-white text-sm focus:outline-none focus:border-primary transition"
                />
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <label htmlFor="eventPartner" className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                Partenaire coorganisateur / Client
              </label>
              <div className="relative">
                <Building className="absolute left-3 top-3.5 text-slate-500" size={16} />
                <input
                  id="eventPartner"
                  type="text"
                  value={partner}
                  onChange={(e) => setPartner(e.target.value)}
                  placeholder="Ex. Cégep du Vieux Montréal, Ville de Longueuil"
                  className="w-full bg-[#180A2b]/80 border border-purple-900/60 rounded-xl pl-10 pr-4 py-3 text-white text-sm focus:outline-none focus:border-primary transition"
                />
              </div>
            </div>

            <div className="space-y-3 md:col-span-2 border-t border-purple-950/60 pt-4 mt-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                Logos des Partenaires Coorganisateurs
              </span>
              
              <div className="flex flex-col sm:flex-row gap-4 items-start">
                <label 
                  htmlFor="partnerLogosSelector"
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#180A2b]/60 border border-purple-900/60 text-slate-300 hover:text-white hover:bg-[#180A2b] text-xs font-bold cursor-pointer transition shrink-0"
                >
                  <Plus size={14} className="text-primary" />
                  <span>Ajouter des logos (multiple)</span>
                </label>
                <input
                  id="partnerLogosSelector"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleAddLogo}
                  className="hidden"
                />

                {partnerLogos.length > 0 && (
                  <div className="flex-grow grid grid-cols-2 sm:grid-cols-4 gap-3 w-full">
                    {partnerLogos.map((logo) => (
                      <div key={logo.id} className="relative group rounded-xl overflow-hidden border border-purple-950 bg-[#180A2b]/60 aspect-video flex items-center justify-center p-1.5">
                        <img src={logo.data} alt={logo.name} className="max-h-full max-w-full object-contain" />
                        <button 
                          type="button"
                          onClick={() => handleRemoveLogo(logo.id)}
                          className="absolute inset-0 bg-red-950/80 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition cursor-pointer"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Bouton de soumission */}
        <div className="flex justify-end pt-4">
          <button
            type="submit"
            className="flex items-center gap-2 px-6 py-4 rounded-xl bg-primary text-secondary font-bold font-display uppercase tracking-wider shadow-lg shadow-primary/10 hover:shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition cursor-pointer"
          >
            <span>Créer l'activité</span>
            <ArrowRight size={18} />
          </button>
        </div>
      </form>
    </div>
  );
}
