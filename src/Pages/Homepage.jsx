import React from 'react';
import '../Style/Homepage.scss';
import Project from '../Components/Project';
import presentation from '../Data/Presentation.json';

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
      {presentation.map((presentation) => (
        <div className="homepage-pres">
          <h2>Qui suis-je ?</h2>
          <p>{presentation.text}</p>
        </div>
      ))}
      <div className="homepage-projets">
        <h2>Mes projets</h2>
        <Project />
      </div>
    </>
  );
}
