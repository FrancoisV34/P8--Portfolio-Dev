import useReveal from '../../hooks/useReveal';
import '../../Style/Hero.scss';

export default function Hero() {
  const ref = useReveal(0.1);

  return (
    <section ref={ref} id="hero" className="hero">
      <div className="hero__grid" aria-hidden="true" />

      <div className="hero__inner">
        <p className="hero__eyebrow reveal">Portfolio — 2026</p>

        <p className="hero__name reveal">François Vittecoq</p>

        <h1 className="hero__title reveal">
          <span className="sr-only">François Vittecoq, </span>
          <span>Dev &amp;</span>
          <span>orchestrateur IA.</span>
        </h1>

        <p className="hero__sub reveal">
          Développeur React et orchestrateur d'agents IA. Alternant dev IA,
          référent IA et formateur Claude Code chez LundiMatin (Montpellier).
          Sécurité, tests de non-régression (unit, intégration, E2E) et best
          practices intégrés dès la conception.
        </p>

        <div className="hero__ctas reveal">
          <a
            href="#projets"
            className="btn btn--accent"
          >
            Voir mes projets
            <svg
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M7 17L17 7M17 7H7M17 7v10" />
            </svg>
          </a>
          <a
            href="#contact"
            className="btn btn--ghost"
          >
            Me contacter
          </a>
        </div>
      </div>

      <div className="hero__scroll-indicator" aria-hidden="true">
        <span>Scroll</span>
        <svg width="20" height="28" viewBox="0 0 20 28" fill="none">
          <rect
            x="1"
            y="1"
            width="18"
            height="26"
            rx="9"
            stroke="currentColor"
            strokeWidth="1.5"
            opacity="0.5"
          />
          <rect
            x="9"
            y="5"
            width="2"
            height="6"
            rx="1"
            fill="currentColor"
            className="scroll-dot"
          />
        </svg>
      </div>
    </section>
  );
}
