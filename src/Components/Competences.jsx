import competences from '../Data/Competences.json';
import '../Style/Competences.scss';

export default function Competences() {
  return (
    <>
      {competences.map((competence) => (
        <ul>
          <li>
            <div className="competence">
              <img
                className="comp-logo"
                src={competence.logo}
                alt={competence.nom}
              ></img>
              <div className="competence-level">
                <div
                  className="level-bar"
                  style={{
                    width: competence.niveau,
                    backgroundColor: competence.color,
                  }}
                >
                  <span className="nameandlevel">
                    {competence.nom} : {competence.niveau}
                  </span>
                </div>
              </div>
            </div>
          </li>
        </ul>
      ))}
    </>
  );
}
