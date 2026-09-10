import projects from '../Data/Projects.json';
import Hero from '../Components/sections/Hero';
import ProjectSection from '../Components/sections/ProjectSection';
import SkillsBento from '../Components/sections/SkillsBento';
import ParcoursTimeline from '../Components/sections/ParcoursTimeline';
import Contact from '../Components/sections/Contact';
import type { Route } from './+types/home';
import { siteOrigin } from '../lib/site.server';
import { publicMeta } from '../lib/public-meta';

export const loader = () => ({ origin: siteOrigin() });
export const meta = ({ loaderData }: Route.MetaArgs) => publicMeta(
  loaderData?.origin ?? '', '/',
  'François Vittecoq — Dev & orchestrateur IA | Claude Code · React · Agents IA',
  'Portfolio de François Vittecoq, développeur web et orchestrateur IA. Alternant dev IA, référent IA et formateur Claude Code chez LundiMatin (Montpellier). React, agents IA, automatisation, tests, sécurité.',
);

export default function Homepage() {

  return (
    <>
      <Hero />
      <div id="projets">
        {projects.map((project, index) => (
          <ProjectSection
            key={project.id}
            project={project}
            index={index}
          />
        ))}
      </div>
      <SkillsBento />
      <ParcoursTimeline />
      <Contact />
    </>
  );
}
