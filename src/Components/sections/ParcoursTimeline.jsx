import React from 'react';
import useReveal from '../../hooks/useReveal';
import '../../Style/ParcoursTimeline.scss';

const ITEMS = [
  {
    year: '2026',
    type: 'alternance',
    title: 'Alternant dev IA · référent IA · formateur Claude Code',
    org: 'LundiMatin',
    desc:
      "Éditeur ERP/CRM omnicanal (Montpellier). J'outille les équipes sur Claude Code et j'orchestre des agents IA pour automatiser des workflows internes.",
  },
  {
    year: 'Fin 2025',
    type: 'alternance',
    title: "Début de l'alternance chez LundiMatin",
    org: 'LundiMatin',
    desc: "Passage de la reconversion à un rôle dev IA en entreprise.",
  },
  {
    year: '2025',
    type: 'projet',
    title: 'Projets React & intégrations front',
    org: 'Portfolio de reconversion',
    desc:
      'Kasa-App, Portfolio Sophie Bluel, ce portfolio — React, SCSS, accessibilité, perf.',
  },
  {
    year: 'Début 2025',
    type: 'reconversion',
    title: 'Reconversion vers le dev web',
    org: 'Auto-formation + OpenClassrooms',
    desc:
      "Bascule professionnelle vers le développement web et l'IA appliquée.",
  },
];

export default function ParcoursTimeline() {
  const ref = useReveal(0.05);

  return (
    <section id="parcours" ref={ref} className="parcours">
      <div className="parcours__inner">
        <p className="eyebrow reveal">Parcours</p>
        <h2 className="parcours__title reveal reveal-delay-1">
          Mon chemin vers le code.
        </h2>

        <ol className="parcours__list">
          <span className="parcours__line" aria-hidden="true" />

          {ITEMS.map((item, i) => (
            <li
              key={`${item.year}-${item.title}`}
              className="parcours__item reveal"
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              <span
                className={`parcours__dot parcours__dot--${item.type}`}
                aria-hidden="true"
              />
              <div className="parcours__content">
                <div className="parcours__meta">
                  <span className="parcours__year">{item.year}</span>
                  <span className="parcours__type">{item.type}</span>
                </div>
                <h3 className="parcours__item-title">{item.title}</h3>
                <p className="parcours__org">{item.org}</p>
                <p className="parcours__desc">{item.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
