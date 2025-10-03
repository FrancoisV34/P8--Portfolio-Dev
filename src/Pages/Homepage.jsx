import React from 'react';
import '../Style/Homepage.scss';
import Project from '../Components/Project';
import presentation from '../Data/Presentation.json';
import Competences from '../Components/Competences';
import Parcours from '../Components/Parcours';

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
      <form action="" className="contact" id="contact">
        <label htmlFor="nom">Nom :</label>
        <input type="text" id="nom" placeholder="Votre nom :" />
        <label htmlFor="prenom">Prénom :</label>
        <input type="text" id="prenom" placeholder="Votre prénom :" />
        <label htmlFor="email">Email :</label>
        <input type="email" id="email" placeholder="Votre adresse mail :" />
        <label htmlFor="message">Message :</label>
        <textarea
          id="message"
          rows="5"
          placeholder="Je souhaite vous contacter pour [...] : (n'oubliez pas de dire bonjour 😁)"
        ></textarea>
        <button type="submit" className="submit-btn">
          Envoyer
        </button>
      </form>
    </>
  );
}
