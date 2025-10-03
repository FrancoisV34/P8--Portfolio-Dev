import '../Style/Header.scss';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';

export default function Header() {
  const navigate = useNavigate();

  const handleScroll = (anchor) => (e) => {
    e.preventDefault();
    if (window.location.hash !== '#/') {
      navigate('/');

      setTimeout(() => {
        document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
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
            <Link to="/" onClick={handleScroll('accueil')}>
              Accueil
            </Link>
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
            <Link to="/cv">Mon CV</Link>
          </li>
        </ul>
      </nav>
    </header>
  );
}
