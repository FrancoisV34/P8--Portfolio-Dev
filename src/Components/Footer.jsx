import React from 'react';
import '../Style/Footer.scss';

export default function Footer() {
  return (
    <footer>
      <div className="socials">
        <ul>
          <li>
            <a
              href="mailto:francois.vittecoq@osteopathe-eso.fr"
              aria-label="Envoyez moi un mail"
            >
              <i className="mail"></i>
            </a>
          </li>
          <li>
            <a
              href="https://www.linkedin.com/in/françois-vittecoq-689350307/"
              className="linkedIn"
              target="_blank"
              rel="noreferrer"
              aria-label="Lien vers mon LinkedIn"
            >
              <i className="linkedIn"></i>
            </a>
          </li>
          <li>
            <a
              href="https://github.com/FrancoisV34"
              target="_blank"
              rel="noreferrer"
              aria-label="Lien vers mon GitHub"
            >
              <i className="github"></i>
            </a>
          </li>
        </ul>
      </div>
      <p>&copy; 2025 François Vittecoq. Tous droits réservés.</p>
    </footer>
  );
}
