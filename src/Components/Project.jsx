import '../Style/Project.scss';
import '../Style/ProjectButton.scss';
import projects from '../Data/Projects.json';
import Button from './Button';

export default function Project() {
  return (
    <>
      {projects.map((project) => (
        <article
          style={{ '--backgroundColor': project.bgColor }}
          key={project.id}
        >
          <div className="up">
            <i className="kasa-app" style={{ '--color': project.bgColor }}></i>
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
                  <span style={{ color: project.fontColor }}>
                    {techno.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="down" style={{ '--fontColor': project.fontColor }}>
            <h2 className="title">{project.title}</h2>
            <Button project={project} />
          </div>
        </article>
      ))}
    </>
  );
}
