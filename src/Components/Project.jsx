import '../Style/Project.scss';
import projects from '../Data/Projects.json';

export default function Project() {
  return (
    <>
      {projects.map((project) => (
        <article
          style={{ '--backgroundColor': project.bgColor }}
          key={project.id}
        >
          <div className="up">
            <i className="kasa-app" style={{ color: project.fontColor }}></i>
            <img
              src={project.image}
              alt={project.imageAlt}
              className="cap-ecran-projet"
            />
            <div className="technos">
              {project.technos.map((techno, index) => (
                <div
                  className={techno.name}
                  key={index}
                  style={{ border: '1px solid var(--backgroundColor)' }}
                >
                  <img
                    key={index}
                    src={techno.icon}
                    alt={techno.name}
                    className={techno.name}
                  />
                  <div
                    className="competence-level"
                    style={{
                      border: `3px solid ${techno.color}`,
                    }}
                  >
                    <div
                      className="level"
                      style={{
                        width: `${techno.level}%`,
                        backgroundColor: `${techno.color}`,
                      }}
                    ></div>
                  </div>
                  <span style={{ color: project.fontColor }}>
                    {techno.name} : {techno.level}%
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="down" style={{ '--fontColor': project.fontColor }}>
            <button className="button-description">
              {project.description} <i className="fleche"></i>
            </button>
            Ici seront présents 1 menu déroulant avec la descritpion du projet +
            1 menu lisatnt les compétences utilisées pour la réalisation du
            projet.
          </div>
        </article>
      ))}
    </>
  );
}
