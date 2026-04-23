import React from 'react';
import useReveal from '../../hooks/useReveal';
import '../../Style/ProjectSection.scss';

export default function ProjectSection({ project, index, id }) {
  const ref = useReveal(0.1);
  const isEven = index % 2 === 0;
  const theme = isEven ? 'light' : 'dark';
  const technoNames = (project.technos || []).map((t) =>
    typeof t === 'string' ? t : t.name,
  );

  const imageUrl = project.image
    ? `${process.env.PUBLIC_URL}${project.image}`
    : null;

  return (
    <section
      id={id}
      ref={ref}
      className={`project-section project-section--${theme}`}
      data-flow={isEven ? 'ltr' : 'rtl'}
    >
      <div className="project-section__grid">
        <div className="project-section__media reveal">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={project.imageAlt || project.title}
              className="project-section__image"
              loading="lazy"
            />
          ) : (
            <div className="project-section__placeholder">
              <div className="project-section__stripes" aria-hidden="true" />
              <div className="project-section__placeholder-label">
                <span className="project-section__placeholder-mark">⬡</span>
                screenshot {project.title}
              </div>
            </div>
          )}
        </div>

        <div className="project-section__body reveal reveal-delay-1">
          <span className="chip">
            Projet {String(index + 1).padStart(2, '0')}
          </span>

          <h2 className="project-section__title">{project.title}</h2>

          <p className="project-section__desc">{project.description}</p>

          {technoNames.length > 0 && (
            <ul className="project-section__technos">
              {technoNames.map((name) => (
                <li key={name} className="techno-chip">
                  {name}
                </li>
              ))}
            </ul>
          )}

          {project.link && (
            <a
              href={project.link}
              target="_blank"
              rel="noopener noreferrer"
              className="project-section__cta"
            >
              Voir sur GitHub
              <svg
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M7 17L17 7M17 7H7M17 7v10" />
              </svg>
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
