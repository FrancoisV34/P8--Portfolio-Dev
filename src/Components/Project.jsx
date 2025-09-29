import '../Style/Project.scss';

export default function Project() {
  return (
    <>
      <article>
        <div className="up">
          <i className="kasa-app"></i>
          <img
            src="/moi.webp"
            alt="Projet correspondant"
            className="cap-ecran-projet"
          />
          <div className="technos">
            Ceci sera l'emplacement des technos utilisées dans les projets
            présentés
          </div>
        </div>
        <div className="down">
          Ici seront présents 1 menu déroulant avec la descritpion du projet + 1
          menu lisatnt les compétences utilisées pour la réalisation du projet.
        </div>
      </article>
    </>
  );
}
