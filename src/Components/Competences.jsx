import competences from '../Data/Competences.json';
import '../Style/Competences.scss';

export default function Competences() {
  return (
    <>
      <ul>
        {competences.map((competence, index) => (
          <li key={index}>
            <div className="competence">
              <img
                className="comp-logo"
                src={competence.logo}
                alt={competence.nom}
              ></img>
              <span className="nameandlevel">{competence.nom}</span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
