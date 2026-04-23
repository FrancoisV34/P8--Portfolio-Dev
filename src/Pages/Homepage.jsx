import React from 'react';
import projects from '../Data/Projects.json';
import Hero from '../Components/sections/Hero';
import ProjectSection from '../Components/sections/ProjectSection';
import SkillsBento from '../Components/sections/SkillsBento';
import ParcoursTimeline from '../Components/sections/ParcoursTimeline';
import Contact from '../Components/sections/Contact';

export default function Homepage() {
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
