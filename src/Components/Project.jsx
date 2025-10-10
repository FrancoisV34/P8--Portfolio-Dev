import '../Style/Project.scss';
import '../Style/ProjectButton.scss';
import projects from '../Data/Projects.json';

export default function Project() {
  return (
    <>
      {projects.map((project, index) => (
        <article
          style={{ '--backgroundColor': project.bgColor }}
          key={project.id}
          className={`article-display ${
            index % 2 === 0 ? 'row-reverse' : 'row'
          }`}
        >
          <div className="project-preview">
            <img
              src={`${process.env.PUBLIC_URL}${project.image}`}
              alt={project.imageAlt}
              className={`cap-ecran-projet ${
                index % 2 === 0 ? 'left-radius' : 'right-radius'
              }`}
            />
          </div>
          <div className="project-description">
            <div className="title-and-link">
              <h3 className="project-title">
                {project.title}{' '}
                <a
                  href={project.link}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <i
                    className="project-link-icon"
                    style={{ '--color': project.bgColor }}
                  ></i>
                </a>
              </h3>
            </div>
            <p>{project.description}</p>

            <div className="technos">
              {project.technos.map((techno, index) => (
                <div className={techno.name} key={index}>
                  <img
                    key={index}
                    src={techno.icon}
                    alt={techno.name}
                    className={techno.name}
                  />
                  <span>{techno.name}</span>
                </div>
              ))}
            </div>
          </div>
        </article>
      ))}
    </>
  );
}
