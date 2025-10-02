import '../Style/Header.scss';
import React from 'react';

export default function Header() {
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
            <a href="#presentation">Présentation</a>
          </li>
          <li>
            <a href="#projets">Projets</a>
          </li>
          <li>
            <a href="/competences">compétences</a>
          </li>
          <li>
            <a href="/parcours">Parcours</a>
          </li>
          <li>
            <a href="/contact">Contact</a>
          </li>
          <li>
            <a href="/cv">Mon CV</a>
          </li>
        </ul>
      </nav>
    </header>
  );
}
