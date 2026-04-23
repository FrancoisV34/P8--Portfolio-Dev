import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();
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

  const handleAnchor = (id) => (e) => {
    e.preventDefault();
    if (!onHome) {
      navigate('/');
      setTimeout(() => {
        document
          .getElementById(id)
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
      return;
    }
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

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
          <a
            key={link.id}
            href={`#${link.id}`}
            onClick={handleAnchor(link.id)}
            className="site-nav__link"
          >
            {link.label}
          </a>
        ))}
        <Link to="/cv" className="site-nav__link site-nav__link--emphasis">
          CV
        </Link>
      </div>
    </nav>
  );
}
