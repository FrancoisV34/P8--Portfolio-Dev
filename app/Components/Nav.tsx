import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import FVMono from './FVMono';
import '../Style/Nav.scss';

const LINKS = [
  { label: 'Projets', id: 'projets' },
  { label: 'Compétences', id: 'competences' },
  { label: 'Parcours', id: 'parcours' },
  { label: 'Contact', id: 'contact' },
];

export default function Nav() {
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
            className="site-nav__link"
          >
            {link.label}
          </Link>
        ))}
        <Link to="/cv" className="site-nav__link site-nav__link--emphasis">
          CV
        </Link>
      </div>
    </nav>
  );
}
