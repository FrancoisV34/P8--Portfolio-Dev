import '../Style/Header.scss';
import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function Header() {
  const navigate = useNavigate();

  const handleScroll = (anchor) => (e) => {
    e.preventDefault();
    if (window.location.pathname !== '/') {
      navigate('/');
      setTimeout(() => {
        document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    } else {
      document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header>
      <h1>
        <i className="fa-laptop"></i>François Vittecoq
      </h1>
      <nav>
        <ul>
          <li>
            <a href="/">Accueil</a>
          </li>
          <li>
            <a href="/#presentation" onClick={handleScroll('presentation')}>
              Présentation
            </a>
          </li>
          <li>
            <a href="/#projets" onClick={handleScroll('projets')}>
              Projets
            </a>
          </li>
          <li>
            <a href="/#competences" onClick={handleScroll('competences')}>
              Compétences
            </a>
          </li>
          <li>
            <a href="/#parcours" onClick={handleScroll('parcours')}>
              Parcours
            </a>
          </li>
          <li>
            <a href="/#contact" onClick={handleScroll('contact')}>
              Contact
            </a>
          </li>
          <li>
            <a href="/cv">Mon CV</a>
          </li>
        </ul>
      </nav>
    </header>
  );
}
