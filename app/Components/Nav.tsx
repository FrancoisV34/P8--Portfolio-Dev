import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import FVMono from './FVMono';
import '../Style/Nav.scss';

// `optional` : masqué sous 400 px quand le lien Blog s'ajoute, pour que la
// barre tienne sur 320 px. La section reste atteignable en faisant défiler.
const LINKS = [
  { label: 'Projets', id: 'projets' },
  { label: 'Compétences', id: 'competences' },
  { label: 'Parcours', id: 'parcours', optional: true },
  { label: 'Contact', id: 'contact' },
];

export default function Nav({ blog = false }: { blog?: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const [pastHero, setPastHero] = useState(false);
  const location = useLocation();
  const onHome = location.pathname === '/';

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 60);
      const hero = document.getElementById('hero');
      setPastHero(!hero || window.scrollY > hero.offsetHeight * 0.8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [location.pathname]);

  const onDark = !onHome ? false : !pastHero;


  return (
    <nav
      className={`site-nav ${scrolled ? 'is-scrolled' : ''} ${
        onDark ? 'on-dark' : 'on-light'
      }`}
    >
      <Link to="/" className="site-nav__brand" aria-label="Accueil">
        <FVMono size={32} light={!onDark} />
      </Link>

      <div className="site-nav__links">
        {LINKS.map((link) => (
          <Link
            key={link.id}
            to={`/#${link.id}`}
            className={`site-nav__link${blog && link.optional ? ' site-nav__link--optional' : ''}`}
          >
            {link.label}
          </Link>
        ))}
        {blog ? <Link to="/blog" className="site-nav__link">Blog</Link> : null}
        <Link to="/cv" className="site-nav__link site-nav__link--emphasis">
          CV
        </Link>
      </div>
    </nav>
  );
}
