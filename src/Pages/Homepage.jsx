import React from 'react';
import '../Style/Homepage.scss';
import ProjetOne from './ProjetOne';
import ProjetTwo from './ProjetTwo';

export default function Homepage() {
  return (
    <>
      <div className="portrait">
        <h1>
          Bienvenue sur mon <br />
          portfolio de developpeur.
          <br />
          Je suis François,
          <br />
          <strong className="blue-stronger">développeur web junior.</strong>
        </h1>
      </div>
      <div className="homepage-pres">
        <h2>Qui suis-je ?</h2>
        <p>Ici ma présentation et mes projets d'avenir.</p>
      </div>
      <div className="homepage-projets">
        <h2>Mes projets</h2>
        <ProjetOne />
        <ProjetTwo />
      </div>
    </>
  );
}
