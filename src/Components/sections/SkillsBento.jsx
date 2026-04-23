import React from 'react';
import useReveal from '../../hooks/useReveal';
import '../../Style/SkillsBento.scss';

const SKILLS = [
  {
    name: 'Orchestration IA',
    desc: 'Agents autonomes, workflows automatisés, MCP, n8n',
    icon: '◐',
    large: true,
    accent: true,
  },
  {
    name: 'Claude Code',
    desc: 'Formateur interne · référent IA chez LundiMatin',
    icon: '✦',
    large: true,
  },
  {
    name: 'React',
    desc: 'Hooks, Context, Router, state management',
    icon: '⚛',
  },
  {
    name: 'JavaScript',
    desc: 'ES2024+, async/await, closures',
    icon: 'JS',
  },
  {
    name: 'Tests',
    desc: 'Unit · intégration · E2E · non-régression',
    icon: '◈',
    large: true,
  },
  {
    name: 'Sécurité',
    desc: 'OWASP, secure-by-default, revues',
    icon: '⊡',
  },
  {
    name: 'Best practices',
    desc: 'Clean code, revues, CI/CD, Git flow',
    icon: '✓',
  },
  {
    name: 'SASS / CSS',
    desc: 'Grid, Flexbox, custom properties, animations',
    icon: '</>',
  },
  {
    name: 'Accessibilité',
    desc: 'WCAG AA/AAA, focus, contrastes',
    icon: '♿',
  },
];

export default function SkillsBento() {
  const ref = useReveal(0.1);

  return (
    <section id="competences" ref={ref} className="skills-bento">
      <div className="skills-bento__inner">
        <p className="eyebrow reveal">Compétences</p>
        <h2 className="skills-bento__title reveal reveal-delay-1">
          Les outils avec lesquels je construis.
        </h2>

        <ul className="skills-bento__grid">
          {SKILLS.map((skill, i) => (
            <li
              key={skill.name}
              className={`skills-bento__card reveal ${
                skill.large ? 'is-large' : ''
              } ${skill.accent ? 'is-accent' : ''}`}
              style={{ transitionDelay: `${i * 60}ms` }}
            >
              <span className="skills-bento__icon">{skill.icon}</span>
              <h3 className="skills-bento__card-title">{skill.name}</h3>
              <p className="skills-bento__card-desc">{skill.desc}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
