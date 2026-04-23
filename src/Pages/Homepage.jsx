import React from 'react';
import projects from '../Data/Projects.json';
import useDocumentMeta from '../hooks/useDocumentMeta';
import Hero from '../Components/sections/Hero';
import ProjectSection from '../Components/sections/ProjectSection';
import SkillsBento from '../Components/sections/SkillsBento';
import ParcoursTimeline from '../Components/sections/ParcoursTimeline';
import Contact from '../Components/sections/Contact';

export default function Homepage() {
  useDocumentMeta({
    title:
      'François Vittecoq — Dev & orchestrateur IA | Claude Code · React · Agents IA',
    description:
      "Portfolio de François Vittecoq, développeur web et orchestrateur IA. Alternant dev IA, référent IA et formateur Claude Code chez LundiMatin (Montpellier). React, agents IA, automatisation, tests, sécurité.",
    canonical: 'https://francoisv34.github.io/P8--Portfolio-Dev/',
  });

  return (
    <>
      <Hero />
      <div id="projets">
        {projects.map((project, index) => (
          <ProjectSection
            key={project.id}
            id={index === 0 ? undefined : undefined}
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
