import competences from '../Data/Competences.json';
import '../Style/Competences.scss';

export default function Competences() {
  return (
    <>
      <div className="banner">
        {competences.concat(competences).map((competence, index) => (
          <div className="competence" key={index}>
            <span className="nameandlevel">{competence.nom}</span>
            <img
              className="comp-logo"
              src={competence.logo}
              alt={competence.nom}
            ></img>
          </div>
        ))}
        {competences.concat(competences).map((competence, index) => (
          <div className="competence" key={index}>
            <span className="nameandlevel">{competence.nom}</span>
            <img
              className="comp-logo"
              src={competence.logo}
              alt={competence.nom}
            ></img>
          </div>
        ))}
      </div>
    </>
  );
}
