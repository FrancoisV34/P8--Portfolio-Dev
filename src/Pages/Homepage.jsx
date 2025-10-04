import React from 'react';
import '../Style/Homepage.scss';
import Project from '../Components/Project';
import presentation from '../Data/Presentation.json';
import Competences from '../Components/Competences';
import Parcours from '../Components/Parcours';
import ContactForm from '../Components/Form';

export default function Homepage() {
  return (
    <>
      <div className="portrait" id="accueil">
        <h1>
          Bienvenue sur mon <br />
          portfolio de developpeur.
          <br />
          Je suis François,
          <br />
          <strong className="blue-stronger">développeur web junior.</strong>
        </h1>
      </div>
      {presentation.map((presentation, index) => (
        <div className="homepage-pres" id="presentation" key={index}>
          <h2>Qui suis-je ?</h2>
          <p>{presentation.text}</p>
        </div>
      ))}
      <div className="homepage-projets" id="projets">
        <h2 className="mes-projets">Mes projets</h2>
        <section className="gallerie">
          {/*  <Gallerie />*/}
          <Project />
        </section>
      </div>
      <h3 className="comp-title">Mes compétences</h3>
      <section className="competences" id="competences">
        <div className="competences-list">
          <Competences />
        </div>
      </section>
      <section className="parcours" id="parcours">
        <Parcours />
      </section>

      <ContactForm />
    </>
  );
}
