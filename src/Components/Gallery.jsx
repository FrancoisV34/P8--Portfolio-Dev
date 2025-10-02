import '../Style/Gallery.scss';
import projects from '../Data/Projects.json';

export default function Gallerie() {
  return (
    <>
      {projects.map((project) => (
        <article>
          <div className="project-preview">
            <img src={project.image} alt={project.imageAlt}></img>
          </div>
        </article>
      ))}
    </>
  );
}
