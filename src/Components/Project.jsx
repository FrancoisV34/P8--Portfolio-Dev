import '../Style/Project.scss';
import projects from '../Data/Projects.json';

export default function Project() {
  return (
    <>
      {projects.map((project) => (
        <article>
          <div className="up">
            <i className="kasa-app"></i>
            <img
              src={project.image}
              alt={project.imageAlt}
              className="cap-ecran-projet"
            />
            <div className="technos">
              {project.technos.map((techno, index) => (
                <div className={techno.name} key={index}>
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
                  <span>{techno.name}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="down">
            Ici seront présents 1 menu déroulant avec la descritpion du projet +
            1 menu lisatnt les compétences utilisées pour la réalisation du
            projet.
          </div>
        </article>
      ))}
    </>
  );
}
